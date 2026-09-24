import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVudooCatalogUrl, fetchVudooXml, prepareVudooCatalog, normalizeVudooProduct } from '../src/vudooXml.js';
import { parseCatalogXml } from '../src/converter.js';
import { buildBasePayload, buildBaseUpdatePayload } from '../src/products.js';
import { catalogXml, itemXml, extraFields } from './fixtures/vudoo.js';

const source = { id: '389578', title: 'Prodotto test', price: '3.20 EUR' };
const config = {
  inventory: { inventory_id: 10 }, priceGroup: { price_group_id: 20, currency: 'EUR' },
  warehouse: { id: 'bl_30' }, extraFields: new Map(extraFields.map(field => [field.name, field])),
};
const full = () => prepareVudooCatalog(catalogXml()).products[0];

for (const [label, category] of [
  ['assente', null], ['vuota', '  '], ['No name', 'No name > No name'],
]) {
  test(`Vudoo XML: categoria ${label} senza g:id è escludibile senza bloccare il catalogo`, () => {
    const skipped = itemXml.replace('<g:id>389578</g:id>', '')
      .replace(/<g:product_type>.*?<\/g:product_type>/,
        category === null ? '' : `<g:product_type>${category}</g:product_type>`)
      .replace('<g:price>3.20 EUR</g:price>', '<g:price>non valido</g:price>');
    const catalog = prepareVudooCatalog(catalogXml(skipped), { skipMissingSourceCategory: true });
    assert.equal(catalog.products.length, 1);
    assert.equal(catalog.uniqueProducts.length, 0);
    assert.equal(catalog.products[0].id, undefined);
  });
}

test('Vudoo XML: g:id resta obbligatorio per prodotti con categoria reale', () => {
  const source = itemXml.replace('<g:id>389578</g:id>', '');
  assert.throws(() => prepareVudooCatalog(catalogXml(source),
    { skipMissingSourceCategory: true }), /SKU mancante/);
});

test('Vudoo XML: URL fisso, codice stringa con trim ed escaping, default centralizzati', () => {
  const url = buildVudooCatalogUrl('  azienda fittizia & ?  ');
  assert.equal(url.origin + url.pathname, 'https://www.vudoo.org/ProductCatalog.ashx');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    codiceAzienda: 'azienda fittizia & ?', idCategoria: '', disponibili: 'true', lingua: '1', listino: '6', risultati: '500',
  });
});

test('Vudoo XML: codice vuoto o non stringa rifiutato prima della rete', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('Rete vietata'); });
  for (const code of ['', '   ', null, undefined, 123]) await assert.rejects(fetchVudooXml(code), /Codice azienda/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('Vudoo XML: GET singola senza token, timeout e redirect protetti', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, request) => {
    assert.equal(url.searchParams.get('codiceAzienda'), 'test-only-company');
    assert.equal(request.method, 'GET');
    assert.equal(request.headers, undefined);
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal instanceof AbortSignal);
    return new Response(catalogXml(), { headers: { 'content-type': 'application/xml' } });
  });
  assert.equal(await fetchVudooXml('test-only-company'), catalogXml());
  assert.equal(fetch.mock.callCount(), 1);
});

for (const [name, response, message] of [
  ['HTTP', () => new Response('error', { status: 503 }), /HTTP 503/],
  ['HTML', () => new Response('<html>error</html>', { headers: { 'content-type': 'text/html' } }), /HTML/],
  ['vuota', () => new Response('  '), /vuoto/],
]) {
  test(`Vudoo XML: risposta ${name} ferma il fetch senza retry`, async t => {
    const fetch = t.mock.method(globalThis, 'fetch', response);
    await assert.rejects(fetchVudooXml('test-only-company'), message);
    assert.equal(fetch.mock.callCount(), 1);
  });
}

test('Vudoo XML: errore rete non stampa URL/codice e non ritenta', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('private-company-url'); });
  await assert.rejects(fetchVudooXml('test-only-company'), error => /rete/.test(error.message) && !/private/.test(error.message));
  assert.equal(fetch.mock.callCount(), 1);
});

for (const phase of ['richiesta', 'body']) {
  test(`Vudoo XML: timeout ${phase} senza attesa reale`, async t => {
    const controller = new AbortController();
    t.mock.method(AbortSignal, 'timeout', () => controller.signal);
    const fail = () => { controller.abort(); throw new Error('aborted'); };
    t.mock.method(globalThis, 'fetch', phase === 'richiesta' ? fail : async () => ({ ok: true, headers: new Headers(), text: fail }));
    await assert.rejects(fetchVudooXml('test-only-company'), /timeout/);
  });
}

