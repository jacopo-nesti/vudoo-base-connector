import test from 'node:test';
import assert from 'node:assert/strict';
import { createBaseCategoryService } from '../electron/baseCategoryService.js';
import { buildGlobalCategoryIndex, resolveProductGlobalCategory } from '../src/categories.js';
import { resolveEffectiveBaseCategory } from '../src/categoryResolution.js';
import { categoryMappingKey } from '../electron/categoryMappingStore.js';
import { baseLocalPreflight } from '../src/marketplaces/base/localPreview.js';
import { buildBasePayload, buildBaseUpdatePayload } from '../src/products.js';

function mockService({ simulation = false } = {}) {
  let rows = [{ category_id: 1, parent_id: 0, name: 'Bellezza' },
    { category_id: 2, parent_id: 1, name: 'Profumi' },
    { category_id: 3, parent_id: 2, name: 'Fragranze' }];
  const calls = [];
  const request = async (method, parameters = {}) => {
    calls.push({ method, parameters });
    if (method === 'getInventoryCategories') return { categories: structuredClone(rows) };
    if (method === 'addInventoryCategory') {
      const id = parameters.category_id ?? 4;
      rows = rows.filter(row => row.category_id !== id);
      rows.push({ category_id: id, parent_id: parameters.parent_id, name: parameters.name });
      return { category_id: id };
    }
    if (method === 'deleteInventoryCategory') {
      rows = rows.filter(row => row.category_id !== parameters.category_id);
      return { status: 'SUCCESS' };
    }
    if (method === 'getInventories') return { inventories: [{ inventory_id: 9 }] };
    if (method === 'getInventoryProductsList') return { products: { 71: { id: 71 } } };
    throw new Error(`Metodo imprevisto: ${method}`);
  };
  return { service: createBaseCategoryService({ request, isSimulation: () => simulation }), calls };
}

test('CRUD Base mock: CREATE, rinomina, sposta, DELETE rileggono sempre Base', async () => {
  const { service, calls } = mockService();
  assert.equal((await service.read()).length, 3);
  const created = await service.mutate('create', { name: 'Accessori', parentId: 2 });
  assert.equal(created.categoryId, 4);
  assert.deepEqual(created.categories.find(row => row.categoryId === 4).path,
    ['Bellezza', 'Profumi', 'Accessori']);
  const renamed = await service.mutate('update', { categoryId: 4, name: 'Accessori Profumo', parentId: 2 });
  assert.equal(renamed.categories.find(row => row.categoryId === 4).name, 'Accessori Profumo');
  const moved = await service.mutate('update', { categoryId: 4, name: 'Accessori Profumo', parentId: 1 });
  assert.deepEqual(moved.categories.find(row => row.categoryId === 4).path, ['Bellezza', 'Accessori Profumo']);
  const deleted = await service.mutate('delete', { categoryId: 4, confirmation: 'ELIMINA' });
  assert.equal(deleted.categories.some(row => row.categoryId === 4), false);
  for (const method of ['addInventoryCategory', 'deleteInventoryCategory']) {
    assert.ok(calls.some(call => call.method === method));
  }
  assert.equal(calls.filter(call => call.method === 'getInventoryCategories').length, 9);
});

test('Simulazione: CREATE, UPDATE, DELETE non chiamano API mutative', async () => {
  const { service, calls } = mockService({ simulation: true });
  for (const [operation, input] of [
    ['create', { name: 'Nuova', parentId: 0 }],
    ['update', { categoryId: 3, name: 'Nuovo nome', parentId: 1 }],
    ['delete', { categoryId: 3, confirmation: 'ELIMINA' }],
  ]) assert.equal((await service.mutate(operation, input)).simulated, true);
  assert.ok(calls.every(call => call.method === 'getInventoryCategories'));
});

test('DELETE richiede ELIMINA esatto; spostamento impedisce cicli', async () => {
  const { service, calls } = mockService();
  await assert.rejects(service.mutate('delete', { categoryId: 3, confirmation: 'Elimina' }), /ELIMINA/);
  await assert.rejects(service.mutate('update', { categoryId: 1, name: 'Bellezza', parentId: 3 }), /discendente/);
  await assert.rejects(service.mutate('create', { name: ' profumi ', parentId: 1 }), /Esiste già/);
  await assert.rejects(service.mutate('delete', { categoryId: 3, confirmation: 'ELIMINA',
    expectedName: 'Nome precedente', expectedParentId: 2 }), /nome categoria è cambiato/);
  await assert.rejects(service.mutate('update', { categoryId: 3, name: 'Fragranze', parentId: 0,
    expectedName: 'Fragranze', expectedParentId: 1 }), /gerarchia Base.com è cambiata/);
  assert.equal(calls.filter(call => call.method === 'deleteInventoryCategory').length, 0);
  assert.equal(calls.filter(call => call.method === 'addInventoryCategory').length, 0);
});

