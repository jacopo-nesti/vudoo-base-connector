import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveProductValue, effectiveProduct, productKey } from '../electron/effectiveProduct.js';
import { saveBulkProductField, saveProductFieldPatch, productOverrideRevision, loadProductOverrides } from '../electron/productOverrides.js';
import { baseLocalPreflight, basePayloadPreview, assertBaseLocalSendable } from '../src/marketplaces/base/localPreview.js';
import { filterCatalogProducts } from '../renderer/src/catalogFilters.js';
import { parseCatalog } from '../src/converter.js';
import { validateCategoryMappings } from '../src/categoryNormalizer.js';
import { projectCatalogForOperator } from '../electron/catalogProjection.js';
import { buildBasePayload } from '../src/products.js';
import { catalogXml, itemXml, categoryMappings } from './fixtures/vudoo.js';

const source = { id: 'SKU-1', title: 'Supplier title', product_type: 'Source category' };
const canonical = { ...source, title: 'Canonical title', price: 10, quantity: 3,
  canonical_category: 'REAL_CATEGORY', base_category_path: ['Real', 'Path'], image_link: null,
  source };

test('Payload Base omette entrambe le categorie quando non esiste un ID verificato', () => {
  const config = { inventory: { inventory_id: 7 }, priceGroup: { price_group_id: 8, currency: 'EUR' },
    warehouse: { id: 'bl_9' } };
  const mapped = buildBasePayload({ ...canonical, sku: 'SKU-1', category_id: 42 }, config);
  const unmapped = buildBasePayload({ ...canonical, sku: 'SKU-1', category_id: undefined }, config);
  assert.equal(mapped.category_id, 42);
  assert.equal(Object.hasOwn(unmapped, 'category_id'), false);
  assert.equal(Object.keys(unmapped.text_fields).some(key => key.startsWith('marketplace_category_id')), false);
});

test('Provenienza: marketplace > manuale > canonico > supplier, senza mutare il feed', () => {
  const original = structuredClone(source);
  const layer = resolveProductValue({ source, canonical, manual: { title: 'Manual title' },
    marketplace: { title: 'Base title' }, key: 'title' });
  assert.equal(layer.value, 'Base title');
  assert.equal(layer.globalValue, 'Manual title');
  assert.equal(layer.origin, 'marketplace');
  assert.equal(resolveProductValue({ source, canonical, key: 'title' }).origin, 'canonical');
  assert.equal(resolveProductValue({ source, canonical: { ...canonical, title: undefined }, key: 'title' }).value, 'Supplier title');
  assert.deepEqual(source, original);
});

test('Override Base resta separato dai valori Vudoo manuali', () => {
  const overrides = { title: 'Manual title', price: 19, base: { title: 'Base title', tags: ['base-tag'] } };
  const base = effectiveProduct(canonical, overrides, 'base');
  const vudoo = effectiveProduct(canonical, overrides);
  assert.equal(base.title, 'Base title');
  assert.equal(vudoo.title, 'Manual title');
  assert.equal(vudoo.tags, undefined);
  assert.equal(base.price, 19);
  assert.equal(canonical.title, 'Canonical title');
});

test('Catalogo mostra titolo Vudoo mentre Base usa il proprio override e conserva la provenienza', () => {
  const catalog = parseCatalog(catalogXml(itemXml));
  const id = catalog.products[0].id;
  const overrides = { [productKey('company', id)]: { title: 'Titolo globale', base: { title: 'Titolo Base' } } };
  const { rows } = projectCatalogForOperator(catalog, validateCategoryMappings(categoryMappings), overrides, 'company');
  assert.equal(rows[0].title, 'Titolo globale');
  assert.equal(rows[0].baseOverrides.title, 'Titolo Base');
  assert.equal(rows[0].provenance.title.value, 'Titolo Base');
  assert.equal(rows[0].provenance.title.globalValue, 'Titolo globale');
  assert.equal(rows[0].provenance.title.source, 'Prodotto test');
});

test('Reset rimuove solo override richiesto; bulk salva insieme e rifiuta revisioni obsolete', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-workflow-'));
  const file = path.join(directory, 'overrides.json');
  try {
    const second = { ...source, id: 'SKU-2' };
    let overrides = await saveBulkProductField(file, {}, 'company', [source, second],
      { scope: 'manual', field: 'brand', value: 'Brand condiviso',
        expectedRevisions: { 'SKU-1': '{}', 'SKU-2': '{}' } });
    assert.equal(overrides[productKey('company', 'SKU-2')].brand, 'Brand condiviso');
    await assert.rejects(saveBulkProductField(file, overrides, 'company', [source, second],
      { scope: 'base', field: 'title', value: 'Base only', expectedRevisions: { 'SKU-1': '{}', 'SKU-2': '{}' } }), /modificato/);
    overrides = await saveProductFieldPatch(file, overrides, 'company', source,
      { scope: 'base', changes: { title: 'Base only' }, expectedRevision: productOverrideRevision(overrides[productKey('company', source.id)]) });
    overrides = await saveProductFieldPatch(file, overrides, 'company', source,
      { scope: 'manual', reset: ['brand'], expectedRevision: productOverrideRevision(overrides[productKey('company', source.id)]) });
    assert.equal(overrides[productKey('company', source.id)].brand, undefined);
    assert.equal(overrides[productKey('company', source.id)].base.title, 'Base only');
    assert.deepEqual(await loadProductOverrides(file), overrides);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Preflight Base: warning non blocca, diagnosi strutturata e blocker vieta invio', () => {
  const ready = baseLocalPreflight(canonical);
  assert.equal(ready.canSend, true);
  assert.ok(ready.checks.some(item => item.code === 'image' && item.status === 'WARNING' && !item.blocking));
  assert.ok(ready.checks.every(item => item.marketplace === 'base' && item.field && item.message && item.severity));
  const uncategorized = baseLocalPreflight({ ...canonical, canonical_category: null, base_category_path: null });
  assert.equal(uncategorized.status, 'BASE_READY');
  assert.equal(uncategorized.checks.find(item => item.code === 'category').blocking, false);
  assert.equal(uncategorized.checks.find(item => item.code === 'category').status, 'WARNING');
  assert.doesNotThrow(() => assertBaseLocalSendable([{ id: 'SKU-1', basePreflight: uncategorized }], ['SKU-1']));
  assert.doesNotThrow(() => assertBaseLocalSendable([{ id: 'SKU-1', basePreflight: ready }], ['SKU-1']));
});

test('Anteprima Base distingue campi vuoti e non supportati, senza simulare ID remoti', () => {
  const preview = basePayloadPreview(canonical);
  assert.equal(preview.payload.ean, null);
  assert.equal(preview.fields.find(item => item.key === 'ean').status, 'SUPPORTED_EMPTY');
  assert.equal(preview.fields.find(item => item.key === 'availability').status, 'NOT_SUPPORTED');
  assert.equal(preview.unresolved.category_id, 'Ommesso: nessuna categoria Base verificata');
});

test('Ricerca e filtri su mille prodotti non perdono righe', () => {
  const products = Array.from({ length: 1000 }, (_, index) => ({ id: `SKU-${index}`, title: `Product ${index}`,
    category: index % 2 ? 'B' : 'A', availability: index % 2 ? 'out of stock' : 'in stock', quantity: index % 2 ? 0 : 1 }));
  const rows = filterCatalogProducts(products, { categoryFilter: 'A', availabilityFilter: 'available', searchQuery: 'Product' });
  assert.equal(rows.length, 500);
});
