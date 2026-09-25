import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as xml from 'fast-xml-parser';
import { catalogXml, itemXml, extraFields, parameters as fieldParameters, parameterGroups, categoryMappings } from './fixtures/vudoo.js';
import { normalizeVudooProduct } from '../src/vudooXml.js';
import { parseCatalogXml } from '../src/converter.js';
import { parseFeedNumber, normalizeProduct, buildBasePayload, buildBaseUpdatePayload, detectAndFilterDuplicates, sanitizeTextForBase } from '../src/products.js';

const source = { id: 'SKU-A', title: 'Prodotto', price: '25,00 EUR', weight: '0.1 Kg', brand: 'Marca', product_type: 'Casa > Cura' };
const config = { inventory: { inventory_id: 10 }, priceGroup: { price_group_id: 20, currency: 'EUR' }, warehouse: { id: 'bl_30' } };
const details = { sku: 'SKU-A', weight: 0.1, text_fields: { name: 'Prodotto' }, prices: { 99: 100, 20: 25 }, manufacturer_id: 40, category_id: 51, images: {} };

async function remoteSandbox(options = {}, expectedError) {
  return sandbox({ ...options, entry: '../src/vudooImport.js', forbidCatalogFiles: true,
    action: async api => {
      if (expectedError) await assert.rejects(api.importVudooCatalog('test-company'), expectedError);
      else assert.equal(await api.importVudooCatalog('test-company'), 0);
    },
  });
}

const canonicalCategoryMappings = {
  canonical: {
    TEST_CANONICAL: { base_path: ['Categoria Canonica', 'Foglia Canonica'] },
  },
  suppliers: {
    TEST_SUPPLIER: {
      source_titles: ['Test Supplier'],
      categories: {
        'Vini, Gastronomia > Birra > Birra Artigianale': 'TEST_CANONICAL',
      },
    },
  },
};

const partialCategoryMappings = {
  canonical: {
    MAPPED_A: { base_path: ['Categoria Mappata A'] },
    MAPPED_B: { base_path: ['Categoria Mappata B'] },
  },
  suppliers: {
    TEST_SUPPLIER: {
      source_titles: ['Test Supplier'],
      categories: { 'Categoria A': 'MAPPED_A', 'Categoria B': 'MAPPED_B' },
    },
  },
};

const categoryMappingsWithNull = {
  canonical: partialCategoryMappings.canonical,
  suppliers: { TEST_SUPPLIER: {
    source_titles: ['Test Supplier'],
    categories: { 'Categoria A': 'MAPPED_A', 'Categoria Non Risolta': null },
  } },
};

function categorizedItem(id, category, brand = 'Marca') {
  return itemXml
    .replace('<g:id>389578</g:id>', `<g:id>${id}</g:id>`)
    .replace('<g:brand>Marca</g:brand>', `<g:brand>${brand}</g:brand>`)
    .replace(/<g:product_type>.*?<\/g:product_type>/, `<g:product_type>${category}</g:product_type>`);
}

test('Import selettivo: validazioni prodotto, categorie e Base vedono solo il subset', async () => {
  const invalid = categorizedItem('SKU-EXCLUDED', 'Categoria non mappata')
    .replace('<g:price>3.20 EUR</g:price>', '<g:price>prezzo invalido</g:price>');
  const noName = categorizedItem('SKU-NO-NAME', 'No name > No name');
  const feed = catalogXml(categorizedItem('SKU-SELECTED', 'Categoria A') + invalid + noName);
  const result = await sandbox({
    entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false' },
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company', {
      selectSources: sources => sources.filter(source => source.id === 'SKU-SELECTED'),
    }), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-SELECTED']);
  assert.ok(result.logs.some(line => line.includes('Prodotti totali feed: 1')));
  assert.ok(result.logs.some(line => line.includes('Prodotti con categoria sorgente mancante: 0')));
});

test('Import completo: tutti i prodotti validi ricevuti continuano nel flusso esistente', async () => {
  const feed = catalogXml(categorizedItem('SKU-A', 'Categoria A') + categorizedItem('SKU-B', 'Categoria B'));
  const result = await sandbox({
    entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false' },
    categories: [
      { category_id: 70, parent_id: 0, name: 'Categoria Mappata A' },
      { category_id: 71, parent_id: 0, name: 'Categoria Mappata B' },
    ],
    action: async api => assert.equal(await api.importVudooCatalog('test-company', {
      selectSources: sources => sources,
    }), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-A', 'SKU-B']);
});

test('Import selettivo DRY_RUN: simula soltanto il prodotto scelto', async () => {
  const feed = catalogXml(categorizedItem('SKU-A', 'Categoria A') + categorizedItem('SKU-B', 'Categoria B'));
  const result = await sandbox({
    entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company', {
      selectSources: sources => sources.filter(source => source.id === 'SKU-A'),
    }), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct'), []);
  assert.ok(result.logs.some(line => line.includes('DRY_RUN: nessuna scrittura')));
  assert.ok(result.logs.some(line => line.includes('Prodotti totali feed: 1')));
  assert.ok(result.logs.some(line => line.includes('Prodotti selezionati: 1')));
});

test('Import selettivo: categoria non mappata selezionata segue block e skip', async () => {
  const feed = catalogXml(categorizedItem('SKU-MAPPED', 'Categoria A') +
    categorizedItem('SKU-UNMAPPED', 'Categoria nuova'));
  for (const policy of ['block', 'skip']) {
    const result = await sandbox({
      entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
      env: { UNMAPPED_CATEGORY_POLICY: policy, DRY_RUN: 'false', TEST_MODE: 'false' },
      categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
      action: async api => {
        const run = api.importVudooCatalog('test-company', { selectSources: sources => sources });
        if (policy === 'block') await assert.rejects(run, /Categoria nuova/);
        else assert.equal(await run, 0);
      },
    });
    assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
      .map(call => call.parameters.sku), policy === 'block' ? [] : ['SKU-MAPPED']);
  }
});

test('Import selettivo: supplier nuovo riceve solo le categorie scelte e conserva auto-mapping', async () => {
  const feed = catalogXml(categorizedItem('SKU-CHOSEN', 'Categoria A') +
    categorizedItem('SKU-OTHER', 'Categoria non scelta'))
    .replace('<title>Test Supplier</title>', '<title>Nuovo Fornitore</title>');
  const result = await sandbox({
    entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
    action: api => assert.rejects(api.importVudooCatalog('test-company', {
      selectSources: sources => sources.filter(source => source.id === 'SKU-CHOSEN'),
    }), /IMPORT BLOCCATO/),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  const draft = [...result.writes].find(([filename]) => filename.endsWith('nuovo-fornitore.json'));
  assert.ok(draft);
  assert.deepEqual(JSON.parse(draft[1]).categories, { 'Categoria A': 'MAPPED_A' });
});

test('Import selettivo: annullamento dopo il parsing non raggiunge Base', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    action: async api => assert.equal(await api.importVudooCatalog('test-company', {
      selectSources: () => null,
    }), 0),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
});

test('Import selettivo: No Name scelto resta SKIP; non scelto non entra nel report', async () => {
  const feed = catalogXml(categorizedItem('SKU-MAPPED', 'Categoria A') +
    categorizedItem('SKU-NO-NAME', 'No name > No name').replace('<g:id>SKU-NO-NAME</g:id>', ''));
  for (const includeNoName of [false, true]) {
    const result = await sandbox({
      entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
      categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
      action: api => api.importVudooCatalog('test-company', {
        selectSources: sources => includeNoName ? sources : sources.filter(source => source.id === 'SKU-MAPPED'),
      }),
    });
    assert.ok(result.logs.some(line => line.includes(`Prodotti con categoria sorgente mancante: ${Number(includeNoName)}`)));
    assert.ok(result.logs.some(line => line.includes(`Prodotti senza categoria non registrabili (g:id mancante): ${Number(includeNoName)}`)));
    assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct'), []);
  }
});

test('Import selettivo: g:id mancante o duplicato discordante bloccano solo se selezionati', async () => {
  const missing = categorizedItem('SKU-BAD', 'Categoria A').replace('<g:id>SKU-BAD</g:id>', '');
  const conflicting = categorizedItem('SKU-OK', 'Categoria A')
    .replace('<g:price>3.20 EUR</g:price>', '<g:price>4.20 EUR</g:price>');
  const feed = catalogXml(categorizedItem('SKU-OK', 'Categoria A') + missing + conflicting +
    categorizedItem('SKU-OTHER', 'Categoria A'));
  const base = { entry: '../src/vudooImport.js', xml: feed, categoryMappings: partialCategoryMappings,
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }] };
  const onlyValid = await sandbox({ ...base, action: api => api.importVudooCatalog('test-company', {
    selectSources: sources => [sources[3]],
  }) });
  assert.ok(onlyValid.logs.some(line => line.includes('Prodotti totali feed: 1')));
  await sandbox({ ...base, action: api => assert.rejects(api.importVudooCatalog('test-company', {
    selectSources: sources => [sources[1]],
  }), /SKU mancante/) });
  await sandbox({ ...base, action: api => assert.rejects(api.importVudooCatalog('test-company', {
    selectSources: sources => [sources[0]],
  }), /discordanti/) });
});

test('XML remoto: categoria non mappata mostra il riepilogo completo e blocca prima di Base', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    categoryMappings: {
      canonical: canonicalCategoryMappings.canonical,
      suppliers: {
        TEST_SUPPLIER: { source_titles: ['Test Supplier'], categories: {} },
      },
    },
    action: api => assert.rejects(api.importVudooCatalog('test-company'), /IMPORT BLOCCATO/),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  assert.ok(result.logs.some(line => line.includes('NON MAPPATA: Vini, Gastronomia > Birra > Birra Artigianale')));
  assert.ok(result.logs.some(line => line.includes('0 categorie mappate, 1 categorie non mappate')));
});

test('Categorie policy block esplicita: categoria non mappata blocca senza scritture Base', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    env: { UNMAPPED_CATEGORY_POLICY: 'block', DRY_RUN: 'false' },
    categoryMappings: {
      canonical: canonicalCategoryMappings.canonical,
      suppliers: { TEST_SUPPLIER: { source_titles: ['Test Supplier'], categories: {} } },
    },
    action: api => assert.rejects(api.importVudooCatalog('test-company'), /IMPORT BLOCCATO/),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  assert.ok(result.logs.some(line => line.includes('Policy categorie non mappate: BLOCK')));
});

test('Categorie policy non valida: errore di configurazione prima del fetch Vudoo', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    env: { UNMAPPED_CATEGORY_POLICY: 'other' },
    action: api => assert.rejects(api.importVudooCatalog('test-company'), /UNMAPPED_CATEGORY_POLICY/),
  });
  assert.deepEqual(result.calls, []);
});