test('Impatto cancellazione usa solo GET documentate, con filtro categoria', async () => {
  const { service, calls } = mockService();
  assert.deepEqual(await service.deleteImpact(3), { atLeast: 1, truncated: false });
  assert.deepEqual(calls.map(call => call.method), ['getInventories', 'getInventoryProductsList']);
  assert.equal(calls[1].parameters.filter_category_id, 3);
});

test('esito incerto di una write non avvia un secondo tentativo automatico', async () => {
  const calls = [];
  const service = createBaseCategoryService({ isSimulation: () => false, request: async method => {
    calls.push(method);
    if (method === 'getInventoryCategories') return { categories: [] };
    throw Object.assign(new Error('timeout'), { uncertain: true });
  } });
  await assert.rejects(service.mutate('create', { name: 'Nuova', parentId: 0 }), /Esito Base.com incerto/);
  assert.deepEqual(calls, ['getInventoryCategories', 'addInventoryCategory']);
});

test('V2: ID Base valido è fonte di verità; canonical non interviene; eliminato non viene inviato', () => {
  const index = buildGlobalCategoryIndex([{ category_id: 1, parent_id: 0, name: 'Bellezza' },
    { category_id: 2, parent_id: 1, name: 'Fragranze rinominate' }]);
  const runtime = { [categoryMappingKey('390296', 'Profumi')]: { categoryId: 2,
    path: ['Vecchio', 'Path'] } };
  const base = { sourceTitle: '390296', sourceCategory: 'Profumi', runtimeMappings: runtime,
    canonicalCategory: 'LEGACY', categoryIndex: index };
  const mapped = resolveEffectiveBaseCategory(base);
  assert.equal(mapped.categoryId, 2);
  assert.deepEqual(mapped.path, ['Bellezza', 'Fragranze rinominate']);
  assert.equal(resolveEffectiveBaseCategory({ ...base, manualCategory: { categoryId: 1, path: ['Vecchio'] } }).categoryId, 1);
  assert.equal(resolveEffectiveBaseCategory({ ...base, runtimeMappings: {} }).categoryId, null);
  const unavailable = resolveEffectiveBaseCategory({ ...base, categoryIndex: null });
  assert.equal(unavailable.origin, 'unverified_category');
  assert.equal(unavailable.categoryId, null);
  assert.equal(resolveEffectiveBaseCategory({ ...base, categoryIndex: undefined }).categoryId, null);
  assert.equal(resolveEffectiveBaseCategory({ ...base, sourceTitle: 'altro-catalogo' }).categoryId, null);
  assert.equal(resolveProductGlobalCategory({ category_id: 2, base_category_path: ['Vecchio', 'Path'] }, index).categoryId, 2);
  const deleted = resolveEffectiveBaseCategory({ ...base, manualCategory: { categoryId: 99, path: ['Eliminata'] } });
  assert.equal(deleted.origin, 'deleted_category');
  assert.equal(deleted.categoryId, null);
  const product = { id: 'A', sku: 'A', title: 'Prodotto', price: 10, product_type: 'Profumi',
    category_id: deleted.categoryId, base_category_path: deleted.path, base_category_origin: deleted.origin };
  assert.equal(baseLocalPreflight(product).checks.find(check => check.code === 'category').status, 'WARNING');
  const config = { inventory: { inventory_id: 8 }, priceGroup: { price_group_id: 7, currency: 'EUR' } };
  assert.equal(Object.hasOwn(buildBasePayload(product, config), 'category_id'), false);
  const withCategory = { ...product, category_id: mapped.categoryId };
  const existing = { sku: 'A', category_id: 2, text_fields: { name: 'Prodotto' }, prices: { 7: 10 } };
  assert.equal(buildBasePayload(withCategory, config).category_id, 2);
  assert.equal(buildBaseUpdatePayload(withCategory, existing, config)?.category_id, undefined);
  assert.equal(buildBaseUpdatePayload(withCategory, { ...existing, category_id: 1 }, config).category_id, 2);
});
