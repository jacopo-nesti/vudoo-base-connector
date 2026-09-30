import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {
  loadProductOverrides, saveProductOverride,
} from '../electron/productOverrides.js';
import {
  productKey, getProductOverride, defaultProductTitle, effectiveSourceProduct,
  effectiveProduct, applyProductOverrides,
} from '../electron/effectiveProduct.js';
import { prepareEffectiveFullCatalog, prepareEffectiveSelectedCatalog } from '../electron/effectiveCatalog.js';
import { parseCatalog } from '../src/converter.js';
import { normalizeVudooProduct } from '../src/vudooXml.js';
import { buildBaseUpdatePayload } from '../src/products.js';
import { toCatalogProductDto } from '../electron/catalogDto.js';
import { catalogXml, itemXml } from './fixtures/vudoo.js';

const companyCode = 'test-company';
const source = { id: '417569', title: 'ALIOTH', description: 'Descrizione originale' };

async function withFile(action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-product-overrides-'));
  try { await action(path.join(directory, 'product-overrides.json')); }
  finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); }
}

test('Override store: missing file is empty; title, description and both fields persist with a company-scoped key', async () => {
  await withFile(async filePath => {
    let overrides = await loadProductOverrides(filePath);
    assert.deepEqual(overrides, {});
    overrides = await saveProductOverride(filePath, overrides, companyCode, source,
      { title: 'ALIOTH personalizzato', description: source.description });
    assert.deepEqual(overrides[productKey(companyCode, source.id)], { title: 'ALIOTH personalizzato' });
    overrides = await saveProductOverride(filePath, overrides, companyCode, source,
      { title: source.title, description: 'Nuova descrizione' });
    assert.deepEqual(overrides[productKey(companyCode, source.id)], { description: 'Nuova descrizione' });
    overrides = await saveProductOverride(filePath, overrides, companyCode, source,
      { title: 'ALIOTH personalizzato', description: 'Nuova descrizione' });
    assert.deepEqual(await loadProductOverrides(filePath), overrides);
    assert.deepEqual(JSON.parse(await readFile(filePath, 'utf8')),
      { version: 1, products: overrides });
    assert.notEqual(productKey('other-company', source.id), productKey(companyCode, source.id));
  });
});

test('Override store: restoring source values removes fields and eventually the whole product record', async () => {
  await withFile(async filePath => {
    let overrides = await saveProductOverride(filePath, {}, companyCode, source,
      { title: 'Custom', description: 'Custom description' });
    overrides = await saveProductOverride(filePath, overrides, companyCode, source,
      { title: source.title, description: 'Custom description' });
    assert.deepEqual(getProductOverride(overrides, companyCode, source.id),
      { description: 'Custom description' });
    overrides = await saveProductOverride(filePath, overrides, companyCode, source,
      { title: source.title, description: source.description });
    assert.deepEqual(overrides, {});
    assert.deepEqual(await loadProductOverrides(filePath), {});
  });
});

test('Title default uses the existing Brand/Size/Color rule; a manual override remains exact', () => {
  const wally = { id: '1', title: 'Profumo', brand: 'Wally 1925' };
  const snapshot = structuredClone(wally);
  assert.equal(defaultProductTitle(wally), 'Profumo - Wally 1925');
  assert.equal(effectiveSourceProduct(wally, {}).title, 'Profumo - Wally 1925');
  assert.equal(effectiveSourceProduct(wally, { title: 'PincoPallino' }).title, 'PincoPallino');
  assert.notEqual(effectiveSourceProduct(wally, { title: 'PincoPallino' }).title,
    'PincoPallino - Wally 1925');
  assert.deepEqual(wally, snapshot);
  assert.equal(defaultProductTitle({ ...wally, title: 'Profumo - Wally 1925' }),
    'Profumo - Wally 1925');
  const parsedSource = parseCatalog(catalogXml(itemXml)).products[0];
  assert.equal(defaultProductTitle(parsedSource), normalizeVudooProduct(parsedSource).title);
  assert.equal(toCatalogProductDto(effectiveSourceProduct(parsedSource, {})).title,
    normalizeVudooProduct(parsedSource).title);
});