test('Categorie policy skip: importa soltanto i prodotti mappati e mantiene contatori distinti', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED-A', 'Categoria A'),
    categorizedItem('SKU-UNMAPPED', 'Categoria Senza Mapping', 'Brand Escluso'),
    categorizedItem('SKU-MAPPED-B', 'Categoria B'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { UNMAPPED_CATEGORY_POLICY: 'SKIP', DRY_RUN: 'false', TEST_MODE: 'false' },
    categories: [
      { category_id: 70, parent_id: 0, name: 'Categoria Mappata A' },
      { category_id: 71, parent_id: 0, name: 'Categoria Mappata B' },
    ],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  const productWrites = result.calls.filter(call => call.method === 'addInventoryProduct');
  assert.deepEqual(productWrites.map(call => call.parameters.sku), ['SKU-MAPPED-A', 'SKU-MAPPED-B']);
  assert.equal(result.calls.some(call => call.method === 'addInventoryManufacturer'), false);
  assert.equal(result.calls.some(call => call.method === 'addInventoryCategory'), false);
  assert.ok(result.logs.some(line => line.includes('Prodotti totali feed: 3')));
  assert.ok(result.logs.some(line => line.includes('Prodotti importabili: 2')));
  assert.ok(result.logs.some(line => line.includes('Esclusi categoria non mappata: 1')));
  assert.ok(result.logs.some(line => line.includes('Categorie reali non mappate: 1')));
  assert.ok(result.logs.some(line => line.includes('Categoria Senza Mapping → 1 prodotti esclusi')));
  assert.ok(result.logs.some(line => line.includes('Saltati perché invariati: 0')));
});

test('Categorie policy skip: catalogo interamente mappato mantiene il flusso normale', async () => {
  const result = await remoteSandbox({ env: { UNMAPPED_CATEGORY_POLICY: 'skip' } });
  assert.equal(result.calls.filter(call => call.method === 'getInventoryProductsList').length, 1);
  assert.ok(result.logs.some(line => line.includes('Prodotti importabili: 1')));
  assert.ok(result.logs.some(line => line.includes('Prodotti esclusi per categoria reale non mappata: 0')));
});

test('XML remoto: EAN non valido produce warning ma il prodotto viene importato senza EAN', async () => {
  const valid = itemXml.replace('<g:id>389578</g:id>',
    '<g:id>389577</g:id><g:ean>8009513003852</g:ean>');
  const invalid = itemXml.replace('<g:id>389578</g:id>',
    '<g:id>389578</g:id><g:ean>8056370403714-</g:ean>');
  const result = await remoteSandbox({ xml: catalogXml(valid + invalid),
    env: { DRY_RUN: 'false', TEST_MODE: 'false' } });
  const creates = result.calls.filter(call => call.method === 'addInventoryProduct');
  assert.equal(creates.length, 2);
  assert.equal(creates[0].parameters.sku, '389577');
  assert.equal(creates[0].parameters.ean, '8009513003852');
  assert.equal(creates[1].parameters.sku, '389578');
  assert.equal(creates[1].parameters.ean, undefined);
  assert.ok(result.logs.some(line => line.includes('EAN non validi omessi: 1')));
  assert.ok(result.logs.some(line => line.includes('389578') && line.includes('HKZDVHCW')
    && line.includes('Prodotto test') && line.includes('8056370403714-')));
});

test('Categorie policy skip: catalogo interamente non mappato non chiama Base e non incrementa SKIP', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    env: { UNMAPPED_CATEGORY_POLICY: 'skip', DRY_RUN: 'false', TEST_MODE: 'false' },
    categoryMappings: {
      canonical: partialCategoryMappings.canonical,
      suppliers: { TEST_SUPPLIER: { source_titles: ['Test Supplier'], categories: {} } },
    },
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  assert.ok(result.logs.some(line => line.includes('Prodotti totali feed: 1')));
  assert.ok(result.logs.some(line => line.includes('Prodotti importabili: 0')));
  assert.ok(result.logs.some(line => line.includes('Esclusi categoria non mappata: 1')));
  assert.ok(result.logs.some(line => line.includes('Saltati perché invariati: 0')));
});

test('No name: policy block esclude sempre le categorie mancanti e registra un solo prodotto', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED', 'Categoria A'),
    categorizedItem('SKU-NO-NAME', ' NO   NAME> no NAME ', 'Brand Solo Escluso'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false', UNMAPPED_CATEGORY_POLICY: 'block' },
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct').map(call => call.parameters.sku), ['SKU-MAPPED']);
  assert.equal(result.calls.some(call => call.method === 'addInventoryManufacturer'), false);
  assert.ok(result.logs.some(line => line.includes('Prodotti esclusi per categoria sorgente mancante: 1')));
  assert.ok(result.logs.some(line => line.includes('Categorie reali non mappate: 0')));
  assert.ok(result.logs.some(line => line.includes('Saltati perché invariati: 0')));
  const report = [...result.writes].find(([filename]) => filename.endsWith('no_name_products.json'));
  assert.ok(report);
  const records = JSON.parse(report[1]);
  assert.equal(records.length, 1);
  assert.equal(records[0].supplier_id, 'TEST_SUPPLIER');
  assert.equal(records[0].id, 'SKU-NO-NAME');
});

test('No name: product_type vuoto o assente viene escluso anche con policy block', async () => {
  const noCategory = categorizedItem('SKU-ABSENT', 'Categoria A')
    .replace(/<g:product_type>.*?<\/g:product_type>/, '');
  const xml = catalogXml([
    categorizedItem('SKU-EMPTY', '  '),
    noCategory,
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false' },
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  assert.ok(result.logs.some(line => line.includes('Prodotti con categoria sorgente mancante: 2')));
  assert.ok(result.logs.some(line => line.includes('Prodotti importabili: 0')));
  const report = [...result.writes].find(([filename]) => filename.endsWith('no_name_products.json'));
  assert.equal(JSON.parse(report[1]).length, 2);
});

test('No name: dati prodotto malformati e stesso g:id non bloccano il prodotto mappato', async () => {
  const excluded = categorizedItem('SKU-MAPPED', 'No name > No name', 'Brand Escluso')
    .replace('<g:price>3.20 EUR</g:price>', '<g:price>prezzo invalido</g:price>')
    .replace('<g:quantity>234</g:quantity>', '<g:quantity>non numerica</g:quantity>');
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED', 'Categoria A'), excluded,
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false', UNMAPPED_CATEGORY_POLICY: 'block' },
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-MAPPED']);
  assert.ok(result.logs.some(line => line.includes('Prodotti con categoria sorgente mancante: 1')));
  const report = [...result.writes].find(([filename]) => filename.endsWith('no_name_products.json'));
  assert.equal(JSON.parse(report[1])[0].id, 'SKU-MAPPED');
});

test('No name: g:id assente viene skippato, conteggiato e non inserito nel registro', async () => {
  const withoutId = categorizedItem('SKU-TO-REMOVE', 'No name > No name', 'Brand Escluso')
    .replace('<g:id>SKU-TO-REMOVE</g:id>', '')
    .replace('<g:price>3.20 EUR</g:price>', '<g:price>non valido</g:price>');
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED', 'Categoria A'),
    categorizedItem('SKU-REGISTERED', 'No name > No name'),
    withoutId,
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false', UNMAPPED_CATEGORY_POLICY: 'block' },
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-MAPPED']);
  assert.ok(result.logs.some(line => line.includes('Prodotti con categoria sorgente mancante: 2')));
  assert.ok(result.logs.some(line => line.includes('Prodotti senza categoria non registrabili (g:id mancante): 1')));
  const report = [...result.writes].find(([filename]) => filename.endsWith('no_name_products.json'));
  assert.deepEqual(JSON.parse(report[1]).map(product => product.id), ['SKU-REGISTERED']);
});

test('No name: solo prodotti senza g:id terminano senza Base e senza creare registro', async () => {
  const withoutId = categorizedItem('SKU-TO-REMOVE', 'No name > No name')
    .replace('<g:id>SKU-TO-REMOVE</g:id>', '');
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml: catalogXml(withoutId),
    categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false', UNMAPPED_CATEGORY_POLICY: 'block' },
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  assert.ok(result.logs.some(line => line.includes('Prodotti importabili: 0')));
  assert.ok(result.logs.some(line => line.includes('Prodotti senza categoria non registrabili (g:id mancante): 1')));
  assert.equal([...result.writes].some(([filename]) => filename.endsWith('no_name_products.json')), false);
});

test('Nuovo supplier: genera bozza solo con categorie reali e ferma import prima di Base', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-NEW', 'PARFUM'),
    categorizedItem('SKU-NO-NAME', 'No name > No name'),
  ].join('')).replace('<title>Test Supplier</title>', '<title>Pippo S.p.A.</title>');
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: { canonical: partialCategoryMappings.canonical, suppliers: {} },
    env: { UNMAPPED_CATEGORY_POLICY: 'skip' },
    action: api => assert.rejects(api.importVudooCatalog('test-company'), error =>
      error.message.includes('config/suppliers/pippo-spa.json') &&
      error.message.includes('Categorie reali trovate: 1') &&
      error.message.includes('Auto-mappate con certezza: 0') &&
      error.message.includes('Da configurare manualmente: 1')),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  const draft = [...result.writes].find(([filename]) => filename.endsWith('pippo-spa.json'));
  assert.ok(draft);
  assert.deepEqual(JSON.parse(draft[1]).categories, { PARFUM: null });
  assert.ok(result.logs.some(line => line.includes('Prodotti con categoria sorgente mancante: 1')));
});

test('Nuovo supplier: scaffold auto-mappa solo match sicuri e blocca comunque prima di Base', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-APPROVED', 'Categoria A'),
    categorizedItem('SKU-CANONICAL', ' categoria mappata B '),
    categorizedItem('SKU-MANUAL', 'Categoria ignota'),
    categorizedItem('SKU-NO-NAME', 'No name > No name'),
  ].join('')).replace('<title>Test Supplier</title>', '<title>Nuovo Fornitore</title>');
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { UNMAPPED_CATEGORY_POLICY: 'skip', DRY_RUN: 'false' },
    action: api => assert.rejects(api.importVudooCatalog('test-company'), error =>
      error.message.includes('Categorie reali trovate: 3') &&
      error.message.includes('Auto-mappate con certezza: 2') &&
      error.message.includes('supplier: 1, base_path canonico: 1') &&
      error.message.includes('Da configurare manualmente: 1') &&
      error.message.includes('config/suppliers/nuovo-fornitore.json')),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
  const draft = [...result.writes].find(([filename]) => filename.endsWith('nuovo-fornitore.json'));
  assert.ok(draft);
  assert.deepEqual(JSON.parse(draft[1]).categories, {
    'Categoria A': 'MAPPED_A',
    ' categoria mappata B ': 'MAPPED_B',
    'Categoria ignota': null,
  });
});

test('Supplier esistente: nuova categoria reale espone conteggio, policy e file da aggiornare', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-NEW-A', 'Nuova Categoria'),
    categorizedItem('SKU-NEW-B', 'Nuova Categoria'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    action: api => assert.rejects(api.importVudooCatalog('test-company'), error =>
      error.message.includes('Nuova Categoria: 2 prodotti') &&
      error.message.includes('config/suppliers/test-supplier.json') &&
      error.message.includes('UNMAPPED_CATEGORY_POLICY=block')),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
});

test('Supplier esistente: mapping null con policy skip esclude la categoria e continua', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED', 'Categoria A'),
    categorizedItem('SKU-NULL', 'Categoria Non Risolta'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    env: { UNMAPPED_CATEGORY_POLICY: 'skip', DRY_RUN: 'false', TEST_MODE: 'false' },
    categoryMappings: categoryMappingsWithNull,
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-MAPPED']);
  assert.ok(result.logs.some(line => line.includes('NON MAPPATA: Categoria Non Risolta (1 prodotti)')));
  assert.ok(result.logs.some(line => line.includes('Esclusi categoria non mappata: 1')));
});