for (const [label, xml] of [
  ['vuoto', ''], ['malformato', '<rss>'], ['HTML senza content type', '<html><body>error</body></html>'],
  ['DOCTYPE', '<!DOCTYPE html><html/>'], ['channel assente', '<rss/>'],
  ['item assente', '<rss><channel/></rss>'], ['item vuoto', catalogXml('<item/>')],
]) {
  test(`Vudoo XML: rifiuta catalogo ${label}`, () => assert.throws(() => prepareVudooCatalog(xml)));
}

test('Vudoo XML: un item, namespace, Unicode, shipping e immagini ripetute preservati', () => {
  const [product] = parseCatalogXml(catalogXml());
  assert.equal(product.id, '389578');
  assert.equal(product.sku, 'HKZDVHCW');
  assert.equal(product.size, '3000 ml.');
  assert.equal(product.color, 'Bottone Oro');
  assert.equal(product.price, '3.20 EUR');
  assert.equal(product.shipping.price, '8.40 EUR');
  assert.equal(product.description, 'Descrizione è Unicode ✨ 💧');
  assert.deepEqual(product.additional_image_link, ['https://example.com/extra1.jpg', 'https://example.com/extra2.jpg']);
});

test('Vudoo XML: più item e dedup deterministica sullo stock effettivo', () => {
  const two = catalogXml(itemXml + itemXml.replace('<g:id>389578</g:id>', '<g:id>389579</g:id>'));
  assert.equal(prepareVudooCatalog(two).products.length, 2);
  assert.equal(prepareVudooCatalog(catalogXml(itemXml + itemXml)).uniqueProducts.length, 1);
  const different = itemXml.replace('<g:quantity>234</g:quantity>', '<g:quantity>50</g:quantity>');
  for (const items of [itemXml + different, different + itemXml]) assert.throws(() => prepareVudooCatalog(catalogXml(items)), /discordanti/);
});

test('Vudoo XML: dati originali separati, SKU da id e titolo con brand non duplicato', () => {
  const product = full();
  assert.equal(product.sku, '389578');
  assert.equal(product.vudoo_sku, 'HKZDVHCW');
  assert.equal(product.title, 'Prodotto test - Marca - 3000 ml. - Bottone Oro');
  assert.equal(product.source.title, 'Prodotto test');
  assert.equal(product.original_title, 'Prodotto test');
  assert.equal(normalizeVudooProduct({ ...source, title: 'Prodotto test - Marca', brand: 'Marca' }).title, 'Prodotto test - Marca');
  assert.equal(normalizeVudooProduct(source).title, source.title);
});

test('Vudoo XML: size numerica nel feed resta una stringa', () => {
  const sourceProduct = parseCatalogXml(catalogXml(itemXml.replace('<g:size>3000 ml.</g:size>', '<g:size>48</g:size>')))[0];
  const product = normalizeVudooProduct(sourceProduct);
  assert.equal(typeof product.size, 'string');
  assert.equal(product.size, '48');
  assert.equal(product.features.Size, '48');
});

test('Vudoo XML: stesso Vudoo SKU con id diversi produce prodotti Base indipendenti', () => {
  const second = itemXml
    .replace('<g:id>389578</g:id>', '<g:id>389577</g:id>')
    .replace('<g:size>3000 ml.</g:size>', '<g:size>250 ml.</g:size>')
    .replace('<g:price>3.20 EUR</g:price>', '<g:price>45.00 EUR</g:price>');
  const catalog = prepareVudooCatalog(catalogXml(itemXml + second));
  assert.deepEqual(catalog.uniqueProducts.map(product => product.sku), ['389578', '389577']);
  assert.deepEqual(catalog.uniqueProducts.map(product => product.features['Vudoo SKU']), ['HKZDVHCW', 'HKZDVHCW']);
  assert.equal(catalog.duplicatesMap.size, 0);
});

test('Vudoo XML: stesso id equivalente viene deduplicato, discordante viene bloccato in ogni ordine', () => {
  assert.equal(prepareVudooCatalog(catalogXml(itemXml + itemXml)).uniqueProducts.length, 1);
  const conflict = itemXml.replace('<g:color>Bottone Oro</g:color>', '<g:color>Bottone Argento</g:color>');
  assert.throws(() => prepareVudooCatalog(catalogXml(itemXml + conflict)), /discordanti/);
  assert.throws(() => prepareVudooCatalog(catalogXml(conflict + itemXml)), /discordanti/);
});

