import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyInventoryTagOperation, createInventoryTagService } from '../src/inventoryTags.js';
import { saveBulkProductTags, saveProductFieldPatch, loadProductOverrides, productOverrideRevision } from '../electron/productOverrides.js';
import { effectiveProduct, productKey } from '../electron/effectiveProduct.js';
import { toCatalogProductDto } from '../electron/catalogDto.js';
import { editorFieldValue } from '../renderer/src/components/productFieldValues.js';
import { buildBasePayload } from '../src/products.js';
import { basePayloadPreview } from '../src/marketplaces/base/localPreview.js';

const company = 'test-company';
const sourceA = { id: 'A', sku: 'A', title: 'Prodotto A', price: 10, tags: ['Oud'] };
const sourceB = { id: 'B', sku: 'B', title: 'Prodotto B', price: 12, tags: ['Vaniglia'] };
const config = { inventory: { inventory_id: 1 }, priceGroup: { price_group_id: 2, currency: 'EUR' } };
const revisions = (overrides, sources) => Object.fromEntries(sources.map(source =>
  [source.id, productOverrideRevision(overrides[productKey(company, source.id)] ?? {})]));

test('ADD calcola ogni prodotto separatamente, deduplica e conserva i tag preesistenti', () => {
  assert.deepEqual(applyInventoryTagOperation(['Oud'], ['Unisex'], 'add'), ['Oud', 'Unisex']);
  assert.deepEqual(applyInventoryTagOperation(['Vaniglia'], ['Unisex'], 'add'), ['Vaniglia', 'Unisex']);
  assert.deepEqual(applyInventoryTagOperation(['Unisex'], [' unisex ', 'INCENSO', 'incenso'], 'add'),
    ['Unisex', 'INCENSO']);
});

test('REMOVE ignora tag assenti, confronta senza case e non trasforma undefined in []', () => {
  assert.deepEqual(applyInventoryTagOperation(['Unisex', 'Oud'], ['oud'], 'remove'), ['Unisex']);
  assert.deepEqual(applyInventoryTagOperation(['Unisex'], ['Incenso'], 'remove'), ['Unisex']);
  assert.equal(applyInventoryTagOperation(undefined, ['Incenso'], 'remove'), undefined);
});