test('Supplier esistente: mapping null con policy block ferma prima di Base', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml: catalogXml(categorizedItem('SKU-NULL', 'Categoria Non Risolta')),
    env: { UNMAPPED_CATEGORY_POLICY: 'block', DRY_RUN: 'false' },
    categoryMappings: categoryMappingsWithNull,
    action: api => assert.rejects(api.importVudooCatalog('test-company'), error =>
      error.message.includes('Categoria Non Risolta: 1 prodotti') &&
      error.message.includes('config/suppliers/test-supplier.json') &&
      error.message.includes('UNMAPPED_CATEGORY_POLICY=block')),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
});

test('Supplier esistente: mapping null non presente nel feed non blocca policy block', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml: catalogXml(categorizedItem('SKU-MAPPED', 'Categoria A')),
    env: { UNMAPPED_CATEGORY_POLICY: 'block', DRY_RUN: 'false' },
    categoryMappings: categoryMappingsWithNull,
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-MAPPED']);
});

test('Supplier esistente: mix mapped/null/no-name mantiene conteggi distinti', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED-1', 'Categoria A'),
    categorizedItem('SKU-NULL-1', 'Categoria Non Risolta'),
    categorizedItem('SKU-NO-NAME', 'No name > No name'),
    categorizedItem('SKU-MAPPED-2', 'Categoria A'),
    categorizedItem('SKU-NULL-2', 'Categoria Non Risolta'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    env: { UNMAPPED_CATEGORY_POLICY: 'skip', DRY_RUN: 'false', TEST_MODE: 'false' },
    categoryMappings: categoryMappingsWithNull,
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Mappata A' }],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  assert.deepEqual(result.calls.filter(call => call.method === 'addInventoryProduct')
    .map(call => call.parameters.sku), ['SKU-MAPPED-1', 'SKU-MAPPED-2']);
  for (const line of [
    'Prodotti totali feed: 5', 'Prodotti importabili: 2',
    'Prodotti esclusi per categoria sorgente mancante: 1',
    'Esclusi categoria non mappata: 2', 'Categorie reali non mappate: 1',
    'Categoria Non Risolta → 2 prodotti esclusi',
  ]) assert.ok(result.logs.some(log => log.includes(line)), line);
  const report = [...result.writes].find(([filename]) => filename.endsWith('no_name_products.json'));
  assert.deepEqual(JSON.parse(report[1]).map(product => product.id), ['SKU-NO-NAME']);
});

test('Hardening: feed misto esclude categorie non importabili, avverte per EAN e conserva stock zero', async () => {
  const valid = categorizedItem('SKU-VALID', 'Categoria A')
    .replace('<g:id>SKU-VALID</g:id>', '<g:id>SKU-VALID</g:id><g:ean>8056370403714-</g:ean>')
    .replace('<g:quantity>234</g:quantity>', '<g:quantity>0</g:quantity>');
  const xml = catalogXml([
    valid,
    categorizedItem('SKU-NO-NAME', 'No name > No name', 'Brand Escluso'),
    categorizedItem('SKU-UNMAPPED', 'Categoria non configurata', 'Brand Escluso'),
    categorizedItem('SKU-SECOND', 'Categoria B'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    categoryMappings: partialCategoryMappings,
    env: { DRY_RUN: 'false', TEST_MODE: 'false', UNMAPPED_CATEGORY_POLICY: 'skip' },
    categories: [
      { category_id: 70, parent_id: 0, name: 'Categoria Mappata A' },
      { category_id: 71, parent_id: 0, name: 'Categoria Mappata B' },
    ],
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 0),
  });
  const creates = result.calls.filter(call => call.method === 'addInventoryProduct');
  assert.deepEqual(creates.map(call => call.parameters.sku), ['SKU-VALID', 'SKU-SECOND']);
  assert.equal(creates[0].parameters.stock.bl_30, 0);
  assert.equal(creates[0].parameters.ean, undefined);
  assert.equal(result.calls.some(call => call.method === 'addInventoryManufacturer'), false);
  assert.equal(result.calls.some(call => call.method === 'addInventoryCategory'), false);
  for (const line of [
    'Prodotti totali feed: 4', 'Prodotti importabili: 2',
    'Prodotti esclusi per categoria sorgente mancante: 1',
    'Esclusi categoria non mappata: 1', 'Categorie reali non mappate: 1',
    'EAN non validi omessi: 1', 'Creati: 2', 'Saltati perché invariati: 0',
  ]) assert.ok(result.logs.some(log => log.includes(line)), line);
});

test('XML remoto: Base vuota crea esclusivamente il percorso canonico completo', async () => {
  const result = await remoteSandbox({
    env: { DRY_RUN: 'false' },
    categories: [],
    categoryMappings: canonicalCategoryMappings,
  });
  const creates = result.calls.filter(call => call.method === 'addInventoryCategory');
  assert.deepEqual(creates.map(call => call.parameters.name), ['Categoria Canonica', 'Foglia Canonica']);
  assert.equal(creates[0].parameters.parent_id, 0);
  assert.equal(creates[1].parameters.parent_id, 100 + result.calls.indexOf(creates[0]) + 1);
  assert.ok(creates.every(call => !call.parameters.name.includes('Vini, Gastronomia')));
});

test('XML remoto: Base con radice canonica crea soltanto la foglia', async () => {
  const result = await remoteSandbox({
    env: { DRY_RUN: 'false' },
    categories: [{ category_id: 70, parent_id: 0, name: 'Categoria Canonica' }],
    categoryMappings: canonicalCategoryMappings,
  });
  const creates = result.calls.filter(call => call.method === 'addInventoryCategory');
  assert.equal(creates.length, 1);
  assert.equal(creates[0].parameters.name, 'Foglia Canonica');
  assert.equal(creates[0].parameters.parent_id, 70);
});

test('XML remoto: Base con percorso canonico completo non crea categorie', async () => {
  const result = await remoteSandbox({
    env: { DRY_RUN: 'false' },
    categories: [
      { category_id: 70, parent_id: 0, name: 'Categoria Canonica' },
      { category_id: 71, parent_id: 70, name: 'Foglia Canonica' },
    ],
    categoryMappings: canonicalCategoryMappings,
  });
  assert.equal(result.calls.filter(call => call.method === 'addInventoryCategory').length, 0);
  const productWrite = result.calls.find(call => call.method === 'addInventoryProduct');
  assert.equal(productWrite.parameters.category_id, 71);
});

test('XML remoto: sincronizzazione produttori non dipende dai mapping categoria', async () => {
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    categoryMappings: { canonical: {}, suppliers: {} },
    action: async api => assert.equal(await api.syncVudooManufacturers('test-company'), 0),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET', 'getInventoryManufacturers']);
  assert.ok(result.logs.some(line => line.includes('Produttore: Marca')));
});

test('XML remoto: sincronizzazione produttori vede anche brand con categorie non mappate', async () => {
  const xml = catalogXml([
    categorizedItem('SKU-MAPPED', 'Categoria A'),
    categorizedItem('SKU-UNMAPPED', 'Categoria Senza Mapping', 'Brand Solo Escluso'),
  ].join(''));
  const result = await sandbox({
    entry: '../src/vudooImport.js',
    forbidCatalogFiles: true,
    xml,
    env: { UNMAPPED_CATEGORY_POLICY: 'skip' },
    categoryMappings: partialCategoryMappings,
    action: async api => assert.equal(await api.syncVudooManufacturers('test-company'), 0),
  });
  assert.ok(result.logs.some(line => line.includes('[DRY_RUN] Produttore da creare: Brand Solo Escluso')));
});

test('XML remoto: warning Parameters non viene dichiarato successo e non ripete CREATE', async () => {
  const product = normalizeVudooProduct(parseCatalogXml(catalogXml())[0]);
  const remoteConfig = { ...config, extraFields: new Map(extraFields.map(field => [field.name, field])) };
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, existing: true,
    response: method => method === 'addInventoryProduct'
      ? { ok: true, json: async () => ({ status: 'SUCCESS', product_id: 60, warnings: { parameters: [{ reason: 'unknown_parameter' }] } }) }
      : undefined,
    action: api => assert.rejects(api.sendProductToBase(product, remoteConfig), error => error.uncertain === true),
  });
  assert.equal(result.calls.filter(call => call.method === 'addInventoryProduct').length, 1);
  assert.ok(result.calls.some(call => call.method === 'getInventoryProductsData'));
});

test('XML remoto: prodotto invariato salta, cambiamento aggiorna solo stock con ID esistente', async () => {
  const product = normalizeVudooProduct(parseCatalogXml(catalogXml())[0]);
  const remoteConfig = { ...config, extraFields: new Map(extraFields.map(field => [field.name, field])) };
  const payload = buildBasePayload(product, remoteConfig);
  const categories = [{ category_id: 50, parent_id: 0, name: 'Vini, Gastronomia' },
    { category_id: 51, parent_id: 50, name: 'Birra' }, { category_id: 52, parent_id: 51, name: 'Birra Artigianale' }];
  const saved = { ...payload, images: { 1: product.image_link }, manufacturer_id: 40, category_id: 52 };
  const unchanged = await remoteSandbox({ existing: true, details: saved, categories, env: { DRY_RUN: 'false' } });
  assert.ok(unchanged.logs.some(log => log.includes('Saltati perché invariati: 1')));
  assert.ok(unchanged.calls.every(call => call.method === 'VUDOO_GET' || call.method.startsWith('get')));
  const changed = await remoteSandbox({ existing: true, details: { ...saved, stock: { bl_30: 1 } }, categories, env: { DRY_RUN: 'false' } });
  const writes = changed.calls.filter(call => call.method === 'addInventoryProduct');
  assert.equal(writes.length, 1);
  assert.equal(JSON.stringify(writes[0].parameters), JSON.stringify({ inventory_id: 10, stock: { bl_30: 234 }, product_id: 60 }));
});

test('XML remoto: Vudoo SKU incompatibile blocca prima di categorie, produttori e prodotto', async () => {
  const product = normalizeVudooProduct(parseCatalogXml(catalogXml())[0]);
  const remoteConfig = { ...config, extraFields: new Map(extraFields.map(field => [field.name, field])) };
  const payload = buildBasePayload(product, remoteConfig);
  const result = await sandbox({ entry: '../src/vudooImport.js', forbidCatalogFiles: true,
    existing: true, categories: [], manufacturers: [], env: { DRY_RUN: 'false' },
    details: { ...payload, text_fields: { ...payload.text_fields, features: { ...payload.text_fields.features, 'Vudoo SKU': 'DIFFERENTE' } } },
    action: async api => assert.equal(await api.importVudooCatalog('test-company'), 1),
  });
  assert.ok(result.logs.some(log => log.includes('Vudoo SKU incompatibile')));
  assert.equal(result.calls.filter(call => ['addInventoryCategory', 'addInventoryManufacturer', 'addInventoryProduct'].includes(call.method)).length, 0);
});

test('XML remoto: flusso interamente in memoria, DRY_RUN e lookup campi read-only', async () => {
  const result = await remoteSandbox();
  assert.equal(result.calls[0].method, 'VUDOO_GET');
  assert.ok(result.calls.slice(1).every(call => call.method.startsWith('get')));
  assert.equal(result.calls.filter(call => call.method === 'getInventoryExtraFields').length, 1);
  assert.equal(result.calls.filter(call => call.method === 'getInventoryParameters').length, 1);
  assert.ok(result.logs.some(log => log.includes('Simulati: 1')));
  assert.equal(result.writes.size, 0);
});