for (const [values, expected] of [
  [{ brand: 'Brand XYZ', size: '48', color: 'Bottone Oro' }, 'Prodotto test - Brand XYZ - 48 - Bottone Oro'],
  [{ brand: 'Brand XYZ', size: '48' }, 'Prodotto test - Brand XYZ - 48'],
  [{ brand: 'Brand XYZ', color: 'Bottone Oro' }, 'Prodotto test - Brand XYZ - Bottone Oro'],
  [{ brand: 'Brand XYZ' }, 'Prodotto test - Brand XYZ'],
]) {
  test(`Vudoo XML: titolo compone solo i componenti presenti (${expected})`, () => {
    const product = normalizeVudooProduct({ ...source, ...values });
    assert.equal(product.title, expected);
    assert.equal(product.original_title, 'Prodotto test');
    assert.doesNotMatch(product.title, /undefined|null| -  - /);
  });
}

for (const [values, expected] of [
  [{ sku: 'CHISBZWV', size: '48', color: 'Bottone Oro' }, { 'Vudoo SKU': 'CHISBZWV', Size: '48', Color: 'Bottone Oro' }],
  [{ sku: 'CHISBZWV', size: '48' }, { 'Vudoo SKU': 'CHISBZWV', Size: '48' }],
  [{ sku: 'CHISBZWV', color: 'Bottone Oro' }, { 'Vudoo SKU': 'CHISBZWV', Color: 'Bottone Oro' }],
  [{}, {}],
]) {
  test(`Vudoo XML: Parameters configurazione ${JSON.stringify(expected)}`, () => {
    const product = normalizeVudooProduct({ ...source, ...values });
    assert.deepEqual(product.features, expected);
    assert.equal(product.sku, '389578');
  });
}

test('Vudoo XML: brand e percorso categorie conservati, virgola non separata', () => {
  assert.equal(full().brand, 'Marca');
  assert.equal(full().product_type, 'Vini, Gastronomia > Birra > Birra Artigianale');
});

test('Vudoo XML: price di vendita separato da sale price e shipping price', () => {
  const product = full();
  const payload = buildBasePayload(product, config);
  assert.equal(payload.prices[20], 3.2);
  assert.equal(product.sale_price, 2.9);
  assert.equal(product.shipping.price, 8.4);
  assert.equal(payload.text_fields.extra_field_101, 2.9);
  assert.equal(payload.text_fields.extra_field_106, 8.4);
});

for (const [tax, expected] of [[10, 10], ['20', 20], ['22', 22], [0, 0], [undefined, 22], ['', 22], [null, 22]]) {
  test(`Vudoo XML: IVA ${String(tax)} produce ${expected}`, () => {
    const product = normalizeVudooProduct({ ...source, tax_rate: tax });
    assert.equal(buildBasePayload(product, config).tax_rate, expected);
  });
}

for (const [values, expected] of [
  [{ quantity: 50 }, 50], [{ quantity: '234' }, 234], [{ quantity: 999 }, 999],
  [{ quantity: 0 }, 0], [{ quantity: 50, availability: 'out of stock' }, 50],
  [{ availability: 'in stock' }, 10], [{ availability: 'out of stock' }, 0],
  [{ quantity: '', availability: 'in stock' }, 10], [{ quantity: null, availability: 'in stock' }, 10],
  [{ availability: 'unknown' }, undefined],
]) {
  test(`Vudoo XML: stock ${JSON.stringify(values)} = ${expected}`, () => {
    const product = normalizeVudooProduct({ ...source, ...values });
    assert.equal(product.quantity, expected);
    assert.equal(buildBasePayload(product, config).stock?.bl_30, expected);
  });
}

for (const unit of ['kg', 'Kg', 'KG']) {
  test(`Vudoo XML: peso ${unit} e shipping weight distinti`, () => {
    const product = normalizeVudooProduct({ ...source, weight: `0.5 ${unit}`, shipping_weight: `0.7 ${unit}` });
    assert.equal(product.weight, 0.5);
    assert.equal(product.features['Shipping Weight (kg)'], '0.7');
  });
}

for (const [xmlField, field, expected] of [['conf_alt', 'height', 10], ['conf_lar', 'width', 20], ['conf_lun', 'length', 30]]) {
  test(`Vudoo XML: ${xmlField} → ${field} standard cm`, () => assert.equal(buildBasePayload(full(), config)[field], expected));
}

