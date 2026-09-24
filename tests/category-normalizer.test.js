import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCategoryMappings,
  validateCategoryMappings,
  resolveSupplierProfile,
  normalizeCategory,
  analyzeCatalogCategories,
  formatCategoryReport,
  isMissingSourceCategory,
} from '../src/categoryNormalizer.js';
import { parseCatalog } from '../src/converter.js';
import { catalogXml } from './fixtures/vudoo.js';
import { parseUnmappedCategoryPolicy } from '../src/config.js';

const mappingSource = {
  canonical: {
    FRAGRANCE: { base_path: ['Bellezza e Salute', 'Profumi'] },
    MAKEUP_LIPS: { base_path: ['Bellezza e Salute', 'Cosmetici', 'Make-Up Labbra'] },
  },
  suppliers: {
    SUPPLIER_A: {
      source_titles: ['Fornitore A'],
      categories: { PROFUMERIA: 'FRAGRANCE', 'MAKE UP LIPS': 'MAKEUP_LIPS' },
    },
    SUPPLIER_B: {
      source_titles: ['Fornitore B', 'Secondo titolo B'],
      categories: { PARFUM: 'FRAGRANCE', LIPSTICK: 'MAKEUP_LIPS' },
    },
  },
};

for (const [raw, expected] of [[undefined, 'block'], ['', 'block'], ['block', 'block'], ['BLOCK', 'block'], ['skip', 'skip'], ['SKIP', 'skip']]) {
  test(`Categorie: policy ${JSON.stringify(raw)} produce ${expected}`, () => {
    assert.equal(parseUnmappedCategoryPolicy(raw), expected);
  });
}

test('Categorie: policy non valida produce un errore di configurazione', () => {
  assert.throws(() => parseUnmappedCategoryPolicy('continue'), /UNMAPPED_CATEGORY_POLICY/);
});

function mappings(overrides = {}) {
  return validateCategoryMappings({
    ...mappingSource,
    ...overrides,
  });
}

test('Categorie: parser catalogo conserva channel.title senza cambiare parseCatalogXml', () => {
  const catalog = parseCatalog(catalogXml());
  assert.equal(catalog.channelTitle, 'Test Supplier');
  assert.equal(catalog.products.length, 1);
});

test('Categorie: supplier risolto con trim, spazi e case-insensitive', () => {
  const config = mappings();
  assert.equal(resolveSupplierProfile('  FORNITORE   a ', config).id, 'SUPPLIER_A');
  assert.equal(resolveSupplierProfile('secondo titolo b', config).id, 'SUPPLIER_B');
});

test('Categorie: supplier sconosciuto o channel title assente produce errore chiaro', () => {
  const config = mappings();
  assert.throws(() => resolveSupplierProfile('Sconosciuto', config), /Supplier profile non configurato/);
  assert.throws(() => resolveSupplierProfile(undefined, config), /channel\.title/);
});

test('Categorie: source title normalizzato duplicato tra supplier è ambiguo', () => {
  const config = structuredClone(mappingSource);
  config.suppliers.SUPPLIER_B.source_titles.push(' fornitore   A ');
  assert.throws(() => validateCategoryMappings(config), /Source title ambiguo/);
});

test('Categorie: mapping sorgente mantiene raw, canonical e Base path separati', () => {
  const config = mappings();
  const supplier = resolveSupplierProfile('Fornitore A', config);
  assert.deepEqual(normalizeCategory({ supplier, sourceCategory: '  profumeria  ', mappings: config }), {
    sourceCategory: '  profumeria  ',
    canonicalCategory: 'FRAGRANCE',
    basePath: ['Bellezza e Salute', 'Profumi'],
    status: 'mapped',
    mapped: true,
  });
  assert.equal(normalizeCategory({ supplier, sourceCategory: 'SPECIAL COLLECTION', mappings: config }).mapped, false);
});

test('Categorie: supplier diversi possono convergere sulla stessa canonical', () => {
  const config = mappings();
  const first = normalizeCategory({
    supplier: resolveSupplierProfile('Fornitore A', config),
    sourceCategory: 'PROFUMERIA',
    mappings: config,
  });
  const second = normalizeCategory({
    supplier: resolveSupplierProfile('Fornitore B', config),
    sourceCategory: 'PARFUM',
    mappings: config,
  });
  assert.equal(first.canonicalCategory, 'FRAGRANCE');
  assert.equal(second.canonicalCategory, 'FRAGRANCE');
  assert.deepEqual(first.basePath, second.basePath);
});