for (const [name, feed, error] of [
  ['XML invalido', '<rss>', /XML/],
  ['catalogo vuoto', catalogXml(''), /item|vuoto/],
  ['secondo prodotto invalido anche TEST_MODE', catalogXml(itemXml + itemXml.replace('3.20 EUR', 'invalid')), /record 2/],
  ['duplicati discordanti', catalogXml(itemXml + itemXml.replace('3.20 EUR', '5.20 EUR')), /discordanti/],
]) {
  test(`XML remoto: ${name} blocca tutte le chiamate Base`, async () => {
    const result = await remoteSandbox({ xml: feed }, error);
    assert.deepEqual(result.calls.map(call => call.method), ['VUDOO_GET']);
    assert.equal(result.writes.size, 0);
  });
}

for (const [name, options, error] of [
  ['extra assente', { extraFields: [] }, /Additional Field mancante/],
  ['extra ambiguo', { extraFields: [...extraFields, extraFields[0]] }, /ambiguo/],
  ['editor non supportato', { extraFields: extraFields.map(field => ({ ...field, editor_type: 'select' })) }, /non supportato/],
  ['gruppo assente', { parameterGroups: [] }, /Gruppo Parameters/],
  ['parametro assente', { parameters: [] }, /Parameter mancante/],
  ['parametro ambiguo', { parameters: [...fieldParameters, fieldParameters[0]] }, /ambiguo/],
  ['parent gruppo errato', { parameterGroups: [{ name: 'Vudoo / Marketplace', parameter_keys: [] }] }, /Parameter mancante/],
]) {
  test(`XML remoto: ${name} blocca prima di creare risorse`, async () => {
    const result = await remoteSandbox({ ...options, env: { DRY_RUN: 'false' } }, error);
    assert.ok(result.calls.every(call => call.method === 'VUDOO_GET' || call.method.startsWith('get')));
  });
}

test('XML remoto: TEST_MODE seleziona un solo SKU dopo validazione e dedup completa', async () => {
  const result = await remoteSandbox({ xml: catalogXml(itemXml + itemXml + itemXml.replace('<g:id>389578</g:id>', '<g:id>389579</g:id>')) });
  assert.equal(result.calls.filter(call => call.method === 'getInventoryProductsList').length, 1);
  assert.ok(result.logs.some(log => log.includes('Prodotti elaborati: 3\nSKU unici: 2\nDuplicati nel feed: 1')));
});

test('XML remoto: CREATE simulate con mock riusano gerarchia e produttore, nessuna immagine extra', async () => {
  const result = await remoteSandbox({ env: { DRY_RUN: 'false', TEST_MODE: 'false' }, categories: [], manufacturers: [],
    xml: catalogXml(itemXml + itemXml.replace('<g:id>389578</g:id>', '<g:id>389579</g:id>').replace('<g:size>3000 ml.</g:size>', '<g:size>250 ml.</g:size>')) });
  const creates = result.calls.filter(call => call.method === 'addInventoryProduct');
  assert.equal(creates.length, 2);
  assert.equal(result.calls.filter(call => call.method === 'addInventoryManufacturer').length, 1);
  assert.equal(result.calls.filter(call => call.method === 'addInventoryCategory').length, 3);
  assert.equal(creates[0].parameters.category_id, creates[1].parameters.category_id);
  assert.equal(creates[0].parameters.manufacturer_id, creates[1].parameters.manufacturer_id);
  assert.equal(creates[0].parameters.stock.bl_30, 234);
  assert.equal(creates[0].parameters.text_fields.features.MPN, 'MANUFACTURER-PART');
  assert.equal(creates[0].parameters.sku, '389578');
  assert.equal(creates[1].parameters.sku, '389579');
  assert.equal(creates[0].parameters.text_fields.features['Vudoo SKU'], 'HKZDVHCW');
  assert.equal(Object.keys(creates[0].parameters.images).length, 1);
  assert.equal(result.writes.size, 0);
});

for (const operation of ['CREATE', 'UPDATE']) {
  for (const matches of [true, false]) {
    test(`XML remoto: ${operation} incerta verifica nuovi campi, corrispondenza=${matches}, nessun retry`, async () => {
      const product = normalizeVudooProduct(parseCatalogXml(catalogXml())[0]);
      const remoteConfig = { ...config, extraFields: new Map(extraFields.map(field => [field.name, field])) };
      const desired = buildBasePayload(product, remoteConfig);
      const saved = { ...desired, images: { 1: product.image_link } };
      if (!matches) saved.text_fields = { ...saved.text_fields, features: { ...saved.text_fields.features, MPN: 'different' } };
      let result;
      const run = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, existing: true, details: saved,
        response: method => { if (method === 'addInventoryProduct') throw new Error('Risposta persa'); },
        action: async api => {
          const promise = operation === 'CREATE' ? api.sendProductToBase(product, remoteConfig)
            : api.updateProductInBase(60, product, remoteConfig, { sku: product.sku });
          if (matches) result = await promise;
          else await assert.rejects(promise, error => error.uncertain === true);
        },
      });
      assert.equal(run.calls.filter(call => call.method === 'addInventoryProduct').length, 1);
      assert.ok(run.calls.some(call => call.method === 'getInventoryProductsData'));
      if (matches) assert.equal(result.confirmed_after_uncertain, true);
    });
  }
}

test('Sanitizzazione: elimina non-BMP e spazi introdotti dalla rimozione', () => {
  assert.equal(sanitizeTextForBase('Test 💧 descrizione 🖤 finale'), 'Test descrizione finale');
  assert.equal(sanitizeTextForBase("Capelli sani. 💧 Modo d'uso"), "Capelli sani. Modo d'uso");
  assert.equal(sanitizeTextForBase('💧 Test 🖤'), 'Test');
  assert.equal(sanitizeTextForBase('Test 💧 🖤 finale'), 'Test finale');
  assert.equal(sanitizeTextForBase('a💧b'), 'ab');
});

test('Sanitizzazione: preserva Unicode BMP e formattazione non coinvolta', () => {
  const text = 'È già tutto così – 25€ ✨ à è é ì ò ù l’uso ✨️\n\n  Due  spazi\tqui';
  assert.equal(sanitizeTextForBase(text), text);
  assert.equal(sanitizeTextForBase('Prima  riga\r\n💧 Seconda\n\nTerza'), 'Prima  riga\r\nSeconda\n\nTerza');
});

test('Sanitizzazione: rimuove il selettore associato a emoji non-BMP ed è idempotente', () => {
  const text = '🖌️ Pennello 🌿 🌺 cura';
  assert.equal(sanitizeTextForBase(text), 'Pennello cura');
  assert.equal(sanitizeTextForBase(sanitizeTextForBase(text)), sanitizeTextForBase(text));
});

test('CREATE sanitizza nome e descrizione senza modificare il prodotto sorgente', () => {
  const product = normalizeProduct({ ...source, title: 'Nome 💧 prodotto', description: 'Test 💧 descrizione' });
  assert.deepEqual(buildBasePayload(product, config).text_fields, { name: 'Nome prodotto', description: 'Test descrizione' });
  assert.equal(product.description, 'Test 💧 descrizione');
  assert.equal(product.title, 'Nome 💧 prodotto');
});

test('UPDATE: Base già sanitizzato e feed con emoji restituiscono null', () => {
  const product = normalizeProduct({ ...source, title: 'Prodotto 💧', description: 'Test 💧 descrizione' });
  const existing = { ...details, text_fields: { name: 'Prodotto', description: 'Test descrizione' } };
  assert.equal(buildBaseUpdatePayload(product, existing, config), null);
});

test('UPDATE: una vera modifica rimane visibile e viene inviata sanitizzata', () => {
  const product = normalizeProduct({ ...source, description: 'Nuova descrizione 💧' });
  const existing = { ...details, text_fields: { name: 'Prodotto', description: 'Vecchia descrizione' } };
  assert.deepEqual(buildBaseUpdatePayload(product, existing, config), {
    inventory_id: 10, text_fields: { description: 'Nuova descrizione' },
  });
});

test('UPDATE: i punti interrogativi già salvati richiedono una sola pulizia', () => {
  const product = normalizeProduct({ ...source, description: 'Test 💧 descrizione?' });
  const existing = { ...details, text_fields: { name: 'Prodotto', description: 'Test ? descrizione?' } };
  const update = buildBaseUpdatePayload(product, existing, config);
  assert.equal(update.text_fields.description, 'Test descrizione?');
  assert.equal(buildBaseUpdatePayload(product, {
    ...existing, text_fields: { ...existing.text_fields, ...update.text_fields },
  }, config), null);
});

