import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildGlobalCategoryIndex, resolveProductGlobalCategory } from '../src/categories.js';
import { resolveEffectiveBaseCategory } from '../src/categoryResolution.js';
import { analyzeCatalogCategories, loadCategoryMappings, validateCategoryMappings } from '../src/categoryNormalizer.js';
import { categoryMappingKey, loadRuntimeCategoryMappings, saveRuntimeCategoryMapping,
  removeRuntimeCategoryMapping } from '../electron/categoryMappingStore.js';
import { loadProductOverrides, productOverrideRevision, saveProductCategoryOverrides } from '../electron/productOverrides.js';
import { effectiveProduct, productKey } from '../electron/effectiveProduct.js';
import { buildBasePayload, buildBaseUpdatePayload } from '../src/products.js';
import { buildBaseCategoryTree, searchBaseCategories } from '../renderer/src/baseCategoryTree.js';
import { filterCatalogProducts } from '../renderer/src/catalogFilters.js';
import { sanitizeSnapshot } from '../renderer/src/uiPreferences.js';
import { parseCatalog } from '../src/converter.js';
import { projectCatalogForOperator } from '../electron/catalogProjection.js';
import { catalogXml, itemXml, categoryMappings } from './fixtures/vudoo.js';

const mappings = validateCategoryMappings({ canonical: { STATIC: { base_path: ['Base', 'Statica'] } },
  suppliers: { STIFFLEX: { supplier_id: 'STIFFLEX', source_titles: ['Stifflex'],
    categories: { 'Fonte': 'STATIC' } } } });
const supplier = mappings.suppliers.get('STIFFLEX');
const selected = { categoryId: 12, path: ['Base', 'Manuale'] };
const runtime = { [categoryMappingKey('Stifflex', 'Fonte')]: {
  sourceTitle: 'Stifflex', sourceCategory: 'Fonte', categoryId: 11, path: ['Base', 'Utente'],
} };
const categoryIndex = buildGlobalCategoryIndex([
  { category_id: 10, parent_id: 0, name: 'Base' },
  { category_id: 11, parent_id: 10, name: 'Utente' },
  { category_id: 12, parent_id: 10, name: 'Manuale' },
]);

test('categoria Base V2: prodotto > mapping utente > assente, senza canonical', () => {
  const base = { sourceTitle: 'Stifflex', sourceCategory: 'Fonte', supplier, mappings, categoryIndex };
  assert.deepEqual(resolveEffectiveBaseCategory({ ...base, manualCategory: selected, runtimeMappings: runtime }).path, selected.path);
  assert.equal(resolveEffectiveBaseCategory({ ...base, manualCategory: selected, runtimeMappings: runtime }).origin, 'product_override');
  assert.equal(resolveEffectiveBaseCategory({ ...base, runtimeMappings: runtime }).categoryId, 11);
  assert.equal(resolveEffectiveBaseCategory(base).origin, 'unresolved');
  assert.equal(resolveEffectiveBaseCategory({ ...base, sourceCategory: 'Sconosciuta' }).origin, 'unresolved');
  assert.equal(resolveEffectiveBaseCategory({ ...base, canonicalCategory: 'STATIC' }).categoryId, null);
});

