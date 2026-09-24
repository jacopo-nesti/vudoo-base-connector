import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogXml, itemXml, extraFields } from './fixtures/vudoo.js';
import { prepareVudooCatalog } from '../src/vudooXml.js';
import { buildBasePayload, buildBaseUpdatePayload } from '../src/products.js';
import {
  analyzeCatalogCategories,
  formatUnmappedCategoryError,
  validateCategoryMappings,
} from '../src/categoryNormalizer.js';

const config = {
  inventory: { inventory_id: 10 },
  priceGroup: { price_group_id: 20, currency: 'EUR' },
  warehouse: { id: 'bl_30' },
  extraFields: new Map(extraFields.map(field => [field.name, field])),
};

const mappings = validateCategoryMappings({
  canonical: { BEER: { base_path: ['Alimentari', 'Birra'] } },
  suppliers: {
    TEST_SUPPLIER: {
      source_titles: ['Test Supplier'],
      categories: {
        'Vini, Gastronomia > Birra > Birra Artigianale': 'BEER',
        'Seconda categoria': 'BEER',
        'Categoria in bozza': null,
      },
    },
  },
});

function item(fields = {}) {
  let xml = itemXml;
  for (const [tag, value] of Object.entries(fields)) {
    const pattern = new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`);
    const element = value == null ? '' : `<${tag}>${value}</${tag}>`;
    xml = pattern.test(xml) ? xml.replace(pattern, element) : xml.replace('</item>', `${element}</item>`);
  }
  return xml;
}

function catalog(items, title = 'Test Supplier') {
  return catalogXml(items).replace('<title>Test Supplier</title>', `<title>${title}</title>`);
}

function prepared(fields = {}) {
  return prepareVudooCatalog(catalog(item(fields)), { skipMissingSourceCategory: true });
}

function product(fields = {}) {
  return prepared(fields).uniqueProducts[0];
}

function categoryAnalysis(items, title = 'Test Supplier') {
  const source = prepareVudooCatalog(catalog(items, title), { skipMissingSourceCategory: true });
  return analyzeCatalogCategories(source, mappings);
}

test('[CONTINUE] g:id valido resta la chiave tecnica, g:sku può mancare', () => {
  const result = product({ 'g:sku': null });
  const payload = buildBasePayload(result, config);
  assert.equal(payload.sku, '389578');
  assert.equal(result.vudoo_sku, undefined);
  assert.equal(payload.text_fields.features['Vudoo SKU'], undefined);
});

test('[BLOCK] g:id mancante su prodotto importabile ferma il catalogo', () => {
  assert.throws(() => prepared({ 'g:id': null }), /record 1:.*SKU mancante/);
});

for (const sourceCategory of [null, '', '  ', 'No name > No name']) {
  test(`[SKIP] g:id mancante con categoria sorgente ${JSON.stringify(sourceCategory)} non blocca`, () => {
    const feed = prepared({ 'g:id': null, 'g:product_type': sourceCategory, 'g:price': 'non valido' });
    const analysis = analyzeCatalogCategories(feed, mappings);
    assert.equal(feed.uniqueProducts.length, 0);
    assert.equal(analysis.missingSourceCategoryProducts, 1);
    assert.equal(analysis.missingSourceCategoryUnrecordableProducts, 1);
    assert.equal(analysis.importableProducts, 0);
  });
}

test('[CONTINUE] g:id duplicato equivalente viene deduplicato', () => {
  const feed = prepareVudooCatalog(catalog(item() + item()));
  assert.equal(feed.products.length, 2);
  assert.equal(feed.uniqueProducts.length, 1);
  assert.equal(feed.duplicatesMap.get('389578'), 2);
});

test('[BLOCK] g:id duplicato con prezzo discordante non sceglie il primo record', () => {
  const different = item({ 'g:price': '9.90 EUR' });
  for (const items of [item() + different, different + item()]) {
    assert.throws(() => prepareVudooCatalog(catalog(items)), /SKU duplicato 389578.*discordanti: price/);
  }
});

test('[CONTINUE] categorie sorgente diverse possono usare lo stesso percorso canonico', () => {
  const analysis = categoryAnalysis(item() + item({ 'g:id': '389579', 'g:product_type': 'Seconda categoria' }));
  assert.equal(analysis.importableProducts, 2);
  assert.equal(analysis.mappedCount, 2);
  assert.deepEqual(analysis.mappedProducts.map(entry => entry.base_category_path), [
    ['Alimentari', 'Birra'], ['Alimentari', 'Birra'],
  ]);
});

test('[BLOCK] categoria reale senza mapping produce un errore operativo distinto da No name', () => {
  const analysis = categoryAnalysis(item({ 'g:product_type': 'Categoria non configurata' })
    + item({ 'g:id': '389579', 'g:product_type': 'No name > No name' }));
  assert.equal(analysis.unmappedValidCategoryProducts, 1);
  assert.equal(analysis.missingSourceCategoryProducts, 1);
  assert.equal(analysis.mappedProducts.length, 0);
  assert.match(formatUnmappedCategoryError(analysis, 'block'), /Categoria non configurata: 1 prodotti/);
});

test('[SKIP] categoria reale senza mapping resta fuori dai prodotti importabili', () => {
  const analysis = categoryAnalysis(item({ 'g:product_type': 'Categoria non configurata' })
    + item({ 'g:id': '389579', 'g:product_type': 'Seconda categoria' }));
  assert.equal(analysis.unmappedProducts.length, 1);
  assert.deepEqual(analysis.mappedProducts.map(entry => entry.sku), ['389579']);
});

test('[SKIP] categoria configurata con null esclude solo il prodotto interessato', () => {
  const analysis = categoryAnalysis(item({ 'g:product_type': 'Categoria in bozza' })
    + item({ 'g:id': '389579', 'g:product_type': 'Seconda categoria' }));
  assert.equal(analysis.unmappedCount, 1);
  assert.equal(analysis.unmappedProducts.length, 1);
  assert.deepEqual(analysis.mappedProducts.map(entry => entry.sku), ['389579']);
});

test('[CONTINUE] titolo supplier con spazi e case diversi risolve lo stesso profilo', () => {
  const analysis = categoryAnalysis(item(), '  TEST   supplier  ');
  assert.equal(analysis.supplier.id, 'TEST_SUPPLIER');
  assert.equal(analysis.importableProducts, 1);
});

test('[BLOCK] source title ambiguo, canonical inesistente e base_path invalido falliscono prima dell’import', () => {
  const original = {
    canonical: { BEER: { base_path: ['Alimentari', 'Birra'] } },
    suppliers: { A: { source_titles: ['Test Supplier'], categories: { Birra: 'BEER' } } },
  };
  const ambiguous = structuredClone(original);
  ambiguous.suppliers.B = { source_titles: [' test   supplier '], categories: {} };
  assert.throws(() => validateCategoryMappings(ambiguous), /Source title ambiguo/);
  const unknownCanonical = structuredClone(original);
  unknownCanonical.suppliers.A.categories.Birra = 'UNKNOWN';
  assert.throws(() => validateCategoryMappings(unknownCanonical), /canonical .*non definita/);
  const invalidPath = structuredClone(original);
  invalidPath.canonical.BEER.base_path = [];
  assert.throws(() => validateCategoryMappings(invalidPath), /base_path/);
});

test('[CONTINUE] EAN valido, assente e vuoto seguono il payload atteso', () => {
  assert.equal(buildBasePayload(product({ 'g:ean': '8009513003852' }), config).ean, '8009513003852');
  for (const ean of [null, '', '  ']) {
    const feed = prepared({ 'g:ean': ean });
    assert.equal(buildBasePayload(feed.uniqueProducts[0], config).ean, undefined);
    assert.deepEqual(feed.eanWarnings, []);
  }
});

for (const invalid of ['8056370403714-', '12345A7890123', '1234567', '123456789012345']) {
  test(`[WARNING] EAN ${invalid} non blocca, non viene corretto e non cancella Base`, () => {
    const feed = prepared({ 'g:ean': invalid });
    const current = feed.uniqueProducts[0];
    const payload = buildBasePayload(current, config);
    assert.equal(payload.ean, undefined);
    assert.equal(current.source.ean, invalid);
    assert.equal(feed.eanWarnings.length, 1);
    assert.equal(feed.eanWarnings[0].originalEan, invalid);
    const existing = { ...payload, ean: '8009513003852', images: { 1: current.image_link } };
    assert.equal(buildBaseUpdatePayload(current, existing, config), null);
  });
}

for (const [value, expected] of [['15.90 EUR', 15.9], ['15,90 EUR', 15.9], ['0 EUR', 0]]) {
  test(`[CONTINUE] prezzo ${value} viene inviato senza reinterpretazioni`, () => {
    assert.equal(buildBasePayload(product({ 'g:price': value }), config).prices[20], expected);
  });
}

for (const value of [null, '-1 EUR', 'non numerico EUR']) {
  test(`[BLOCK] prezzo ${JSON.stringify(value)} segue la validazione esistente`, () => {
    assert.throws(() => prepared({ 'g:price': value }), /Prezzo mancante|price/);
  });
}

test('[CONTINUE] sale_price assente non sostituisce il prezzo di vendita', () => {
  const payload = buildBasePayload(product({ 'g:sale_price': null }), config);
  assert.equal(payload.prices[20], 3.2);
  assert.equal(payload.text_fields.extra_field_101, undefined);
});

test('[BLOCK] sale_price malformato conserva la policy attuale', () => {
  assert.throws(() => prepared({ 'g:sale_price': 'non numerico' }), /sale_price/);
});

for (const [quantity, availability, expected] of [
  ['25', 'out of stock', 25], ['0', 'in stock', 0], [null, 'in stock', 10], [null, 'out of stock', 0],
]) {
  test(`[CONTINUE] quantity ${quantity} e availability ${availability} producono stock ${expected}`, () => {
    assert.equal(buildBasePayload(product({ 'g:quantity': quantity, 'g:availability': availability }), config).stock.bl_30, expected);
  });
}

for (const quantity of ['-1', 'non numerica']) {
  test(`[BLOCK] quantity ${quantity} non usa il fallback availability`, () => {
    assert.throws(() => prepared({ 'g:quantity': quantity, 'g:availability': 'in stock' }), /quantity/);
  });
}

test('[CONTINUE] dimensioni valide restano distinte, fallback 15 si applica a ogni campo separatamente', () => {
  for (const [raw, expected] of [['25', 25], ['0', 15], ['-3', 15], ['non numerico', 15], [null, 15]]) {
    const payload = buildBasePayload(product({ conf_alt: '12', conf_lar: raw, conf_lun: '30' }), config);
    assert.deepEqual([payload.height, payload.width, payload.length], [12, expected, 30]);
  }
});

test('[CONTINUE] weight assente omette il campo standard', () => {
  assert.equal(buildBasePayload(product({ 'g:weight': null }), config).weight, undefined);
});

for (const [field, value] of [['g:weight', '0.5 lb'], ['g:shipping_weight', '0.7 lb']]) {
  test(`[BLOCK] ${field} malformato mantiene la policy attuale`, () => {
    assert.throws(() => prepared({ [field]: value }), new RegExp(field.slice(2)));
  });
}

for (const size of ['48', '3000 ml.', 'Refill 500ml.', 'XL']) {
  test(`[CONTINUE] size ${size} resta testo nel Parameter`, () => {
    const current = product({ 'g:size': size });
    assert.equal(current.size, size);
    assert.equal(buildBasePayload(current, config).text_fields.features.Size, size);
  });
}

test('[CONTINUE] size/color vuoti omessi; color XML escapato viene decodificato', () => {
  const empty = buildBasePayload(product({ 'g:size': '', 'g:color': '' }), config);
  assert.equal(empty.text_fields.features.Size, undefined);
  assert.equal(empty.text_fields.features.Color, undefined);
  const escaped = product({ 'g:color': 'Oudh &amp; Wood' });
  assert.equal(escaped.color, 'Oudh & Wood');
  assert.equal(buildBasePayload(escaped, config).text_fields.features.Color, 'Oudh & Wood');
});

test('[CONTINUE] title e description lunghi producono payload senza crash né perdita del sorgente', () => {
  const title = 'T'.repeat(5000);
  const description = 'Descrizione ✨ e testo lungo. '.repeat(500);
  const current = product({ title, description });
  const payload = buildBasePayload(current, config);
  assert.equal(current.source.title, title);
  assert.equal(payload.text_fields.name, `${title} - Marca - 3000 ml. - Bottone Oro`);
  assert.equal(payload.text_fields.description, description);
});

test('[BLOCK] ampersand XML non escapato viene rifiutato con posizione diagnostica', () => {
  assert.throws(() => prepared({ 'g:color': 'Oudh & Wood' }), error =>
    /XML non valido/.test(error.message) && /&/.test(error.message) && /riga/.test(error.message));
});

test('[BLOCK] chiusura XML mancante viene rifiutata con posizione diagnostica', () => {
  const xml = catalog(item().replace('</g:color>', ''));
  assert.throws(() => prepareVudooCatalog(xml), /XML non valido.*riga/);
});

test('[CONTINUE] immagine principale valida inviata; assente omessa; immagini aggiuntive solo preservate', () => {
  const current = product();
  assert.deepEqual(buildBasePayload(current, config).images, { 0: 'url:https://example.com/main.jpg' });
  assert.equal(current.source.additional_image_link.length, 2);
  const missing = product({ 'g:image_link': null });
  assert.equal(buildBasePayload(missing, config).images, undefined);
});

test('[BLOCK] URL immagine malformato conserva la policy attuale', () => {
  assert.throws(() => prepared({ 'g:image_link': 'non-url' }), /URL immagine non valido/);
});

test('[CONTINUE] MPN e brand assenti non vengono inventati; brand valido resta disponibile', () => {
  const current = product({ 'g:mpn': null, 'g:brand': null });
  const payload = buildBasePayload(current, config);
  assert.equal(payload.text_fields.features.MPN, undefined);
  assert.equal(current.brand, undefined);
  assert.equal(current.manufacturer_id, undefined);
  assert.equal(current.title, 'Prodotto test - 3000 ml. - Bottone Oro');
  assert.equal(product().brand, 'Marca');
});

test('[CONTINUE] aliquota presente resta invariata; assente usa 22', () => {
  assert.equal(buildBasePayload(product({ 'g:tax_rate': '10' }), config).tax_rate, 10);
  assert.equal(buildBasePayload(product({ 'g:tax_rate': null }), config).tax_rate, 22);
});

test('[BLOCK] aliquota non numerica conserva la policy attuale', () => {
  assert.throws(() => prepared({ 'g:tax_rate': 'non numerica' }), /tax_rate/);
});

test('[CONTINUE] shipping.price valido e zero sono distinti da shipping assente', () => {
  const zero = product({ 'g:shipping': '<g:country>IT</g:country><g:service>Standard</g:service><g:price>0 EUR</g:price>' });
  assert.equal(buildBasePayload(zero, config).text_fields.extra_field_106, 0);
  const missing = product({ 'g:shipping': null });
  assert.equal(buildBasePayload(missing, config).text_fields.extra_field_106, undefined);
  assert.equal(buildBasePayload(product(), config).text_fields.extra_field_106, 8.4);
});

test('[BLOCK] shipping.price malformato conserva la policy attuale', () => {
  assert.throws(() => prepared({ 'g:shipping': '<g:price>non numerico</g:price>' }), /shipping.price/);
});

test('[CONTINUE] catalogo con un solo item conserva il prodotto importabile', () => {
  const feed = prepared();
  assert.equal(feed.products.length, 1);
  assert.equal(feed.uniqueProducts.length, 1);
  assert.equal(analyzeCatalogCategories(feed, mappings).importableProducts, 1);
});

test('[SKIP] catalogo composto solo da No name non consegna prodotti importabili', () => {
  const analysis = categoryAnalysis(item({ 'g:product_type': 'No name > No name' })
    + item({ 'g:id': null, 'g:product_type': null, 'g:price': 'non valido' }));
  assert.equal(analysis.totalProducts, 2);
  assert.equal(analysis.missingSourceCategoryProducts, 2);
  assert.equal(analysis.missingSourceCategoryUnrecordableProducts, 1);
  assert.equal(analysis.importableProducts, 0);
  assert.equal(analysis.mappedProducts.length, 0);
});