async function sandbox(options = {}) {
  const calls = [], logs = [], writes = new Map();
  const waits = [];
  let now = 0;
  const processMock = { env: { BASE_API_TOKEN: 'test-only-token', TEST_MODE: 'true', DRY_RUN: 'true', ...options.env }, exitCode: 0 };
  class FakeDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: FakeDate,
    setTimeout: (resolve, milliseconds) => { waits.push(milliseconds); now += milliseconds; resolve(); },
    URL, URLSearchParams, AbortSignal, Buffer, process: processMock,
    console: { log: (...args) => logs.push(args.join(' ')), warn: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    fetch: async (url, request) => {
      if (String(url).startsWith('https://www.vudoo.org/ProductCatalog.ashx?')) {
        assert.equal(request.method, 'GET');
        assert.equal(request.headers?.['X-BLToken'], undefined);
        calls.push({ method: 'VUDOO_GET', parameters: Object.fromEntries(new URL(url).searchParams) });
        return { ok: true, headers: { get: () => 'application/xml' }, text: async () => options.xml ?? catalogXml() };
      }
      assert.equal(url, 'https://api.baselinker.com/connector.php');
      assert.equal(request.method, 'POST');
      assert.equal(request.headers['X-BLToken'], 'test-only-token');
      assert.ok(request.signal);
      const method = request.body.get('method');
      const parameters = JSON.parse(request.body.get('parameters'));
      calls.push({ method, parameters, at: now });
      const custom = await options.response?.(method, parameters, calls);
      if (custom !== undefined) return custom;
      if (options.httpError) return { ok: false, status: 503 };
      if (options.networkError) throw new Error('Rete simulata non disponibile');
      const responses = {
        getInventoryExtraFields: { extra_fields: options.extraFields ?? extraFields },
        getInventoryParameters: { parameters: options.parameters ?? fieldParameters, parameter_groups: options.parameterGroups ?? parameterGroups },
        getInventories: { inventories: options.inventories ?? [{ inventory_id: 11, is_default: false }, { inventory_id: 10, name: 'Default', is_default: true, price_groups: [20], default_price_group: 20, warehouses: ['bl_30'] }] },
        getInventoryPriceGroups: { price_groups: [{ price_group_id: 20, currency: 'EUR', name: 'Default' }] },
        getInventoryWarehouses: { warehouses: options.warehouses ?? [{ warehouse_id: 30, warehouse_type: 'bl', name: 'Warehouse' }] },
        getInventoryManufacturers: { manufacturers: options.manufacturers ?? [{ manufacturer_id: 40, name: 'Marca' }] },
        getInventoryCategories: { categories: options.categories ?? [{ category_id: 50, parent_id: 0, name: 'Casa' }, { category_id: 51, parent_id: 50, name: 'Cura' }] },
        getInventoryProductsList: options.lookupError ? { status: 'ERROR', error_code: 'LOOKUP_FAILED', error_message: 'Errore simulato' } : { products: options.matches ?? (options.existing ? { 60: { id: 60, sku: parameters.filter_sku } } : {}) },
        getInventoryProductsData: { products: { 60: options.details ?? details } },
        addInventoryProduct: { product_id: parameters.product_id ?? 60 },
        addInventoryCategory: { category_id: 100 + calls.length },
        addInventoryManufacturer: { manufacturer_id: 200 + calls.length }
      };
      assert.ok(responses[method], 'Metodo inatteso: ' + method);
      return { ok: true, json: async () => ({ status: 'SUCCESS', ...responses[method] }) };
    }
  });
  const fakeFs = {
    readFile: async url => {
      const filename = fileURLToPath(url);
      if (options.forbidCatalogFiles && /(?:real_products.json|VUDOO.xml)$/.test(filename)) {
        throw new Error('Il flusso remoto non deve leggere cataloghi locali');
      }
      if (writes.has(filename)) return writes.get(filename);
      if (filename.endsWith('real_products.json')) return JSON.stringify(options.products ?? [source]);
      if (filename.endsWith('VUDOO.xml')) return '<rss xmlns:g="http://base.google.com/ns/1.0"><channel><item><title>Test</title><g:id>SKU-A</g:id><g:brand>Marca</g:brand><g:price>25,00 EUR</g:price></item></channel></rss>';
      const mappings = options.categoryMappings ?? categoryMappings;
      if (filename.endsWith('canonical-categories.json')) return JSON.stringify(mappings.canonical);
      if (filename.includes('config\\suppliers\\') || filename.includes('config/suppliers/')) {
        const suppliers = options.supplierConfigs ?? Object.entries(mappings.suppliers).map(([id, value]) =>
          ({ filename: `${id.toLowerCase().replace(/_/g, '-')}.json`, value: { supplier_id: id, ...value } }));
        const supplier = suppliers.find(item => filename.endsWith(item.filename));
        if (supplier) return JSON.stringify(supplier.value);
      }
      if (filename.endsWith('no_name_products.json')) {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      }
      return fs.readFileSync(filename, 'utf8');
    },
    readdir: async () => (options.supplierConfigs ?? Object.entries((options.categoryMappings ?? categoryMappings).suppliers)
      .map(([id]) => ({ filename: `${id.toLowerCase().replace(/_/g, '-')}.json` }))).map(item => item.filename),
    mkdir: async () => {},
    open: async url => {
      const filename = fileURLToPath(url);
      if (writes.has(filename)) { const error = new Error('EEXIST'); error.code = 'EEXIST'; throw error; }
      writes.set(filename, '');
      return { writeFile: async text => writes.set(filename, text), close: async () => {} };
    },
    writeFile: async (url, text) => writes.set(fileURLToPath(url), text),
    rename: async (from, to) => {
      writes.set(fileURLToPath(to), writes.get(fileURLToPath(from)));
      writes.delete(fileURLToPath(from));
    },
    unlink: async url => writes.delete(fileURLToPath(url)),
  };
  const modules = new Map();
  function load(id) {
    if (modules.has(id)) return modules.get(id);
    const exports = id === 'node:fs/promises' ? fakeFs : id === 'fast-xml-parser' ? xml : null;
    const module = exports ? new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context, identifier: id }) : new vm.SourceTextModule(fs.readFileSync(fileURLToPath(id), 'utf8'), {
      context, identifier: id, initializeImportMeta: meta => { meta.url = id; }
    });
    modules.set(id, module);
    return module;
  }
  const module = load(new URL(options.entry ?? '../tools/legacy/import-json.js', import.meta.url).href);
  await module.link((specifier, parent) => load(specifier.startsWith('.') ? new URL(specifier, parent.identifier).href : specifier));
  await module.evaluate();
  if (options.action) await options.action(module.namespace, { calls, logs, waits, advance: milliseconds => { now += milliseconds; } });
  for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve));
  return { calls, logs, writes, waits, exitCode: processMock.exitCode };
}

