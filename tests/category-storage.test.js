import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rename, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadCategoryMappings, resolveSupplierProfile, normalizeCategory,
  analyzeCatalogCategories, createSupplierDraft, isMissingSourceCategory,
  validateCategoryMappings, buildCategoryAutoMapIndex, suggestCategoryMapping,
} from '../src/categoryNormalizer.js';
import { recordNoNameProducts } from '../src/noNameReport.js';

async function withConfig(action, suppliers = {}, canonical = { FRAGRANCE: { base_path: ['Bellezza', 'Profumi'] } }) {
  const directory = await mkdtemp(join(tmpdir(), 'vudoo-categories-'));
  const rootUrl = pathToFileURL(directory + sep);
  try {
    await mkdir(join(directory, 'suppliers'));
    await writeFile(join(directory, 'canonical-categories.json'), JSON.stringify(canonical));
    for (const [filename, supplier] of Object.entries(suppliers)) {
      await writeFile(join(directory, 'suppliers', filename), JSON.stringify(supplier));
    }
    return await action({ directory, rootUrl });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const supplierA = {
  supplier_id: 'SUPPLIER_A',
  source_titles: ['Fornitore A'],
  categories: { PROFUMERIA: 'FRAGRANCE' },
};
const supplierB = {
  supplier_id: 'SUPPLIER_B',
  source_titles: ['Fornitore B'],
  categories: { PARFUM: 'FRAGRANCE' },
};

test('Configurazione: carica automaticamente più supplier e condivide il vocabolario canonico', async () => {
  await withConfig(async ({ rootUrl }) => {
    const mappings = await loadCategoryMappings(rootUrl);
    assert.equal(mappings.suppliers.size, 2);
    for (const [title, category] of [['fornitore a', 'PROFUMERIA'], [' FORNITORE   B ', 'PARFUM']]) {
      const supplier = resolveSupplierProfile(title, mappings);
      assert.deepEqual(normalizeCategory({ supplier, sourceCategory: category, mappings }).basePath, ['Bellezza', 'Profumi']);
    }
  }, { 'supplier-a.json': supplierA, 'supplier-b.json': supplierB });
});

test('Configurazione: supplier ID duplicato e source title ambiguo bloccano il caricamento', async () => {
  await withConfig(async ({ rootUrl }) => {
    await assert.rejects(loadCategoryMappings(rootUrl), /Supplier ID duplicato/);
  }, { 'supplier-a.json': supplierA, 'supplier-b.json': { ...supplierB, supplier_id: 'supplier_a' } });
  await withConfig(async ({ rootUrl }) => {
    await assert.rejects(loadCategoryMappings(rootUrl), /Source title ambiguo/);
  }, { 'supplier-a.json': supplierA, 'supplier-b.json': { ...supplierB, source_titles: [' FORNITORE   A '] } });
});

test('Configurazione: JSON invalido e canonical ID inesistente bloccano il caricamento', async () => {
  await withConfig(async ({ directory, rootUrl }) => {
    await writeFile(join(directory, 'suppliers', 'broken.json'), '{');
    await assert.rejects(loadCategoryMappings(rootUrl), /non è JSON valido/);
  });
  await withConfig(async ({ rootUrl }) => {
    await assert.rejects(loadCategoryMappings(rootUrl), /canonical .* non definita/);
  }, { 'supplier-a.json': { ...supplierA, categories: { PROFUMERIA: 'MISSING' } } });
});

test('Categorie sorgente mancanti: assente, vuota e No name sono distinte dalle categorie reali', () => {
  for (const value of [undefined, null, '', '  ', 'No name > No name', ' NO   NAME> no NAME ']) {
    assert.equal(isMissingSourceCategory(value), true);
  }
  assert.equal(isMissingSourceCategory('Bellezza > Nuova Categoria'), false);
  const products = [
    { id: '1' }, { id: '2', product_type: ' ' },
    { id: '3', product_type: ' NO   NAME> no NAME ' },
    { id: '4', product_type: 'PROFUMERIA' },
    { id: '5', product_type: 'Nuova Categoria' },
  ];
  const mappings = {
    canonical: new Map([['FRAGRANCE', { basePath: ['Bellezza', 'Profumi'] }]]),
    suppliers: new Map(),
    supplierByTitle: new Map(),
  };
  const supplier = { id: 'SUPPLIER_A', categories: new Map([['profumeria', 'FRAGRANCE']]), file: 'config/suppliers/supplier-a.json' };
  mappings.suppliers.set(supplier.id, supplier);
  mappings.supplierByTitle.set('fornitore a', supplier.id);
  const analysis = analyzeCatalogCategories({ channelTitle: 'Fornitore A', products, uniqueProducts: products }, mappings);
  assert.equal(analysis.missingSourceCategoryProducts, 3);
  assert.equal(analysis.importableProducts, 1);
  assert.equal(analysis.unmappedValidCategoryProducts, 1);
  assert.equal(analysis.entries.length, 2);
  assert.deepEqual(analysis.missingProducts.map(product => product.id), ['1', '2', '3']);
});

test('Nuovo supplier: bozza deterministica, categorie reali uniche e nessuna sovrascrittura', async () => {
  await withConfig(async ({ directory, rootUrl }) => {
    const products = [
      { product_type: 'PARFUM' }, { product_type: 'PARFUM' },
      { product_type: 'HOME > DIFFUSERS' }, { product_type: 'No name > No name' },
      { product_type: '' },
    ];
    const analysis = analyzeCatalogCategories({ channelTitle: 'Pippo S.p.A.', products, uniqueProducts: products }, await loadCategoryMappings(rootUrl));
    const first = await createSupplierDraft(analysis, rootUrl);
    assert.equal(first.file, 'config/suppliers/pippo-spa.json');
    assert.equal(first.created, true);
    const filename = join(directory, 'suppliers', 'pippo-spa.json');
    const text = await readFile(filename, 'utf8');
    const draft = JSON.parse(text);
    assert.equal(draft.supplier_id, 'PIPPO_SPA');
    assert.deepEqual(draft.categories, { 'HOME > DIFFUSERS': null, PARFUM: 'FRAGRANCE' });
    assert.deepEqual(first.stats, { supplier: 1, canonical: 0, manual: 1 });
    const second = await createSupplierDraft(analysis, rootUrl);
    assert.equal(second.created, false);
    assert.equal(await readFile(filename, 'utf8'), text);
    const supplier = resolveSupplierProfile('Pippo S.p.A.', await loadCategoryMappings(rootUrl));
    assert.equal(supplier.categories.get('parfum'), 'FRAGRANCE');
  }, { 'supplier-b.json': supplierB });
});

test('Auto-mapping: un mapping approvato, anche da due supplier, usa l’identità esistente', () => {
  const mappings = validateCategoryMappings({
    canonical: { FRAGRANCE: { base_path: ['Bellezza', 'Profumi'] } },
    suppliers: {
      A: { source_titles: ['A'], categories: { 'Bellezza > Fragranze': 'FRAGRANCE' } },
      B: { source_titles: ['B'], categories: { ' bellezza   > fragranze ': 'FRAGRANCE' } },
    },
  });
  const index = buildCategoryAutoMapIndex(mappings);
  assert.deepEqual(suggestCategoryMapping('BELLEZZA > FRAGRANZE', index), {
    canonicalId: 'FRAGRANCE', origin: 'supplier',
  });
  assert.deepEqual(suggestCategoryMapping('  Bellezza   > Fragranze  ', index), {
    canonicalId: 'FRAGRANCE', origin: 'supplier',
  });
});

test('Auto-mapping: approvazioni discordanti restano manuali anche con un base_path coincidente', () => {
  const mappings = validateCategoryMappings({
    canonical: {
      FRAGRANCE: { base_path: ['Altri Prodotti'] },
      BODY_CREAM: { base_path: ['Cura del corpo', 'Creme'] },
    },
    suppliers: {
      A: { source_titles: ['A'], categories: { 'Altri Prodotti': 'FRAGRANCE' } },
      B: { source_titles: ['B'], categories: { ' altri   prodotti ': 'BODY_CREAM' } },
    },
  });
  assert.deepEqual(suggestCategoryMapping('ALTRI PRODOTTI', buildCategoryAutoMapIndex(mappings)), {
    canonicalId: null, origin: null,
  });
});

test('Auto-mapping: base_path canonico richiede identità unica sull’intero percorso', () => {
  const mappings = validateCategoryMappings({
    canonical: {
      FRAGRANCE: { base_path: ['Bellezza', 'Profumi'] },
      HOME: { base_path: ['Casa', 'Profumi'] },
    },
    suppliers: {},
  });
  const index = buildCategoryAutoMapIndex(mappings);
  assert.deepEqual(suggestCategoryMapping(' BELLEZZA > PROFUMI ', index), {
    canonicalId: 'FRAGRANCE', origin: 'canonical',
  });
  for (const source of ['Profumi', 'Bellezza', 'Altra > Profumi', 'Sconosciuta',
    'No name > No name', '', undefined]) {
    assert.deepEqual(suggestCategoryMapping(source, index), { canonicalId: null, origin: null }, String(source));
  }
});

test('Auto-mapping: base_path canonico duplicato o discordante con mapping approvato resta manuale', () => {
  const duplicated = validateCategoryMappings({
    canonical: {
      FIRST: { base_path: ['Bellezza', 'Profumi'] },
      SECOND: { base_path: [' bellezza ', 'profumi'] },
    },
    suppliers: {},
  });
  assert.deepEqual(suggestCategoryMapping('Bellezza > Profumi', buildCategoryAutoMapIndex(duplicated)), {
    canonicalId: null, origin: null,
  });
  const contradictory = validateCategoryMappings({
    canonical: {
      FIRST: { base_path: ['Bellezza', 'Profumi'] },
      SECOND: { base_path: ['Casa', 'Profumi'] },
    },
    suppliers: {
      A: { source_titles: ['A'], categories: { 'Bellezza > Profumi': 'SECOND' } },
    },
  });
  assert.deepEqual(suggestCategoryMapping('Bellezza > Profumi', buildCategoryAutoMapIndex(contradictory)), {
    canonicalId: null, origin: null,
  });
});

test('Nuovo supplier: scaffold misto usa tutti i profili, conserva null e non riscrive file esistenti', async () => {
  const existingA = {
    supplier_id: 'A', source_titles: ['A'], categories: { 'Fragranze originali': 'FRAGRANCE' },
  };
  const existingB = {
    supplier_id: 'B', source_titles: ['B'], categories: { ' fragranze   originali ': 'FRAGRANCE' },
  };
  const canonical = {
    FRAGRANCE: { base_path: ['Bellezza', 'Profumi'] },
    HOME: { base_path: ['Casa', 'Diffusori'] },
  };
  await withConfig(async ({ directory, rootUrl }) => {
    const existingFile = join(directory, 'suppliers', 'supplier-a.json');
    const original = await readFile(existingFile, 'utf8');
    const mappings = await loadCategoryMappings(rootUrl);
    const products = [
      { product_type: '  FRAGRANZE   ORIGINALI ' },
      { product_type: ' casa > diffusori ' },
      { product_type: 'Nuova categoria' },
      { product_type: 'No name > No name' },
      { product_type: '' },
    ];
    const analysis = analyzeCatalogCategories({
      channelTitle: 'Nuovo Supplier', products, uniqueProducts: products,
    }, mappings);
    const created = await createSupplierDraft(analysis, rootUrl, mappings);
    assert.equal(created.created, true);
    assert.deepEqual(created.stats, { supplier: 1, canonical: 1, manual: 1 });
    assert.deepEqual(created.draft.categories, {
      '  FRAGRANZE   ORIGINALI ': 'FRAGRANCE',
      ' casa > diffusori ': 'HOME',
      'Nuova categoria': null,
    });
    const filename = join(directory, 'suppliers', 'nuovo-supplier.json');
    const scaffold = await readFile(filename, 'utf8');
    assert.deepEqual(JSON.parse(scaffold).categories, created.draft.categories);
    const repeated = await createSupplierDraft(analysis, rootUrl);
    assert.equal(repeated.created, false);
    assert.equal(await readFile(filename, 'utf8'), scaffold);
    assert.equal(await readFile(existingFile, 'utf8'), original);
  }, { 'supplier-a.json': existingA, 'supplier-b.json': existingB }, canonical);
});

test('Nuovo supplier: collisione di filename o supplier ID non altera profili esistenti', async () => {
  await withConfig(async ({ directory, rootUrl }) => {
    const mappings = await loadCategoryMappings(rootUrl);
    const analysis = analyzeCatalogCategories({
      channelTitle: 'Pippo S.p.A.',
      products: [{ product_type: 'PARFUM' }],
      uniqueProducts: [{ product_type: 'PARFUM' }],
    }, mappings);
    const filename = join(directory, 'suppliers', 'pippo-spa.json');
    const original = JSON.stringify({
      supplier_id: 'OTHER', source_titles: ['Pippo SPA diverso'], categories: {},
    });
    await writeFile(filename, original);
    await assert.rejects(createSupplierDraft(analysis, rootUrl, mappings), /esiste già per un altro titolo/);
    assert.equal(await readFile(filename, 'utf8'), original);
  });
  await withConfig(async ({ rootUrl }) => {
    const mappings = await loadCategoryMappings(rootUrl);
    const analysis = analyzeCatalogCategories({
      channelTitle: 'Pippo S.p.A.',
      products: [{ product_type: 'PARFUM' }],
      uniqueProducts: [{ product_type: 'PARFUM' }],
    }, mappings);
    await assert.rejects(createSupplierDraft(analysis, rootUrl, mappings), /supplier_id PIPPO_SPA già in uso/);
  }, { 'different-name.json': {
    supplier_id: 'PIPPO_SPA', source_titles: ['Altro nome'], categories: {},
  } });
});

test('Wally: tutti i 15 mapping e i percorsi canonici migrati restano disponibili', async () => {
  const mappings = await loadCategoryMappings();
  const supplier = resolveSupplierProfile(' WALLY   1925 ', mappings);
  assert.equal(supplier.id, 'WALLY_1925');
  assert.ok(mappings.canonical.size >= 15);
  assert.equal(supplier.categories.size, 15);
  for (const [source, canonicalId] of supplier.categories) {
    assert.ok(mappings.canonical.has(canonicalId), source);
    assert.equal(mappings.canonical.get(canonicalId).basePath.length, 3);
  }
  assert.deepEqual(normalizeCategory({
    supplier, sourceCategory: 'Bellezza e Salute > Profumi > Fragranze', mappings,
  }).basePath, ['Bellezza e Salute', 'Profumi', 'Fragranze']);
});

test('Registro No name: crea file, deduplica, preserva first_seen e aggiorna last_seen e metadati', async () => {
  await withConfig(async ({ directory }) => {
    const reportUrl = pathToFileURL(join(directory, 'reports', 'no_name_products.json'));
    const first = { id: '532685', vudoo_sku: 'FAMILY', original_title: 'Titolo iniziale', product_type: 'No name > No name' };
    await recordNoNameProducts([first, first], 'WALLY_1925', 'Wally 1925', reportUrl, new Date('2026-01-01T00:00:00Z'));
    let records = JSON.parse(await readFile(reportUrl, 'utf8'));
    assert.equal(records.length, 1);
    assert.deepEqual(Object.keys(records[0]), ['supplier_id', 'source_title', 'id', 'sku', 'title', 'product_type', 'first_seen', 'last_seen']);
    assert.equal(records[0].first_seen, '2026-01-01T00:00:00.000Z');
    await recordNoNameProducts([{ ...first, original_title: 'Titolo aggiornato' }],
      'WALLY_1925', 'Wally 1925', reportUrl, new Date('2026-01-02T00:00:00Z'));
    await recordNoNameProducts([first],
      'OTHER', 'Altro', reportUrl, new Date('2026-01-03T00:00:00Z'));
    records = JSON.parse(await readFile(reportUrl, 'utf8'));
    assert.equal(records.length, 2);
    const wally = records.find(item => item.supplier_id === 'WALLY_1925');
    assert.equal(wally.title, 'Titolo aggiornato');
    assert.equal(wally.first_seen, '2026-01-01T00:00:00.000Z');
    assert.equal(wally.last_seen, '2026-01-02T00:00:00.000Z');
    assert.equal(records.find(item => item.supplier_id === 'OTHER').id, wally.id);
  });
});

test('Registro No name: file iniziale vuoto e JSON corrotto sono gestiti senza perdita silenziosa', async () => {
  await withConfig(async ({ directory }) => {
    const filename = join(directory, 'reports', 'no_name_products.json');
    await mkdir(join(directory, 'reports'));
    await writeFile(filename, '');
    const reportUrl = pathToFileURL(filename);
    await recordNoNameProducts([{ id: '1', product_type: '' }], 'TEST', 'Test', reportUrl);
    assert.equal(JSON.parse(await readFile(filename, 'utf8')).length, 1);
    await writeFile(filename, '{');
    await assert.rejects(recordNoNameProducts([{ id: '2' }], 'TEST', 'Test', reportUrl), /Impossibile leggere/);
    assert.equal(await readFile(filename, 'utf8'), '{');
  });
});

test('Registro No name: item senza g:id non crea identita fittizie o file', async () => {
  await withConfig(async ({ directory }) => {
    const reportUrl = pathToFileURL(join(directory, 'reports', 'no_name_products.json'));
    assert.equal(await recordNoNameProducts([{ product_type: 'No name > No name' }],
      'TEST', 'Test', reportUrl), 0);
    await assert.rejects(readFile(reportUrl, 'utf8'), { code: 'ENOENT' });
    assert.equal(await recordNoNameProducts([
      { product_type: '' }, { id: 'ID-1', product_type: 'No name > No name' },
    ], 'TEST', 'Test', reportUrl), 1);
    assert.deepEqual(JSON.parse(await readFile(reportUrl, 'utf8')).map(product => product.id), ['ID-1']);
  });
});

for (const [code, failures, expectedWaits] of [
  ['EPERM', 1, [100]], ['EBUSY', 2, [100, 250]],
]) {
  test(`Registro No name: rename ${code} temporaneo riesce senza duplicare le voci`, async () => {
    await withConfig(async ({ directory }) => {
      const reportUrl = pathToFileURL(join(directory, 'reports', 'no_name_products.json'));
      const waits = [];
      let attempts = 0;
      const io = {
        renameFile: async (...args) => {
          if (attempts++ < failures) throw Object.assign(new Error('lock simulato'), { code });
          await rename(...args);
        },
        wait: async ms => { waits.push(ms); },
      };
      const product = { id: 'ID-1', product_type: 'No name > No name' };
      await recordNoNameProducts([product], 'TEST', 'Test', reportUrl, new Date('2026-01-01'), io);
      await recordNoNameProducts([product], 'TEST', 'Test', reportUrl, new Date('2026-01-02'));
      const records = JSON.parse(await readFile(reportUrl, 'utf8'));
      assert.equal(records.length, 1);
      assert.equal(records[0].first_seen, '2026-01-01T00:00:00.000Z');
      assert.equal(records[0].last_seen, '2026-01-02T00:00:00.000Z');
      assert.equal(attempts, failures + 1);
      assert.deepEqual(waits, expectedWaits);
    });
  });
}

for (const [code, expectedAttempts, expectedWaits] of [
  ['EPERM', 4, [100, 250, 500]], ['EACCES', 1, []],
]) {
  test(`Registro No name: rename ${code} persistente fallisce e pulisce il temporaneo`, async () => {
    await withConfig(async ({ directory }) => {
      const reportUrl = pathToFileURL(join(directory, 'reports', 'no_name_products.json'));
      const product = { id: 'ID-1', product_type: '' };
      await recordNoNameProducts([product], 'TEST', 'Test', reportUrl);
      const original = await readFile(reportUrl, 'utf8');
      let attempts = 0;
      const waits = [];
      await assert.rejects(recordNoNameProducts([{ id: 'ID-2' }], 'TEST', 'Test', reportUrl, new Date(), {
        renameFile: async () => { attempts++; throw Object.assign(new Error('lock simulato'), { code }); },
        wait: async ms => { waits.push(ms); },
      }), /Impossibile aggiornare .*lock simulato/);
      assert.equal(attempts, expectedAttempts);
      assert.deepEqual(waits, expectedWaits);
      assert.equal(await readFile(reportUrl, 'utf8'), original);
      assert.deepEqual(await readdir(join(directory, 'reports')), ['no_name_products.json']);
    });
  });
}
