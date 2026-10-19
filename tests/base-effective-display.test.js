import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCatalog } from '../src/converter.js';
import { normalizeVudooProduct } from '../src/vudooXml.js';
import { validateCategoryMappings } from '../src/categoryNormalizer.js';
import { catalogXml, itemXml, categoryMappings, extraFields } from './fixtures/vudoo.js';
import { projectCatalogForOperator } from '../electron/catalogProjection.js';
import { effectiveProduct, productKey } from '../electron/effectiveProduct.js';
import { saveBulkProductField, saveProductFieldPatch, loadProductOverrides } from '../electron/productOverrides.js';
import { buildBasePayload } from '../src/products.js';
import { editorFieldScope, editorFieldValue } from '../renderer/src/components/productFieldValues.js';

const values = { quantity: 11, price: 199, tax_rate: 22, weight: 1.2, height: 18, width: 12, length: 9 };
const config = { inventory: { inventory_id: 1 }, warehouse: { id: 'bl_1' }, priceGroup: { price_group_id: 2, currency: 'EUR' },
  extraFields: new Map(extraFields.map(field => [field.name, field])) };
const mappings = validateCategoryMappings(categoryMappings);
const catalog = parseCatalog(catalogXml(itemXml.replace('<g:quantity>234</g:quantity>', '<g:quantity>999</g:quantity>')));
const source = catalog.products[0];
const original = structuredClone(source);
const key = productKey('company', source.id);
const row = overrides => projectCatalogForOperator(catalog, mappings, overrides, 'company').rows[0];

test('seven operational fields use the Base resolver in DTO, editor and payload, preserving source', () => {
  const base = { ...values };
  const current = row({ [key]: { base } });
  const payload = buildBasePayload(effectiveProduct(normalizeVudooProduct(source), { base }, 'base'), config);
  for (const [field, expected] of Object.entries(values)) {
    assert.equal(current[field], expected, field);
    assert.equal(current.provenance[field].value, expected, field);
    assert.equal(current.provenance[field].marketplace, expected, field);
    assert.equal(editorFieldValue(current, field === 'weight' || ['height', 'width', 'length'].includes(field) ? 'Fisico' : 'Commerciale', field), expected);
    assert.equal(editorFieldScope('Commerciale', field), 'base');
  }
  assert.equal(current.provenance.quantity.source, '999');
  assert.equal(current.provenance.quantity.canonical, 999);
  assert.equal(current.provenance.quantity.manual, undefined);
  assert.equal(payload.stock.bl_1, current.quantity);
  assert.equal(payload.prices[2], current.price);
  for (const field of ['tax_rate', 'weight', 'height', 'width', 'length']) assert.equal(payload[field], current[field]);
  assert.deepEqual(source, original);
});

test('operational display keeps Base above manual, then manual above Vudoo', () => {
  const withBase = row({ [key]: { quantity: 7, base: { quantity: 11 } } });
  const withoutBase = row({ [key]: { quantity: 7 } });
  assert.equal(withBase.quantity, 11);
  assert.equal(withBase.provenance.quantity.manual, 7);
  assert.equal(withBase.provenance.quantity.globalValue, 7);
  assert.equal(withoutBase.quantity, 7);
  assert.equal(row({}).quantity, 999);
  assert.deepEqual(source, original);
});

test('bulk value is visible immediately, survives disk reload, single edit and reset', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-effective-'));
  const file = path.join(directory, 'overrides.json');
  try {
    let overrides = await saveBulkProductField(file, {}, 'company', [source], { scope: 'base', field: 'quantity', value: 11,
      expectedRevisions: { [source.id]: '{}' } });
    assert.equal(row(overrides).quantity, 11);
    assert.equal(editorFieldValue(row(overrides), 'Commerciale', 'quantity'), 11);
    overrides = await loadProductOverrides(file);
    assert.equal(row(overrides).quantity, 11);
    overrides = await saveProductFieldPatch(file, overrides, 'company', source, { scope: editorFieldScope('Commerciale', 'quantity'),
      changes: { quantity: 15 }, expectedRevision: row(overrides).overrideRevision });
    assert.equal(row(overrides).quantity, 15);
    assert.equal(buildBasePayload({ ...source, quantity: row(overrides).quantity, price: row(overrides).price }, config).stock.bl_1, 15);
    overrides = await saveProductFieldPatch(file, overrides, 'company', source, { scope: 'base', reset: ['quantity'],
      expectedRevision: row(overrides).overrideRevision });
    assert.equal(row(overrides).quantity, 999);
    assert.equal(editorFieldValue(row(overrides), 'Commerciale', 'quantity'), 999);
    assert.deepEqual(source, original);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