for (const [value, unit, expected] of [['25,00 EUR', 'EUR', 25], ['999,00 EUR', 'EUR', 999], ['1.098,00 EUR', 'EUR', 1098], ['4.880,00 EUR', 'EUR', 4880], ['0.1 Kg', 'Kg', 0.1], ['1.234.567,89 EUR', 'EUR', 1234567.89]]) {
  test('Parsing ' + value, () => assert.equal(parseFeedNumber(value, unit, 'campo'), expected));
}
test('Parsing rifiuta raggruppamenti malformati', () => {
  for (const value of ['1.09,00 EUR', '1 2 EUR', '1,2,3 EUR', '-2 EUR']) assert.throws(() => parseFeedNumber(value, 'EUR', 'price'));
});
test('Duplicati equivalenti senza nascondere prodotti invalidi', () => {
  const result = detectAndFilterDuplicates([source, { ...source, link: 'altro link' }, null, { title: 'Senza SKU' }]);
  assert.equal(result.uniqueProducts.length, 3);
  assert.equal(result.duplicatesMap.get(source.id), 2);
  assert.throws(() => detectAndFilterDuplicates([source, { ...source, price: '30,00 EUR' }]), /discordanti/);
});
test('Duplicati: fallback availability uguale produce lo stesso stock', () => {
  for (const [availability, expected] of [['in stock', 10], ['out of stock', 0]]) {
    const product = { ...source, availability };
    const result = detectAndFilterDuplicates([product, { ...product }]);
    assert.equal(result.uniqueProducts.length, 1);
    assert.equal(normalizeProduct(result.uniqueProducts[0]).quantity, expected);
  }
});
test('Duplicati: availability discordante senza quantity genera sempre conflitto', () => {
  const inStock = { ...source, availability: 'in stock' };
  const outOfStock = { ...source, availability: 'out of stock' };
  assert.throws(() => detectAndFilterDuplicates([inStock, outOfStock]), /discordanti: quantity/);
  assert.throws(() => detectAndFilterDuplicates([outOfStock, inStock]), /discordanti: quantity/);
});
test('Duplicati: confronta lo stock effettivo e mantiene la precedenza della quantity', () => {
  const sameQuantity = detectAndFilterDuplicates([
    { ...source, quantity: 25, availability: 'in stock' },
    { ...source, quantity: '25', availability: 'out of stock' },
  ]);
  assert.equal(sameQuantity.uniqueProducts.length, 1);
  assert.equal(normalizeProduct(sameQuantity.uniqueProducts[0]).quantity, 25);

  const zero = detectAndFilterDuplicates([
    { ...source, quantity: 0 },
    { ...source, availability: 'out of stock' },
  ]);
  assert.equal(zero.uniqueProducts.length, 1);
  assert.equal(normalizeProduct(zero.uniqueProducts[0]).quantity, 0);

  assert.throws(() => detectAndFilterDuplicates([
    { ...source, quantity: 10 },
    { ...source, quantity: 20 },
  ]), /discordanti: quantity/);
  assert.equal(normalizeProduct({ ...source, quantity: 200 }).quantity, 200);
});
test('Duplicati: quantity invalida non usa il fallback availability', () => {
  const invalid = { ...source, quantity: 'abc', availability: 'in stock' };
  assert.throws(() => normalizeProduct(invalid), /quantity deve essere un numero/);
  assert.throws(() => detectAndFilterDuplicates([invalid, { ...invalid }]), /quantity deve essere un numero/);
});
test('Payload: warehouse reale, ID stretti, nessuno stock inventato', () => {
  const normalized = normalizeProduct(source);
  assert.equal(buildBasePayload(normalized, config).stock, undefined);
  assert.deepEqual(buildBasePayload({ ...normalized, quantity: 2 }, config).stock, { bl_30: 2 });
  assert.throws(() => buildBasePayload({ ...normalized, quantity: 2 }, { ...config, warehouse: { id: 'default' } }));
  assert.throws(() => buildBasePayload({ ...normalized, category_id: '12abc' }, config));
});
test('Quantita: valori reali, stringhe e fallback availability', () => {
  const cases = [
    [{ quantity: 0 }, 0],
    [{ quantity: 25 }, 25],
    [{ quantity: 200 }, 200],
    [{ quantity: '25' }, 25],
    [{ quantity: '', availability: 'in stock' }, 10],
    [{ quantity: null, availability: 'in stock' }, 10],
    [{ availability: 'in stock' }, 10],
    [{ availability: 'out of stock' }, 0],
    [{ quantity: 35, availability: 'in stock' }, 35],
  ];
  for (const [values, expected] of cases) {
    assert.equal(normalizeProduct({ ...source, ...values }).quantity, expected);
  }
  assert.equal(normalizeProduct({ ...source, quantity: 200, availability: 'in stock' }).quantity, 200);
});
test('Stock: fallback richiede warehouse e UPDATE resta selettivo', () => {
  const product = normalizeProduct({ ...source, availability: 'in stock' });
  assert.throws(() => buildBasePayload(product, { ...config, warehouse: null }), /Magazzino/);
  assert.deepEqual(buildBasePayload(product, config).stock, { bl_30: 10 });
  assert.equal(buildBaseUpdatePayload(product, { ...details, stock: { bl_30: 10 } }, config), null);
  assert.deepEqual(buildBaseUpdatePayload(product, { ...details, stock: { bl_30: 4 } }, config), {
    inventory_id: 10, stock: { bl_30: 10 },
  });
});
test('UPDATE confronta il gruppo selezionato e invia solo le differenze', () => {
  const normalized = normalizeProduct(source);
  assert.equal(buildBaseUpdatePayload(normalized, details, config), null);
  assert.deepEqual(buildBaseUpdatePayload({ ...normalized, price: 26 }, details, config), { inventory_id: 10, prices: { 20: 26 } });
  assert.deepEqual(buildBaseUpdatePayload(normalized, { ...details, prices: {} }, config), { inventory_id: 10, prices: { 20: 25 } });
  assert.throws(() => buildBaseUpdatePayload(normalized, { ...details, sku: 'ALTRO' }, config));
});
test('UPDATE omette dati sorgente assenti e conserva immagini CDN non confrontabili', () => {
  const normalized = normalizeProduct({ ...source, image_link: 'https://example.org/image.jpg' });
  assert.equal(buildBaseUpdatePayload(normalized, { ...details, ean: '12345678', images: { 1: 'https://upload.cdn.baselinker.com/image.jpg' } }, config), null);
  assert.equal(buildBaseUpdatePayload(normalized, { ...details, images: { 1: normalized.image_link } }, config), null);
  assert.ok(buildBaseUpdatePayload(normalized, { ...details, images: {} }, config).images);
});
test('Nuovo prodotto: TEST_MODE limita a uno e DRY_RUN non scrive', async () => {
  const result = await sandbox({ products: [source, { ...source, id: 'SKU-B' }] });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.filter(call => call.method === 'getInventoryProductsList').length, 1);
  assert.ok(result.logs.some(log => log.includes('Simulati: 1')));
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('Prodotto invariato: SKIPPED', async () => {
  const result = await sandbox({ existing: true });
  assert.ok(result.logs.some(log => log.includes('Saltati perché invariati: 1')));
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('UPDATE in DRY_RUN resta simulato', async () => {
  const result = await sandbox({ existing: true, details: { ...details, prices: { 20: 24 } } });
  assert.ok(result.logs.some(log => log.includes('Payload Base.com (UPDATE)')));
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('Categorie e produttori assenti: simulazione senza ID inventati', async () => {
  const result = await sandbox({ categories: [], manufacturers: [] });
  assert.equal(result.exitCode, 0);
  assert.ok(result.logs.some(log => log.includes('Categoria da creare')));
  assert.ok(result.logs.some(log => log.includes('Produttore da creare')));
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('Associazioni mancanti su prodotto invariato: simulato, non SKIPPED', async () => {
  const result = await sandbox({ existing: true, categories: [], manufacturers: [] });
  assert.ok(result.logs.some(log => log.includes('Simulati: 1')));
});
test('Errore lookup: nessuna creazione, errore conteggiato', async () => {
  const result = await sandbox({ lookupError: true });
  assert.equal(result.exitCode, 1);
  assert.ok(result.logs.some(log => log.includes('LOOKUP_FAILED')));
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('SKU ambiguo su Base: blocco del prodotto', async () => {
  const result = await sandbox({ matches: { 60: { sku: source.id }, 61: { sku: source.id } } });
  assert.equal(result.exitCode, 1);
  assert.ok(result.logs.some(log => log.includes('ambiguo')));
});
test('Nessun fallback da EAN a SKU', async () => {
  const result = await sandbox({ matches: { 60: { ean: source.id } } });
  assert.equal(result.exitCode, 1);
});
test('HTTP e rete: uscita fallita', async () => {
  for (const options of [{ httpError: true }, { networkError: true }]) {
    const result = await sandbox(options);
    assert.equal(result.exitCode, 1);
  }
});
test('Inventory esplicito errato non seleziona il primo', async () => {
  assert.equal((await sandbox({ env: { BASE_INVENTORY_ID: '999' } })).exitCode, 1);
});
test('Default ambiguo: nessuna scelta arbitraria', async () => {
  assert.equal((await sandbox({ inventories: [{ is_default: true }, { is_default: true }] })).exitCode, 1);
});
test('Quantita: recupero del warehouse associato', async () => {
  const result = await sandbox({ products: [{ ...source, quantity: 2 }], env: { BASE_WAREHOUSE_ID: 'bl_30' } });
  assert.equal(result.exitCode, 0);
  assert.ok(result.logs.some(log => log.includes('"bl_30": 2')));
});
test('Quantita fallback: preflight recupera e riutilizza il warehouse associato', async () => {
  const result = await sandbox({ products: [{ ...source, availability: 'in stock' }], env: { BASE_WAREHOUSE_ID: 'bl_30' } });
  assert.equal(result.exitCode, 0);
  assert.equal(result.calls.filter(call => call.method === 'getInventoryWarehouses').length, 1);
  assert.ok(result.logs.some(log => log.includes('"bl_30": 10')));
});
test('Quantita fallback: DRY_RUN non esegue scritture', async () => {
  const result = await sandbox({ products: [{ ...source, availability: 'out of stock' }], env: { BASE_WAREHOUSE_ID: 'bl_30' } });
  assert.equal(result.exitCode, 0);
  assert.ok(result.logs.some(log => log.includes('"bl_30": 0')));
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('Tutti i prodotti: dedup e prosecuzione dopo errore', async () => {
  const result = await sandbox({ env: { TEST_MODE: 'false' }, products: [source, source, { ...source, id: 'INVALID', price: 'bad' }, { ...source, id: 'SKU-B' }] });
  assert.equal(result.exitCode, 1);
  assert.ok(result.logs.some(log => log.includes('Simulati: 2')));
  assert.ok(result.logs.some(log => log.includes('Duplicati nel feed saltati: 1')));
  assert.ok(result.logs.some(log => log.includes('SKU con errori: INVALID')));
});
test('Creazioni simulate via mock: gerarchia e mappe riutilizzate', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false', TEST_MODE: 'false' }, categories: [], manufacturers: [], products: [source, { ...source, id: 'SKU-B', brand: ' MARCA ' }] });
  assert.equal(result.exitCode, 0);
  const categories = result.calls.filter(call => call.method === 'addInventoryCategory');
  assert.equal(categories.length, 2);
  assert.equal(categories[0].parameters.parent_id, 0);
  assert.ok(categories[1].parameters.parent_id > 0);
  assert.equal(result.calls.filter(call => call.method === 'addInventoryManufacturer').length, 1);
  assert.ok(result.logs.some(log => log.includes('Creati: 2')));
});
test('UPDATE mock: ID corretto, nessuna riscrittura dei campi invariati', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false' }, existing: true, details: { ...details, prices: { 20: 24 } } });
  const update = result.calls.find(call => call.method === 'addInventoryProduct');
  assert.deepEqual(update.parameters, { inventory_id: 10, prices: { 20: 25 }, product_id: 60 });
  assert.ok(result.logs.some(log => log.includes('Aggiornati: 1')));
});
test('Gate API blocca scritture dirette in DRY_RUN', async () => {
  await sandbox({ entry: '../src/baseApi.js', action: async api => {
    await assert.rejects(api.callBase('addInventoryProduct', {}), /bloccata/);
  } });
});
test('Categorie omonime con stesso parent: errore senza creazioni', async () => {
  const result = await sandbox({ categories: [{ category_id: 50, name: 'Casa', parent_id: 0 }, { category_id: 51, name: ' CASA ', parent_id: 0 }] });
  assert.equal(result.exitCode, 1);
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('Produttori omonimi: errore senza scelta arbitraria', async () => {
  const result = await sandbox({ manufacturers: [{ manufacturer_id: 40, name: 'Marca' }, { manufacturer_id: 41, name: ' MARCA ' }] });
  assert.equal(result.exitCode, 1);
});
test('Punteggiatura categorie conservata; solo maggiore separa la gerarchia', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false' }, categories: [], products: [{ ...source, product_type: 'Casa, bagno/cucina | accessori > Cura' }] });
  const created = result.calls.filter(call => call.method === 'addInventoryCategory');
  assert.equal(created.length, 2);
  assert.equal(created[0].parameters.name, 'Casa, bagno/cucina | accessori');
});
test('Warehouse ambiguo blocca lo stock; ID esplicito risolve', async () => {
  const warehouses = [{ warehouse_id: 30, warehouse_type: 'bl' }, { warehouse_id: 31, warehouse_type: 'bl' }];
  const inventories = [{ inventory_id: 10, is_default: true, price_groups: [20], default_price_group: 20, warehouses: ['bl_30', 'bl_31'] }];
  const options = { warehouses, inventories, products: [{ ...source, quantity: 2 }] };
  assert.equal((await sandbox(options)).exitCode, 1);
  assert.equal((await sandbox({ ...options, env: { BASE_WAREHOUSE_ID: 'bl_31' } })).exitCode, 0);
});
test('Flag non valido: nessuna richiesta API', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'TRUE' } });
  assert.equal(result.exitCode, 1);
  assert.equal(result.calls.length, 0);
});
test('Produttori: riuso cache e DRY_RUN anche nel comando separato', async () => {
  const result = await sandbox({ entry: '../src/productor.js', manufacturers: [], products: [{ brand: 'Marca' }, { brand: ' MARCA ' }], action: module => module.syncManufacturers() });
  assert.equal(result.logs.filter(log => log.includes('Produttore da creare')).length, 1);
  assert.ok(result.calls.every(call => call.method.startsWith('get')));
});
test('Convertitore legacy eseguito separatamente dal runtime remoto', async () => {
  const result = await sandbox({ entry: '../tools/legacy/xml-to-json.js', action: module => module.convertXmlToJson() });
  assert.equal(result.writes.size, 1);
  const products = JSON.parse([...result.writes.values()][0]);
  assert.equal(products.length, 1);
  assert.equal(products[0].mpn, products[0].id);
  assert.equal(products[0].tax_rate, '22');
  assert.equal(result.calls.length, 0);
});


const successResponse = data => ({ ok: true, json: async () => ({ status: 'SUCCESS', ...data }) });
const writeTimeout = method => {
  if (method === 'addInventoryProduct') throw Object.assign(new Error('Risposta persa'), { name: 'TimeoutError' });
};

for (const returnedName of ['Birra Becagli', 'birra becagli', '  birra   becagli  ']) {
  test(`Produttore incerto: riconcilia nome equivalente ${JSON.stringify(returnedName)} e aggiorna la cache`, async () => {
    const result = await sandbox({ entry: '../src/manufacturers.js', env: { DRY_RUN: 'false' },
      response: method => {
        if (method === 'addInventoryManufacturer') throw new Error('Risposta persa dopo il salvataggio');
        if (method === 'getInventoryManufacturers') {
          return successResponse({ manufacturers: [{ manufacturer_id: 81, name: returnedName }] });
        }
      },
      action: async module => {
        const manufacturers = new Map();
        assert.equal(await module.ensureManufacturer('Birra Becagli', manufacturers), 81);
        assert.equal(manufacturers.get('birra becagli'), 81);
        assert.equal(await module.ensureManufacturer('  BIRRA   BECAGLI ', manufacturers), 81);
      },
    });
    assert.equal(result.calls.filter(call => call.method === 'addInventoryManufacturer').length, 1);
    assert.equal(result.calls.filter(call => call.method === 'getInventoryManufacturers').length, 1);
  });
}

test('Produttore incerto: nome diverso non viene riconciliato', async () => {
  const result = await sandbox({ entry: '../src/manufacturers.js', env: { DRY_RUN: 'false' },
    response: method => {
      if (method === 'addInventoryManufacturer') throw new Error('Risposta persa dopo il salvataggio');
      if (method === 'getInventoryManufacturers') {
        return successResponse({ manufacturers: [{ manufacturer_id: 82, name: 'Birra Rossi' }] });
      }
    },
    action: module => assert.rejects(module.ensureManufacturer('Birra Becagli', new Map()), error => error.uncertain === true),
  });
  assert.equal(result.calls.filter(call => call.method === 'addInventoryManufacturer').length, 1);
});

test('Produttore incerto: una variante del nome non ripete la CREATE dopo una verifica iniziale inconclusiva', async () => {
  const result = await sandbox({ entry: '../src/manufacturers.js', env: { DRY_RUN: 'false' },
    response: (method, parameters, calls) => {
      if (method === 'addInventoryManufacturer') throw new Error('Risposta persa dopo il salvataggio');
      if (method === 'getInventoryManufacturers') {
        const reads = calls.filter(call => call.method === method).length;
        return successResponse({ manufacturers: reads === 1 ? [] : [{ manufacturer_id: 83, name: ' birra   becagli ' }] });
      }
    },
    action: async module => {
      const manufacturers = new Map();
      await assert.rejects(module.ensureManufacturer('Birra Becagli', manufacturers), error => error.uncertain === true);
      assert.equal(await module.ensureManufacturer(' BIRRA  BECAGLI ', manufacturers), 83);
      assert.equal(manufacturers.get('birra becagli'), 83);
    },
  });
  assert.equal(result.calls.filter(call => call.method === 'addInventoryManufacturer').length, 1);
  assert.equal(result.calls.filter(call => call.method === 'getInventoryManufacturers').length, 2);
});

test('Categoria incerta: nome equivalente e stesso parent riconciliano e aggiornano la cache', async () => {
  const result = await sandbox({ entry: '../src/categories.js', env: { DRY_RUN: 'false' },
    response: method => {
      if (method === 'addInventoryCategory') throw new Error('Risposta persa dopo il salvataggio');
      if (method === 'getInventoryCategories') {
        return successResponse({ categories: [{ category_id: 91, parent_id: 0, name: '  bIrRe   artigianali  ' }] });
      }
    },
    action: async module => {
      const categories = new Map();
      assert.equal(await module.ensureCategoryPath('Birre artigianali', 10, categories), 91);
      assert.equal(categories.get('0:birre artigianali'), 91);
      assert.equal(await module.ensureCategoryPath(' BIRRE   ARTIGIANALI ', 10, categories), 91);
    },
  });
  assert.equal(result.calls.filter(call => call.method === 'addInventoryCategory').length, 1);
  assert.equal(result.calls.filter(call => call.method === 'getInventoryCategories').length, 1);
});

for (const scenario of ['parent diverso', 'ambiguo']) {
  test(`Categoria incerta: ${scenario} non viene riconciliato arbitrariamente`, async () => {
    const categories = scenario === 'parent diverso'
      ? [{ category_id: 91, parent_id: 99, name: 'BIRRE' }]
      : [{ category_id: 91, parent_id: 0, name: 'Birre' }, { category_id: 92, parent_id: 0, name: ' BIRRE ' }];
    const result = await sandbox({ entry: '../src/categories.js', env: { DRY_RUN: 'false' },
      response: method => {
        if (method === 'addInventoryCategory') throw new Error('Risposta persa dopo il salvataggio');
        if (method === 'getInventoryCategories') return successResponse({ categories });
      },
      action: module => assert.rejects(module.ensureCategoryPath('Birre', 10, new Map()), error => error.uncertain === true),
    });
    assert.equal(result.calls.filter(call => call.method === 'addInventoryCategory').length, 1);
  });
}

test('Categoria incerta: una variante del nome non ripete la CREATE dopo una verifica iniziale inconclusiva', async () => {
  const result = await sandbox({ entry: '../src/categories.js', env: { DRY_RUN: 'false' },
    response: (method, parameters, calls) => {
      if (method === 'addInventoryCategory') throw new Error('Risposta persa dopo il salvataggio');
      if (method === 'getInventoryCategories') {
        const reads = calls.filter(call => call.method === method).length;
        return successResponse({ categories: reads === 1 ? [] : [{ category_id: 93, parent_id: 0, name: ' BIRRE ' }] });
      }
    },
    action: async module => {
      const categories = new Map();
      await assert.rejects(module.ensureCategoryPath('Birre', 10, categories), error => error.uncertain === true);
      assert.equal(await module.ensureCategoryPath(' BIRRE ', 10, categories), 93);
      assert.equal(categories.get('0:birre'), 93);
    },
  });
  assert.equal(result.calls.filter(call => call.method === 'addInventoryCategory').length, 1);
  assert.equal(result.calls.filter(call => call.method === 'getInventoryCategories').length, 2);
});

test('Categorie e produttori: CREATE confermata, DRY_RUN ed errore definitivo restano invariati', async () => {
  const confirmed = await sandbox({ entry: '../src/manufacturers.js', env: { DRY_RUN: 'false' },
    action: async module => {
      const manufacturers = new Map();
      assert.ok(await module.ensureManufacturer('Marca', manufacturers) > 0);
      assert.ok(manufacturers.get('marca') > 0);
    },
  });
  assert.deepEqual(confirmed.calls.map(call => call.method), ['addInventoryManufacturer']);

  const dry = await sandbox({ entry: '../src/categories.js', action: async module => {
    assert.equal(await module.ensureCategoryPath('Casa', 10, new Map()), null);
  } });
  assert.equal(dry.calls.length, 0);

  const definitive = await sandbox({ entry: '../src/categories.js', env: { DRY_RUN: 'false' },
    response: method => method === 'addInventoryCategory' ? { ok: false, status: 400 } : undefined,
    action: module => assert.rejects(module.ensureCategoryPath('Casa', 10, new Map()), error => !error.uncertain),
  });
  assert.deepEqual(definitive.calls.map(call => call.method), ['addInventoryCategory']);
});

test('API: lettura riuscita al primo tentativo', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', action: api => api.callBase('getInventories') });
  assert.equal(result.calls.length, 1);
  assert.equal(result.waits.length, 0);
});

test('API: HTTP 503 temporaneo, poi lettura riuscita', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js',
    response: (method, parameters, calls) => calls.length === 1 ? { ok: false, status: 503 } : undefined,
    action: api => api.callBase('getInventories'),
  });
  assert.equal(result.calls.length, 2);
  assert.ok(result.logs.some(line => line.includes('tentativo 2/3')));
});

for (const response of [
  { ok: false, status: 400 },
  { ok: true, json: async () => ({ status: 'ERROR', error_code: 'BAD_INPUT', error_message: 'Dati errati' }) },
]) {
  test('API: errore definitivo senza retry ' + (response.status ?? 'BAD_INPUT'), async () => {
    const result = await sandbox({ entry: '../src/baseApi.js', response: () => response,
      action: api => assert.rejects(api.callBase('getInventories'), error => error.temporary === false),
    });
    assert.equal(result.calls.length, 1);
  });
}

test('API: rete instabile, limite 3 tentativi e attesa progressiva', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', networkError: true,
    action: api => assert.rejects(api.callBase('getInventories'), /Rete simulata/),
  });
  assert.equal(result.calls.length, 3);
  assert.deepEqual(result.waits, [1000, 2000]);
});