for (const [label, dimensions, expected] of [
  ['tutte valide', { conf_alt: '25', conf_lar: '20', conf_lun: '30' }, [25, 20, 30]],
  ['tutte assenti', {}, [15, 15, 15]],
  ['una valida e due assenti', { conf_alt: '25' }, [25, 15, 15]],
  ['zero', { conf_alt: 0, conf_lar: 0, conf_lun: 0 }, [15, 15, 15]],
  ['negative', { conf_alt: -1, conf_lar: -2, conf_lun: -3 }, [15, 15, 15]],
  ['vuote', { conf_alt: '', conf_lar: ' ', conf_lun: null }, [15, 15, 15]],
  ['non numeriche', { conf_alt: 'alto', conf_lar: [], conf_lun: {} }, [15, 15, 15]],
]) {
  test(`Vudoo XML: dimensioni ${label} applicano il fallback indipendente`, () => {
    const payload = buildBasePayload(normalizeVudooProduct({ ...source, ...dimensions }), config);
    assert.deepEqual([payload.height, payload.width, payload.length], expected);
  });
}

for (let index = 1; index <= 4; index++) {
  test(`Vudoo XML: bullet${index} → description_extra${index}`, () => {
    const product = full();
    assert.equal(buildBasePayload(product, config).text_fields[`description_extra${index}`], product.source[`bullet${index}`]);
  });
}

for (const [name, expected] of [['MPN', 'MANUFACTURER-PART'], ['Condition', 'new'], ['Pickup SLA', 'same day'], ['Item Group ID', 'GROUP-A'], ['Shipping Weight (kg)', '0.7'], ['Vudoo SKU', 'HKZDVHCW'], ['Size', '3000 ml.'], ['Color', 'Bottone Oro']]) {
  test(`Vudoo XML: Parameter ${name} preservato`, () => assert.equal(buildBasePayload(full(), config).text_fields.features[name], expected));
}

for (const [name, expected] of [
  ['Vudoo Product URL', 'https://example.com/product'], ['Vudoo Original Title', 'Prodotto test'],
  ['Shipping Country', 'IT'], ['Shipping Service', 'Standard'], ['Additional description 5', 'Cinque'],
]) {
  test(`Vudoo XML: Additional Field ${name}`, () => {
    const field = config.extraFields.get(name);
    assert.equal(buildBasePayload(full(), config).text_fields[`extra_field_${field.extra_field_id}`], expected);
  });
}

test('Vudoo XML: descrizione tecnicamente sanitizzata e sola immagine principale', () => {
  const product = full();
  const payload = buildBasePayload(product, config);
  assert.equal(payload.text_fields.description, 'Descrizione è Unicode ✨');
  assert.deepEqual(payload.images, { 0: 'url:https://example.com/main.jpg' });
  assert.equal(product.source.additional_image_link.length, 2);
  assert.equal(payload.parent_id, undefined);
});

test('Vudoo XML: opzionali vuoti non generano cancellazioni o valori inventati', () => {
  const product = normalizeVudooProduct({ ...source, sku: '', size: '', color: '', image_link: '', sale_price: '', weight: '', bullet1: '', bullet5: '', mpn: '', item_group_id: '', shipping: { price: '', country: '', service: '' } });
  const payload = buildBasePayload(product, config);
  assert.equal(payload.images, undefined);
  assert.equal(payload.text_fields.features, undefined);
  assert.equal(payload.text_fields.description_extra1, undefined);
  assert.equal(payload.text_fields.extra_field_106, undefined);
  assert.equal(product.vudoo_sku, undefined);
  assert.equal(product.size, undefined);
  assert.equal(product.color, undefined);
  assert.equal(product.mpn, undefined);
  assert.equal(product.item_group_id, undefined);
});

test('Vudoo XML: prezzo supporta punto e virgola decimale', () => {
  assert.equal(normalizeVudooProduct({ ...source, price: '390.00 EUR' }).price, 390);
  assert.equal(normalizeVudooProduct({ ...source, price: ' 15,90 EUR ' }).price, 15.9);
});

test('Vudoo XML: EAN assente resta opzionale e non viene inventato', () => {
  const product = normalizeVudooProduct({ ...source, sku: 'CHISBZWV' });
  assert.equal(product.ean, undefined);
  assert.equal(buildBasePayload(product, config).ean, undefined);
});

test('Vudoo XML: EAN valido viene conservato nel payload Base', () => {
  const product = normalizeVudooProduct({ ...source, ean: '8009513003852' });
  assert.equal(product.ean, '8009513003852');
  assert.equal(buildBasePayload(product, config).ean, '8009513003852');
});