test('Title override is saved and removed relative to the formatted default, even after reload', async () => {
  await withFile(async filePath => {
    const wally = { id: '1', title: 'Profumo', brand: 'Wally 1925', description: 'Originale' };
    const key = productKey(companyCode, wally.id);
    let overrides = await saveProductOverride(filePath, {}, companyCode, wally,
      { title: 'Profumo - Wally 1925', description: 'Originale' });
    assert.equal(Object.hasOwn(overrides, key), false);
    overrides = await saveProductOverride(filePath, overrides, companyCode, wally,
      { title: 'PincoPallino', description: 'Originale' });
    assert.deepEqual(overrides[key], { title: 'PincoPallino' });
    const reloaded = await loadProductOverrides(filePath);
    assert.equal(effectiveSourceProduct(wally,
      getProductOverride(reloaded, companyCode, wally.id)).title, 'PincoPallino');
    overrides = await saveProductOverride(filePath, reloaded, companyCode, wally,
      { title: 'Profumo - Wally 1925', description: 'Originale' });
    assert.equal(Object.hasOwn(overrides, key), false);
  });
});

test('Base title comparison follows the formatted default or the exact override', () => {
  const wally = { id: '1', title: 'Profumo', brand: 'Wally 1925' };
  const config = { inventory: { inventory_id: 1 } };
  const product = fields => ({ id: wally.id, sku: wally.id,
    title: effectiveSourceProduct(wally, fields).title });
  const existing = name => ({ sku: wally.id, text_fields: { name } });
  assert.equal(buildBaseUpdatePayload(product({}), existing('Profumo - Wally 1925'), config), null);
  assert.equal(buildBaseUpdatePayload(product({ title: 'PincoPallino' }),
    existing('PincoPallino'), config), null);
  assert.deepEqual(buildBaseUpdatePayload(product({ title: 'PincoPallino' }),
    existing('Profumo - Wally 1925'), config).text_fields, { name: 'PincoPallino' });
});

test('Override store: empty description is an explicit override; blank title and unsupported fields are rejected', async () => {
  await withFile(async filePath => {
    const overrides = await saveProductOverride(filePath, {}, companyCode, source,
      { title: source.title, description: '' });
    assert.deepEqual(getProductOverride(overrides, companyCode, source.id), { description: '' });
    await assert.rejects(saveProductOverride(filePath, overrides, companyCode, source,
      { title: '   ', description: '' }), /Titolo o descrizione/);
    await assert.rejects(saveProductOverride(filePath, overrides, companyCode, source,
      { title: 'Valid', description: '', price: 1 }), /Titolo o descrizione/);
  });
});

test('Override store rejects corrupt files instead of silently discarding persistent edits', async () => {
  await withFile(async filePath => {
    await writeFile(filePath, '{ broken', 'utf8');
    await assert.rejects(loadProductOverrides(filePath), /JSON valido/);
    await writeFile(filePath, JSON.stringify({ version: 1, products: {
      [productKey(companyCode, source.id)]: { price: 1 },
    } }), 'utf8');
    await assert.rejects(loadProductOverrides(filePath), /dati non validi/);
  });
});

test('Catalog DTO keeps the full effective description and excludes store paths and tokens', () => {
  const description = 'Testo completo\n'.repeat(1000);
  const dto = toCatalogProductDto(effectiveProduct(source, { description }));
  assert.equal(dto.description, description);
  assert.equal(Object.hasOwn(dto, 'source'), false);
  assert.equal(Object.hasOwn(dto, 'token'), false);
});

test('Preload exposes only a specific product-edit IPC operation', async () => {
  let exposed;
  const calls = [];
  vm.runInNewContext(readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'), {
    require: name => {
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (_name, api) => { exposed = api; } },
        ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ ok: true }); } },
      };
    },
  });
  const input = { id: source.id, title: 'Custom', description: '' };
  await exposed.saveProductOverride(input);
  assert.deepEqual(calls, [['catalog:save-product-override', input]]);
  assert.equal(Object.hasOwn(exposed, 'ipcRenderer'), false);
  assert.equal(Object.hasOwn(exposed, 'readFile'), false);
});