test('API: limite configurabile di un tentativo', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', httpError: true, env: { BASE_API_READ_ATTEMPTS: '1' },
    action: api => assert.rejects(api.callBase('getInventories'), /503/),
  });
  assert.equal(result.calls.length, 1);
});

test('API: poche chiamate concorrenti senza attesa artificiale', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js',
    action: api => Promise.all([api.callBase('getInventories'), api.callBase('getInventoryPriceGroups'), api.callBase('getInventoryCategories')]),
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 0, 0]);
  assert.deepEqual(result.waits, []);
});

for (const header of ['5', 'Thu, 01 Jan 1970 00:00:05 GMT']) {
  test('API: HTTP 429 rispetta Retry-After ' + header, async () => {
    const result = await sandbox({ entry: '../src/baseApi.js', env: { BASE_API_RATE_LIMIT_DELAY_MS: '100' },
      response: (method, parameters, calls) => calls.length === 1
        ? { ok: false, status: 429, headers: { get: () => header } } : undefined,
      action: api => api.callBase('getInventories'),
    });
    assert.deepEqual(result.waits, [5000]);
    assert.equal(result.calls.length, 2);
  });
}

test('API: ERROR_BLOCKED_TOKEN applica pausa condivisa anche dopo esaurimento tentativi', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { BASE_API_READ_ATTEMPTS: '1', BASE_API_RATE_LIMIT_DELAY_MS: '9000' },
    response: (method, parameters, calls) => calls.length === 1
      ? { ok: true, json: async () => ({ status: 'ERROR', error_code: 'ERROR_BLOCKED_TOKEN', error_message: 'Query limit exceeded' }) } : undefined,
    action: async api => {
      await assert.rejects(api.callBase('getInventories'), /ERROR_BLOCKED_TOKEN/);
      await api.callBase('getInventoryPriceGroups');
    },
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 9000]);
});

test('API: configurazione rate limiter non valida blocca prima della rete', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { BASE_API_READ_ATTEMPTS: 'NaN' },
    action: api => assert.rejects(api.callBase('getInventories'), /BASE_API_READ_ATTEMPTS/),
  });
  assert.equal(result.calls.length, 0);
});

test('CREATE: successo normale, una scrittura e nessuna riconciliazione', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' },
    action: async api => assert.equal((await api.sendProductToBase(normalizeProduct(source), config)).product_id, 60),
  });
  assert.deepEqual(result.calls.map(call => call.method), ['addInventoryProduct']);
});

for (const failure of ['timeout', '503', 'json', 'missing-id', 'missing-status']) {
  test('CREATE incerta: ' + failure + ', SKU e valori confermati senza seconda CREATE', async () => {
    const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, existing: true,
      response: method => {
        if (method !== 'addInventoryProduct') return;
        if (failure === 'timeout') return writeTimeout(method);
        if (failure === '503') return { ok: false, status: 503 };
        if (failure === 'json') return { ok: true, json: async () => { throw new Error('JSON troncato'); } };
        if (failure === 'missing-id') return successResponse({});
        return { ok: true, json: async () => ({}) };
      },
      action: async api => {
        const result = await api.sendProductToBase(normalizeProduct(source), config);
        assert.equal(result.product_id, 60);
        assert.equal(result.confirmed_after_uncertain, true);
      },
    });
    assert.deepEqual(result.calls.map(call => call.method), ['addInventoryProduct', 'getInventoryProductsList', 'getInventoryProductsData']);
    const lookup = result.calls[1].parameters;
    assert.equal(lookup.inventory_id, 10);
    assert.equal(lookup.filter_sku, source.id);
  });
}

for (const scenario of ['absent', 'ambiguous', 'different', 'read-failed', 'cdn']) {
  test('CREATE incerta: ' + scenario + ' resta incerta e non viene ritentata', async () => {
    const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, existing: scenario !== 'absent',
      matches: scenario === 'ambiguous' ? { 60: { sku: source.id }, 61: { sku: source.id } } : undefined,
      details: scenario === 'different' ? { ...details, text_fields: { name: 'Altro' } }
        : scenario === 'cdn' ? { ...details, images: { 1: 'https://upload.cdn.baselinker.com/unknown.jpg' } } : undefined,
      response: method => {
        if (scenario === 'read-failed' && method === 'getInventoryProductsList') throw new Error('Rete verifica assente');
        return writeTimeout(method);
      },
      action: api => assert.rejects(api.sendProductToBase(normalizeProduct({ ...source,
        ...(scenario === 'cdn' ? { image_link: 'https://example.org/image.jpg' } : {}),
      }), config), error => error.uncertain === true && (scenario !== 'ambiguous' || /ambiguo/.test(error.message))),
    });
    assert.equal(result.calls.filter(call => call.method === 'addInventoryProduct').length, 1);
  });
}

test('CREATE: rifiuto API definitivo senza retry o riconciliazione', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' },
    response: () => ({ ok: true, json: async () => ({ status: 'ERROR', error_code: 'INVALID_DATA' }) }),
    action: api => assert.rejects(api.sendProductToBase(normalizeProduct(source), config), error => !error.uncertain),
  });
  assert.equal(result.calls.length, 1);
});

test('UPDATE incerto: verifica lo stesso ID e solo i valori inviati', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, response: writeTimeout,
    details: { ...details, text_fields: { name: 'Modifica esterna non inviata' } },
    action: async api => {
      const result = await api.updateProductInBase(60, normalizeProduct(source), config, { ...details, prices: { 20: 24 } });
      assert.equal(result.product_id, 60);
      assert.equal(result.confirmed_after_uncertain, true);
    },
  });
  assert.deepEqual(result.calls.map(call => call.method), ['addInventoryProduct', 'getInventoryProductsData']);
  assert.equal(result.calls[1].parameters.products[0], 60);
});

for (const scenario of ['different', 'wrong-sku', 'read-failed']) {
  test('UPDATE incerto: ' + scenario + ' non conferma e non ripete la scrittura', async () => {
    const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' },
      details: { ...details, ...(scenario === 'wrong-sku' ? { sku: 'ALTRO' } : { prices: { 20: 24 } }) },
      response: method => {
        if (scenario === 'read-failed' && method === 'getInventoryProductsData') throw new Error('Verifica non disponibile');
        return writeTimeout(method);
      },
      action: api => assert.rejects(api.updateProductInBase(60, normalizeProduct(source), config,
        { ...details, prices: { 20: 24 } }), error => error.uncertain === true),
    });
    assert.equal(result.calls.filter(call => call.method === 'addInventoryProduct').length, 1);
  });
}