test('Vudoo XML: EAN vuoto viene omesso senza warning', () => {
  for (const ean of ['', '   ']) {
    const xml = catalogXml(itemXml.replace('<g:id>389578</g:id>', `<g:id>389578</g:id><g:ean>${ean}</g:ean>`));
    const catalog = prepareVudooCatalog(xml);
    assert.equal(catalog.products[0].ean, undefined);
    assert.equal(buildBasePayload(catalog.products[0], config).ean, undefined);
    assert.deepEqual(catalog.eanWarnings, []);
  }
});

test('Vudoo XML: EAN malformato viene omesso e registrato senza alterare il valore originale', () => {
  for (const ean of ['8056370403714-', ' 8009513003852 ']) {
    const xml = catalogXml(itemXml.replace('<g:id>389578</g:id>', `<g:id>389578</g:id><g:ean>${ean}</g:ean>`));
    const catalog = prepareVudooCatalog(xml);
    const product = catalog.products[0];
    assert.equal(catalog.uniqueProducts.length, 1);
    assert.equal(product.ean, undefined);
    assert.equal(product.source.ean, ean);
    assert.equal(buildBasePayload(product, config).ean, undefined);
    assert.deepEqual(catalog.eanWarnings, [{ id: '389578', sku: 'HKZDVHCW', title: 'Prodotto test', originalEan: ean }]);
  }
});

test('Vudoo XML: EAN malformato non cancella un EAN già presente su Base', () => {
  const product = normalizeVudooProduct({ ...source, ean: '8056370403714-' });
  const existing = { ...buildBasePayload(product, config), sku: product.sku, ean: '8009513003852' };
  assert.equal(buildBaseUpdatePayload(product, existing, config)?.ean, undefined);
});

for (const invalid of [
  { quantity: 'abc' }, { quantity: -1 }, { price: 'invalid' }, { tax_rate: 'abc' }, { tax_rate: 101 },
  { weight: '5 lb' }, { bullet1: [] }, { shipping: [] },
]) {
  test(`Vudoo XML: campo invalido ${JSON.stringify(invalid)} bloccato`, () => assert.throws(() => normalizeVudooProduct({ ...source, ...invalid })));
}

test('Vudoo XML: UPDATE dei nuovi campi selettivo, idempotente e conserva Parameters esterni', () => {
  const product = full();
  const payload = buildBasePayload(product, config);
  const existing = { ...payload, images: { 1: product.image_link }, text_fields: { ...payload.text_fields, features: { ...payload.text_fields.features, Esterno: 'conservare' } } };
  assert.equal(buildBaseUpdatePayload(product, existing, config), null);
  const changed = { ...product, tax_rate: 22, features: { ...product.features, MPN: 'NEW-MPN' } };
  const update = buildBaseUpdatePayload(changed, existing, config);
  assert.equal(update.tax_rate, 22);
  assert.equal(update.text_fields.features.MPN, 'NEW-MPN');
  assert.equal(update.text_fields.features.Esterno, 'conservare');
  assert.equal(update.stock, undefined);
  assert.equal(update.prices, undefined);
});

test('Vudoo XML: Vudoo SKU Base incompatibile blocca UPDATE, assente sui legacy non blocca', () => {
  const product = full();
  const payload = buildBasePayload(product, config);
  const existing = { ...payload, images: { 1: product.image_link }, text_fields: { ...payload.text_fields, features: { ...payload.text_fields.features, 'Vudoo SKU': 'ALTRO' } } };
  assert.throws(() => buildBaseUpdatePayload(product, existing, config), /Vudoo SKU incompatibile/);
  const legacy = { ...existing, text_fields: { ...existing.text_fields, features: { MPN: product.features.MPN } } };
  assert.ok(buildBaseUpdatePayload(product, legacy, config).text_fields.features);
});

test('Vudoo XML: campi aggiuntivi mancanti, troppo lunghi o tipo Number errato fermano il payload', () => {
  assert.throws(() => buildBasePayload(full(), { ...config, extraFields: new Map() }), /non risolto/);
  const fields = new Map(config.extraFields);
  fields.set('Vudoo Original Title', { ...fields.get('Vudoo Original Title'), kind: 0 });
  assert.throws(() => buildBasePayload(normalizeVudooProduct({ ...source, title: 'a'.repeat(201) }), { ...config, extraFields: fields }), /troppo lungo/);
  fields.set('Vudoo Original Title', { ...fields.get('Vudoo Original Title'), editor_type: 'number' });
  assert.throws(() => buildBasePayload(normalizeVudooProduct(source), { ...config, extraFields: fields }), /numerico non valido/);
});