test('Effective product preserves source and applies only present override fields', () => {
  assert.deepEqual(effectiveProduct(source, {}), source);
  assert.deepEqual(effectiveProduct(source, { title: 'Custom' }),
    { ...source, title: 'Custom' });
  assert.deepEqual(effectiveProduct(source, { description: '' }),
    { ...source, description: '' });
  assert.deepEqual(effectiveProduct(source, { title: 'Custom', description: 'New' }),
    { ...source, title: 'Custom', description: 'New' });
  assert.equal(source.title, 'ALIOTH');
  assert.equal(source.description, 'Descrizione originale');
});

test('Selected and full catalog preparation use the same effective values without changing parsed sources', () => {
  const parsed = parseCatalog(catalogXml(itemXml));
  const original = structuredClone(parsed);
  const id = parsed.products[0].id;
  const overrides = { [productKey(companyCode, id)]: {
    title: 'Titolo Base personalizzato', description: '',
  } };
  for (const prepared of [
    prepareEffectiveSelectedCatalog(parsed, [id], overrides, companyCode),
    prepareEffectiveFullCatalog(parsed, overrides, companyCode),
  ]) {
    assert.equal(prepared.products[0].title, 'Titolo Base personalizzato');
    assert.equal(prepared.uniqueProducts[0].title, 'Titolo Base personalizzato');
    assert.equal(prepared.uniqueProducts[0].description, '');
    assert.equal(prepared.products[0], prepared.uniqueProducts[0]);
    assert.equal(prepared.products[0].source, parsed.products[0]);
  }
  assert.deepEqual(parsed, original);
  const withoutOverrides = prepareEffectiveFullCatalog(parsed);
  assert.match(withoutOverrides.products[0].title, /^Prodotto test - Marca/);
});

test('Effective selected catalog keeps all duplicate source records for core conflict detection', () => {
  const parsed = parseCatalog(catalogXml(itemXml + itemXml));
  const id = parsed.products[0].id;
  const prepared = prepareEffectiveSelectedCatalog(parsed, [id],
    { [productKey(companyCode, id)]: { title: 'Custom' } }, companyCode);
  assert.equal(prepared.products.length, 2);
  assert.equal(prepared.uniqueProducts.length, 1);
  assert.equal(prepared.products[0].title, 'Custom');
  assert.equal(prepared.products[1].title, 'Custom');
});

test('Base comparison uses effective title and description without reverting an existing override', () => {
  const config = { inventory: { inventory_id: 1 } };
  const base = { sku: source.id, text_fields: {
    name: 'ALIOTH personalizzato', description: 'Nuova descrizione',
  } };
  const normalized = { id: source.id, sku: source.id,
    title: source.title, description: source.description };
  const customized = effectiveProduct(normalized,
    { title: 'ALIOTH personalizzato', description: 'Nuova descrizione' });
  assert.equal(buildBaseUpdatePayload(customized, base, config), null);
  assert.deepEqual(buildBaseUpdatePayload(normalized,
    { sku: source.id, text_fields: { name: source.title, description: source.description } }, config), null);
  const update = buildBaseUpdatePayload(customized,
    { sku: source.id, text_fields: { name: source.title, description: source.description } }, config);
  assert.deepEqual(update.text_fields, { name: 'ALIOTH personalizzato', description: 'Nuova descrizione' });
  const clearedDescription = buildBaseUpdatePayload(effectiveProduct(normalized, { description: '' }),
    { sku: source.id, text_fields: { name: source.title, description: source.description } }, config);
  assert.deepEqual(clearedDescription.text_fields, { description: '' });
});

test('Applying overrides to a prepared catalog never mutates its products or source objects', () => {
  const product = { id: source.id, title: source.title, description: source.description, source };
  const catalog = { products: [product], uniqueProducts: [product] };
  const result = applyProductOverrides(catalog,
    { [productKey(companyCode, source.id)]: { title: 'Other', description: '' } }, companyCode);
  assert.equal(result.products[0], result.uniqueProducts[0]);
  assert.notEqual(result.products[0], product);
  assert.equal(product.title, source.title);
  assert.equal(result.products[0].description, '');
  assert.equal(result.products[0].source, source);
});