test('Report: SKU incerto separato dagli errori, prosecuzione e uscita non riuscita', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false', TEST_MODE: 'false' },
    products: [source, { ...source, id: 'SKU-B' }],
    response: (method, parameters) => { if (method === 'addInventoryProduct' && parameters.sku === source.id) return writeTimeout(method); },
  });
  assert.equal(result.exitCode, 1);
  for (const line of ['Esiti incerti: 1', 'SKU con esito incerto: SKU-A', 'Errori: 0', 'Creati: 1']) {
    assert.ok(result.logs.some(log => log.includes(line)), line);
  }
  assert.equal(result.calls.filter(call => call.method === 'addInventoryProduct').length, 2);
});

test('Report: CREATE confermata dopo incertezza conteggiata come creata', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false' },
    response: (method, parameters, calls) => {
      if (method === 'addInventoryProduct') return writeTimeout(method);
      if (method === 'getInventoryProductsList' && calls.some(call => call.method === 'addInventoryProduct')) {
        return successResponse({ products: { 60: { sku: source.id } } });
      }
    },
  });
  assert.equal(result.exitCode, 0);
  assert.ok(result.logs.some(log => log.includes('Creati: 1')));
  assert.ok(result.logs.some(log => log.includes('Esiti incerti: 0')));
});

test('DRY_RUN: nessuna scrittura o riconciliazione, gate chiuso anche per metodi sconosciuti', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', action: async api => {
    for (const method of ['addInventoryProduct', 'addInventoryManufacturer', 'addInventoryCategory', 'getUnknownOperation']) {
      await assert.rejects(api.callBase(method, {}), /bloccata/);
    }
    assert.equal(await api.sendProductToBase(normalizeProduct(source), config), null);
    assert.equal(await api.updateProductInBase(60, normalizeProduct(source), config, { ...details, prices: { 20: 24 } }), null);
  } });
  assert.equal(result.calls.length, 0);
});

test('Scrittura incerta ripresentata nel processo: nessun nuovo invio, anche per categorie', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, networkError: true,
    action: async api => {
      for (let i = 0; i < 2; i++) {
        await assert.rejects(api.callBase('addInventoryCategory', { inventory_id: 10, name: 'Casa', parent_id: 0 }), error => error.uncertain === true);
      }
    },
  });
  assert.equal(result.calls.length, 1);
});


test('UPDATE: successo ordinario mantiene product_id e non verifica di nuovo', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' },
    action: async api => assert.equal((await api.updateProductInBase(60, normalizeProduct(source), config,
      { ...details, prices: { 20: 24 } })).product_id, 60),
  });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].parameters.product_id, 60);
});

test('CREATE incerta: SKU diverso nel dettaglio non conferma identita', async () => {
  await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, existing: true,
    details: { ...details, sku: 'ALTRO' }, response: writeTimeout,
    action: api => assert.rejects(api.sendProductToBase(normalizeProduct(source), config), error => error.uncertain),
  });
});

test('UPDATE incerto: stock vuoto non conferma quantita zero', async () => {
  await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' },
    details: { ...details, stock: { bl_30: '' } }, response: writeTimeout,
    action: api => assert.rejects(api.updateProductInBase(60, { ...normalizeProduct(source), quantity: 0 }, config,
      { ...details, stock: { bl_30: 2 } }), error => error.uncertain),
  });
});

test('CREATE incerta: tutti i campi inviati corrispondono, anche EAN stock e immagine', async () => {
  const product = { ...normalizeProduct(source), ean: '12345678', quantity: 2, image_link: 'https://example.org/a.jpg', manufacturer_id: 40, category_id: 51 };
  await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' }, existing: true, response: writeTimeout,
    details: { ...details, ean: '12345678', stock: { bl_30: '2' }, images: { 1: 'https://example.org/a.jpg' } },
    action: async api => assert.equal((await api.sendProductToBase(product, config)).confirmed_after_uncertain, true),
  });
});

test('UPDATE incerto: errore riportato separatamente nel main', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false' }, existing: true, details: { ...details, prices: { 20: 24 } }, response: writeTimeout });
  assert.equal(result.exitCode, 1);
  assert.ok(result.logs.some(line => line.includes('Esiti incerti: 1')));
  assert.ok(result.logs.some(line => line.includes('Aggiornati: 0')));
  assert.ok(result.logs.some(line => line.includes('Errori: 0')));
  assert.equal(result.calls.filter(call => call.method === 'addInventoryProduct').length, 1);
});

test('UPDATE confermato dopo timeout conteggiato come aggiornato nel main', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false' }, existing: true, details: { ...details, prices: { 20: 24 } },
    response: (method, parameters, calls) => {
      if (method === 'addInventoryProduct') return writeTimeout(method);
      if (method === 'getInventoryProductsData' && calls.some(call => call.method === 'addInventoryProduct')) {
        return successResponse({ products: { 60: details } });
      }
    },
  });
  assert.equal(result.exitCode, 0);
  assert.ok(result.logs.some(line => line.includes('Aggiornati: 1')));
  assert.ok(result.logs.some(line => line.includes('Esiti incerti: 0')));
});

test('CREATE rifiutata per rate limit: una richiesta, errore temporaneo ma non incerto', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { DRY_RUN: 'false' },
    response: () => ({ ok: true, json: async () => ({ status: 'ERROR', error_code: 'ERROR_BLOCKED_TOKEN' }) }),
    action: api => assert.rejects(api.sendProductToBase(normalizeProduct(source), config), error => error.temporary && !error.uncertain),
  });
  assert.equal(result.calls.length, 1);
});

test('Log retry e incertezza non espongono il token restituito in un errore', async () => {
  const result = await sandbox({ env: { DRY_RUN: 'false' },
    response: method => { if (method === 'addInventoryProduct') throw new Error('Errore con test-only-token'); },
  });
  assert.ok(result.logs.some(line => line.includes('[TOKEN NASCOSTO]')));
  assert.ok(result.logs.every(line => !line.includes('test-only-token')));
});


test('Finestra mobile: prime 80 richieste a piena velocita con configurazione predefinita', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', action: async api => {
    for (let i = 0; i < 80; i++) await api.callBase('getInventories');
  } });
  assert.equal(result.calls.length, 80);
  assert.ok(result.calls.every(call => call.at === 0));
  assert.deepEqual(result.waits, []);
});

test('Finestra mobile: rallentamento progressivo dalla soglia soft', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', action: async api => {
    for (let i = 0; i < 83; i++) await api.callBase('getInventories');
  } });
  assert.deepEqual(result.waits, [30, 60, 90]);
  assert.deepEqual(result.calls.slice(80).map(call => call.at), [30, 90, 180]);
});

test('Finestra mobile: limite predefinito 100 rispettato anche con 200 richieste concorrenti', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', action: api =>
    Promise.all(Array.from({ length: 200 }, () => api.callBase('getInventories'))),
  });
  assert.equal(result.calls.length, 200);
  assert.equal(result.calls[100].at, 60000);
  for (let index = 0; index < result.calls.length; index++) {
    const now = result.calls[index].at;
    const count = result.calls.slice(0, index + 1).filter(call => call.at > now - 60000).length;
    assert.ok(count <= 100, `Superata soglia: ${count} a ${now}`);
  }
});

const smallLimit = { BASE_API_REQUESTS_PER_MINUTE: '4' };

test('Finestra mobile: hard limit attende la scadenza piu vecchia e libera posti', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: smallLimit, action: async api => {
    for (let i = 0; i < 5; i++) await api.callBase('getInventories');
  } });
  assert.deepEqual(result.calls.map(call => call.at), [0, 0, 0, 15000, 60000]);
  assert.deepEqual(result.waits, [15000, 45000]);
});

test('Finestra mobile: inattivita svuota la finestra, senza nuova attesa', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: smallLimit,
    action: async (api, clock) => {
      await api.callBase('getInventories');
      clock.advance(20000);
      await api.callBase('getInventories');
      clock.advance(60000);
      await api.callBase('getInventories');
      await api.callBase('getInventories');
    },
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 20000, 80000, 80000]);
  assert.deepEqual(result.waits, []);
});

test('Finestra mobile: latenza naturale gia sufficiente non aggiunge delay', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: smallLimit,
    action: async (api, clock) => {
      await api.callBase('getInventories');
      await api.callBase('getInventories');
      clock.advance(20000);
      await api.callBase('getInventories');
    },
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 0, 20000]);
  assert.deepEqual(result.waits, []);
});

test('Finestra mobile: retry contati come vere richieste e soglia hard rispettata', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js',
    env: { BASE_API_REQUESTS_PER_MINUTE: '1', BASE_API_RETRY_DELAY_MS: '10' },
    response: (method, parameters, calls) => calls.length === 1 ? { ok: false, status: 503 } : undefined,
    action: api => api.callBase('getInventories'),
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 60000]);
});

test('Finestra mobile: scritture e letture condividono lo stesso conteggio', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { ...smallLimit, DRY_RUN: 'false' },
    action: async api => {
      await api.callBase('getInventories');
      await api.callBase('addInventoryCategory', { inventory_id: 10, name: 'Casa', parent_id: 0 });
      await api.callBase('getInventoryPriceGroups');
      await api.callBase('addInventoryManufacturer', { manufacturer_name: 'Marca' });
      await api.callBase('getInventoryManufacturers');
    },
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 0, 0, 15000, 60000]);
});

test('Finestra mobile: DRY_RUN bloccato non occupa posti', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: smallLimit,
    action: async api => {
      for (let i = 0; i < 5; i++) await assert.rejects(api.callBase('addInventoryProduct', {}), /bloccata/);
      await api.callBase('getInventories');
      await api.callBase('getInventoryPriceGroups');
    },
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 0]);
  assert.deepEqual(result.waits, []);
});

test('Finestra mobile: backoff reattivo prevale e pulisce i timestamp scaduti', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js',
    env: { ...smallLimit, BASE_API_RATE_LIMIT_DELAY_MS: '100' },
    response: (method, parameters, calls) => calls.length === 1
      ? { ok: false, status: 429, headers: { get: () => '5' } } : undefined,
    action: async api => {
      await api.callBase('getInventories');
      await api.callBase('getInventoryPriceGroups');
    },
  });
  assert.deepEqual(result.calls.map(call => call.at), [0, 5000, 5000]);
  assert.deepEqual(result.waits, [5000]);
});

for (const [raw, expected] of [[undefined, 100], ['', 100], ['100', 100], ['200', 200], ['500', 500], ['1', 1]]) {
  test('Rate limiter: configurazione ' + JSON.stringify(raw) + ' produce ' + expected, async () => {
    const env = raw === undefined ? {} : { BASE_API_REQUESTS_PER_MINUTE: raw };
    const result = await sandbox({ entry: '../src/config.js', env,
      action: config => assert.equal(config.getBaseApiRequestsPerMinute(), expected),
    });
    assert.equal(result.calls.length, 0);
  });
}

for (const raw of ['abc', '0', '-1']) {
  test('Rate limiter: valore non valido bloccato ' + JSON.stringify(raw), async () => {
    const env = { BASE_API_REQUESTS_PER_MINUTE: raw };
    const result = await sandbox({ entry: '../src/baseApi.js', env,
      action: api => assert.rejects(api.callBase('getInventories'), /BASE_API_/),
    });
    assert.equal(result.calls.length, 0);
  });
}

test('Rate limiter: il limite configurato 200 viene applicato realmente', async () => {
  const result = await sandbox({ entry: '../src/baseApi.js', env: { BASE_API_REQUESTS_PER_MINUTE: '200' },
    action: api => Promise.all(Array.from({ length: 201 }, () => api.callBase('getInventories'))),
  });
  assert.equal(result.calls[199].at < 60000, true);
  assert.equal(result.calls[200].at, 60000);
});