test('scoped supplier: Mazzuoli non coinvolto invalido non blocca Stifflex; globale lo segnala', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.category-scope-'));
  try {
    await mkdir(path.join(root, 'suppliers'));
    await writeFile(path.join(root, 'canonical-categories.json'), JSON.stringify({ STATIC: { base_path: ['Base', 'Statica'] } }));
    await writeFile(path.join(root, 'suppliers', 'stifflex.json'), JSON.stringify({ supplier_id: 'STIFFLEX',
      source_titles: ['Stifflex'], categories: { Fonte: 'STATIC' } }));
    await writeFile(path.join(root, 'suppliers', 'mazzuoli.json'), JSON.stringify({ supplier_id: '365_BY_GIULIANO_MAZZUOLI',
      source_titles: ['365 by Giuliano Mazzuoli'], categories: { Penne: 'WRITING_INSTRUMENTS' } }));
    const url = pathToFileURL(root + path.sep);
    const current = await loadCategoryMappings(url, { channelTitle: 'Stifflex' });
    assert.equal(current.suppliers.size, 1);
    assert.equal(current.suppliers.get('STIFFLEX').categories.get('fonte'), 'STATIC');
    await assert.rejects(loadCategoryMappings(url), /WRITING_INSTRUMENTS/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('categoria Base: ricerca/path distinguono nomi omonimi e ID verificato', () => {
  const rows = [
    { category_id: 1, parent_id: 0, name: 'Cancelleria' },
    { category_id: 2, parent_id: 1, name: 'Penne' },
    { category_id: 3, parent_id: 0, name: 'Moda' },
    { category_id: 4, parent_id: 3, name: 'Penne' },
  ];
  const index = buildGlobalCategoryIndex(rows);
  assert.deepEqual(buildBaseCategoryTree(index.entries).map(item => item.name), ['Cancelleria', 'Moda']);
  assert.deepEqual(searchBaseCategories(index.entries, 'penne').map(item => item.path.join(' > ')),
    ['Cancelleria > Penne', 'Moda > Penne']);
  assert.equal(searchBaseCategories(index.entries, '4')[0].categoryId, 4);
  assert.equal(resolveProductGlobalCategory({ category_id: 2, base_category_path: ['Cancelleria', 'Penne'] }, index).categoryId, 2);
  assert.deepEqual(resolveProductGlobalCategory({ category_id: 2, base_category_path: ['Moda', 'Penne'] }, index).path,
    ['Cancelleria', 'Penne']);
});

test('Product Manager filtra le categorie Base assegnate e conserva il filtro nelle viste', () => {
  const rows = [{ id: 'A', baseCategory: { path: ['Base', 'Penne'] } },
    { id: 'B', baseCategory: { path: null } }];
  assert.deepEqual(filterCatalogProducts(rows, { baseCategoryFilter: 'assigned' }).map(item => item.product.id), ['A']);
  assert.deepEqual(filterCatalogProducts(rows, { baseCategoryFilter: 'unassigned' }).map(item => item.product.id), ['B']);
  assert.equal(sanitizeSnapshot('base', { filters: { baseCategoryFilter: 'unassigned' } }).filters.baseCategoryFilter,
    'unassigned');
});

test('proiezione catalogo usa mapping per tutti i prodotti e override solo sul prodotto scelto', () => {
  const catalog = parseCatalog(catalogXml(itemXml + itemXml.replace('<g:id>389578</g:id>', '<g:id>389579</g:id>')));
  const sourceCategory = catalog.products[0].product_type;
  const runtimeMappings = { [categoryMappingKey(catalog.channelTitle, sourceCategory)]: {
    sourceTitle: catalog.channelTitle, sourceCategory, categoryId: 11, path: ['Base', 'Utente'],
  } };
  const overrides = { [productKey('390296', '389578')]: { base_category: selected } };
  const projection = projectCatalogForOperator(catalog, validateCategoryMappings(categoryMappings),
    overrides, '390296', runtimeMappings, categoryIndex);
  assert.deepEqual(projection.rows.map(row => row.baseCategory.origin), ['product_override', 'runtime_mapping']);
  assert.deepEqual(projection.rows.map(row => row.baseCategory.categoryId), [12, 11]);
  assert.equal(projection.rows[0].basePreflight.checks.find(check => check.code === 'category').status, 'PASS');
  assert.equal(projection.rows[1].basePreflight.checks.find(check => check.code === 'category').status, 'PASS');
  assert.deepEqual(catalog.products.map(product => product.product_type), [sourceCategory, sourceCategory]);
});

test('mapping V2 usa codice catalogo e resta visibile nella proiezione del singolo prodotto', () => {
  const catalog = parseCatalog(catalogXml(itemXml));
  catalog.catalogCode = '390296';
  const sourceCategory = catalog.products[0].product_type;
  const mapping = { [categoryMappingKey('390296', sourceCategory)]: {
    sourceTitle: '390296', sourceCategory, categoryId: 11, path: ['Base', 'Utente'],
  } };
  const index = buildGlobalCategoryIndex([{ category_id: 10, parent_id: 0, name: 'Base' },
    { category_id: 11, parent_id: 10, name: 'Utente' }]);
  const projection = projectCatalogForOperator(catalog, mappings, {}, '390296', mapping, index);
  assert.equal(projection.rows[0].baseCategory.categoryId, 11);
  assert.equal(projection.rows[0].baseCategory.origin, 'runtime_mapping');
  assert.equal(projection.rows[0].basePreflight.checks.find(check => check.code === 'category').status, 'PASS');
});

test('preflight aggregato distingue assegnazioni manuali diverse sulla stessa categoria Vudoo', () => {
  const products = [{ id: 'A', product_type: 'Fonte', base_category_override: selected },
    { id: 'B', product_type: 'Fonte' }];
  const analysis = analyzeCatalogCategories({ channelTitle: 'Stifflex', products,
    uniqueProducts: products }, mappings, runtime, categoryIndex);
  assert.equal(analysis.entries[0].status, 'mixed');
  assert.equal(analysis.mappedCount, 1);
  assert.equal(analysis.withoutBaseCategoryProducts, 0);
});

test('override e mapping categoria persistono; bulk non cambia il dato supplier', async () => {
  const root = await mkdtemp(path.join(process.cwd(), '.category-storage-'));
  const overrideFile = path.join(root, 'overrides.json');
  const mappingFile = path.join(root, 'category-mappings.json');
  const sources = [{ id: 'A', product_type: 'Fonte', title: 'Primo' }, { id: 'B', product_type: 'Fonte', title: 'Secondo' }];
  const original = structuredClone(sources);
  try {
    const stored = await saveProductCategoryOverrides(overrideFile, {}, '390296', sources,
      { category: selected, expectedRevisions: { A: '{}', B: '{}' } });
    assert.deepEqual(await loadProductOverrides(overrideFile), stored);
    assert.equal(stored[productKey('390296', 'A')].base_category.categoryId, 12);
    assert.equal(effectiveProduct(sources[0], stored[productKey('390296', 'A')], 'base').base_category_override.categoryId, 12);
    assert.equal(effectiveProduct(sources[0], stored[productKey('390296', 'A')]).base_category_override, undefined);
    assert.deepEqual(sources, original);
    await assert.rejects(saveProductCategoryOverrides(overrideFile, stored, '390296', sources,
      { category: selected, expectedRevisions: { A: '{}', B: '{}' } }), /modificato/);
    const reset = await saveProductCategoryOverrides(overrideFile, stored, '390296', [sources[0]],
      { category: null, expectedRevisions: { A: productOverrideRevision(stored[productKey('390296', 'A')]) } });
    assert.equal(reset[productKey('390296', 'A')], undefined);
    assert.equal(reset[productKey('390296', 'B')].base_category.categoryId, 12);
    const runtimeSaved = await saveRuntimeCategoryMapping(mappingFile, {}, 'Stifflex', 'Fonte', selected);
    assert.deepEqual(await loadRuntimeCategoryMappings(mappingFile), runtimeSaved);
    assert.deepEqual((await removeRuntimeCategoryMapping(mappingFile, runtimeSaved, 'Stifflex', 'Fonte')), {});
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('CREATE usa category_id verificato; UPDATE invia categoria solo quando cambia', () => {
  const config = { inventory: { inventory_id: 7 }, priceGroup: { price_group_id: 8, currency: 'EUR' },
    warehouse: { id: 'bl_9' } };
  const product = { id: 'A', sku: 'A', title: 'Primo', price: 10, category_id: 12 };
  const existing = { sku: 'A', category_id: 12, text_fields: { name: 'Primo' }, prices: { 8: 10 } };
  assert.equal(buildBasePayload(product, config).category_id, 12);
  assert.equal(buildBaseUpdatePayload(product, existing, config)?.category_id, undefined);
  assert.equal(buildBaseUpdatePayload(product, { ...existing, category_id: 11 }, config).category_id, 12);
});