for (const [name, value, pattern] of [
  ['JSON invalido', '{', /JSON valido/],
  ['canonical mancante', JSON.stringify({ suppliers: {} }), /canonical mancante/],
  ['suppliers mancante', JSON.stringify({ canonical: {} }), /suppliers mancante/],
]) {
  test(`Categorie: configurazione ${name} bloccata`, () => assert.throws(() => parseCategoryMappings(value), pattern));
}

test('Categorie: canonical inesistente e base_path invalido sono bloccanti', () => {
  const missing = structuredClone(mappingSource);
  missing.suppliers.SUPPLIER_A.categories.PROFUMERIA = 'NON_ESISTE';
  assert.throws(() => validateCategoryMappings(missing), /non definita/);
  for (const basePath of [undefined, [], [''], ['Valida', 2]]) {
    const invalid = structuredClone(mappingSource);
    invalid.canonical.FRAGRANCE.base_path = basePath;
    assert.throws(() => validateCategoryMappings(invalid), /base_path/);
  }
});

test('Categorie: supplier senza titoli e categorie normalizzate ambigue sono bloccanti', () => {
  const noTitles = structuredClone(mappingSource);
  noTitles.suppliers.SUPPLIER_A.source_titles = [];
  assert.throws(() => validateCategoryMappings(noTitles), /source_titles/);
  const ambiguous = structuredClone(mappingSource);
  ambiguous.suppliers.SUPPLIER_A.categories['  profumeria '] = 'FRAGRANCE';
  assert.throws(() => validateCategoryMappings(ambiguous), /categoria sorgente ambigua/);
});

test('Categorie: report include tutte le categorie, conteggi e ordine alfabetico deterministico', () => {
  const config = mappings();
  const products = [
    { product_type: 'SPECIAL COLLECTION' },
    { product_type: 'PROFUMERIA' },
    { product_type: 'MAKE UP LIPS' },
    { product_type: 'SPECIAL COLLECTION' },
    { product_type: 'ACCESSORI REGALO' },
  ];
  const analysis = analyzeCatalogCategories({
    channelTitle: 'Fornitore A',
    products,
    uniqueProducts: products,
  }, config);
  assert.equal(analysis.totalProducts, 5);
  assert.equal(analysis.entries.length, 4);
  assert.equal(analysis.mappedCount, 2);
  assert.equal(analysis.unmappedCount, 2);
  assert.deepEqual(analysis.entries.map(entry => entry.sourceCategory), [
    'ACCESSORI REGALO', 'MAKE UP LIPS', 'PROFUMERIA', 'SPECIAL COLLECTION',
  ]);
  const report = formatCategoryReport(analysis);
  assert.match(report, /MAPPATA: PROFUMERIA → FRAGRANCE → Bellezza e Salute > Profumi \(1 prodotti\)/);
  assert.match(report, /NON MAPPATA: SPECIAL COLLECTION \(2 prodotti\)/);
  assert.match(report, /NON MAPPATA: ACCESSORI REGALO \(1 prodotti\)/);
});

test('Categorie: prodotto mappato conserva source category e usa il Base path canonico', () => {
  const config = mappings();
  const product = { product_type: 'PROFUMERIA', source: { product_type: 'PROFUMERIA' } };
  const analysis = analyzeCatalogCategories({
    channelTitle: 'Fornitore A',
    products: [product],
    uniqueProducts: [product],
  }, config);
  assert.equal(analysis.products[0].source_category, 'PROFUMERIA');
  assert.equal(analysis.products[0].canonical_category, 'FRAGRANCE');
  assert.deepEqual(analysis.products[0].base_category_path, ['Bellezza e Salute', 'Profumi']);
  assert.equal(analysis.products[0].source.product_type, 'PROFUMERIA');
  assert.equal(analysis.products[0].product_type, 'PROFUMERIA');
});

test('Categorie: supplier non configurato produce report completo e bloccante', () => {
  const config = mappings();
  const analysis = analyzeCatalogCategories({
    channelTitle: 'Nuovo fornitore',
    products: [{ product_type: 'A' }, { product_type: 'B' }],
    uniqueProducts: [{ product_type: 'A' }, { product_type: 'B' }],
  }, config);
  assert.equal(analysis.unmappedCount, 2);
  assert.match(formatCategoryReport(analysis), /Supplier profile non configurato: "Nuovo fornitore"/);
});