test('REPLACE sostituisce la lista; [] esplicito richiede conferma nel salvataggio', async () => {
  assert.deepEqual(applyInventoryTagOperation(['Oud', 'Unisex'], ['Legnoso'], 'replace'), ['Legnoso']);
  assert.deepEqual(applyInventoryTagOperation(undefined, [], 'replace'), []);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-bulk-tags-'));
  const file = path.join(directory, 'overrides.json');
  try {
    await assert.rejects(saveBulkProductTags(file, {}, company, [sourceA], {
      operation: 'replace', value: [], expectedRevisions: { A: '{}' },
    }), /Conferma esplicitamente/);
    assert.equal(existsSync(file), false);
    const saved = await saveBulkProductTags(file, {}, company, [sourceA], {
      operation: 'replace', value: [], confirmedEmptyReplace: true, expectedRevisions: { A: '{}' },
    });
    assert.equal(saved.changedCount, 1);
    assert.deepEqual((await loadProductOverrides(file))[productKey(company, 'A')].base.tags, []);
    assert.deepEqual(buildBasePayload(effectiveProduct(sourceA, saved.overrides[productKey(company, 'A')], 'base'), config).tags, []);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('TAG_TOO_LONG blocca l’intero bulk senza persistenza', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-bulk-tags-'));
  const file = path.join(directory, 'overrides.json');
  try {
    await assert.rejects(saveBulkProductTags(file, {}, company, [sourceA, sourceB], {
      operation: 'add', value: ['x'.repeat(26)], expectedRevisions: { A: '{}', B: '{}' },
    }), error => error.code === 'TAG_TOO_LONG' && error.tagName === 'x'.repeat(26) &&
      error.length === 26 && error.maximum === 25);
    assert.equal(existsSync(file), false);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('bulk salva solo i selezionati nello store Base; reload, single editor, payload e reset coincidono', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-bulk-tags-'));
  const file = path.join(directory, 'overrides.json');
  const sources = [sourceA, sourceB];
  const original = structuredClone(sources);
  const untouched = productKey(company, 'C');
  try {
    let overrides = { [untouched]: { base: { tags: ['Invariato'] } } };
    const saved = await saveBulkProductTags(file, overrides, company, sources, {
      operation: 'add', value: ['Unisex', ' unisex '], expectedRevisions: revisions(overrides, sources),
    });
    assert.equal(saved.changedCount, 2);
    overrides = await loadProductOverrides(file);
    assert.deepEqual(overrides[productKey(company, 'A')].base.tags, ['Oud', 'Unisex']);
    assert.deepEqual(overrides[productKey(company, 'B')].base.tags, ['Vaniglia', 'Unisex']);
    assert.deepEqual(overrides[untouched].base.tags, ['Invariato']);
    const fields = overrides[productKey(company, 'A')];
    const row = toCatalogProductDto(sourceA, { source: sourceA, canonical: sourceA,
      base: fields.base, storedOverrides: fields });
    assert.deepEqual(row.tags, ['Oud', 'Unisex']);
    assert.deepEqual(editorFieldValue(row, 'Base.com', 'tags'), ['Oud', 'Unisex']);
    assert.deepEqual(row.provenance.tags.source, ['Oud']);
    const effective = effectiveProduct(sourceA, fields, 'base');
    assert.deepEqual(buildBasePayload(effective, config).tags, ['Oud', 'Unisex']);
    assert.deepEqual(basePayloadPreview(effective).payload.tags, ['Oud', 'Unisex']);
    let calls = 0;
    const service = createInventoryTagService({ request: async method => {
      calls++;
      assert.equal(method, 'getInventoryTags');
      return { tags: [{ tag_id: 1, name: 'Oud' }] };
    }, isSimulation: () => true });
    assert.deepEqual((await service.ensureInventoryTags(effective.tags)).wouldCreate, ['Unisex']);
    assert.equal(calls, 1);
    overrides = await saveProductFieldPatch(file, overrides, company, sourceA, { scope: 'base',
      changes: { tags: ['Legnoso'] }, expectedRevision: productOverrideRevision(fields) });
    assert.deepEqual((await loadProductOverrides(file))[productKey(company, 'A')].base.tags, ['Legnoso']);
    overrides = await saveProductFieldPatch(file, overrides, company, sourceA, { scope: 'base', reset: ['tags'],
      expectedRevision: productOverrideRevision(overrides[productKey(company, 'A')]) });
    assert.deepEqual(effectiveProduct(sourceA, overrides[productKey(company, 'A')], 'base').tags, ['Oud']);
    assert.deepEqual(sources, original);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('REMOVE assente non crea override; revisione superata non modifica lo store', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-bulk-tags-'));
  const file = path.join(directory, 'overrides.json');
  try {
    const result = await saveBulkProductTags(file, {}, company, [sourceA], {
      operation: 'remove', value: ['Incenso'], expectedRevisions: { A: '{}' },
    });
    assert.equal(result.changedCount, 0);
    assert.equal(existsSync(file), false);
    await assert.rejects(saveBulkProductTags(file, {}, company, [sourceA], {
      operation: 'add', value: ['Unisex'], expectedRevisions: { A: 'stale' },
    }), /modificato/);
    assert.equal(existsSync(file), false);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('ADD e REMOVE partono dal Base override esistente, preservando gli altri campi', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-bulk-tags-'));
  const file = path.join(directory, 'overrides.json');
  try {
    const key = productKey(company, 'A');
    let overrides = { [key]: { base: { tags: ['Legnoso'], quantity: 3 }, title: 'Titolo manuale' } };
    const added = await saveBulkProductTags(file, overrides, company, [sourceA], {
      operation: 'add', value: ['Incenso', 'legnoso'], expectedRevisions: revisions(overrides, [sourceA]),
    });
    assert.deepEqual(added.overrides[key].base.tags, ['Legnoso', 'Incenso']);
    assert.equal(added.overrides[key].base.quantity, 3);
    assert.equal(added.overrides[key].title, 'Titolo manuale');
    overrides = await loadProductOverrides(file);
    const removed = await saveBulkProductTags(file, overrides, company, [sourceA], {
      operation: 'remove', value: ['legnoso'], expectedRevisions: revisions(overrides, [sourceA]),
    });
    assert.deepEqual(removed.overrides[key].base.tags, ['Incenso']);
    assert.deepEqual(sourceA.tags, ['Oud']);
  } finally { await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});

test('Bulk UI offre tre operazioni, anteprima per prodotto e conferma per REPLACE vuoto', () => {
  const dialog = readFileSync(new URL('../renderer/src/components/BulkEditorDialog.jsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../electron/main.js', import.meta.url), 'utf8');
  assert.match(dialog, /Product Tags Base\.com/);
  assert.match(dialog, /<option value="add">Aggiungi/);
  assert.match(dialog, /<option value="remove">Rimuovi/);
  assert.match(dialog, /<option value="replace">Sostituisci tutti/);
  assert.match(dialog, /tagSummary\.examples\.map/);
  assert.match(dialog, /window\.confirm\('Stai per rimuovere tutti i Product Tags/);
  assert.match(main, /saveBulkProductTags\(/);
  assert.doesNotMatch(main.slice(main.indexOf("ipcMain.handle('catalog:bulk-edit'"), main.indexOf("ipcMain.handle('catalog:base-preview'")),
    /callBase\(|addInventoryTag|addInventoryProduct/);
});
