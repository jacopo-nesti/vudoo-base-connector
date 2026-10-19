import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGlobalCategoryIndex, resolveGlobalCategoryPath } from '../src/categories.js';
import { UI_KEY, readTableState, writeTableState } from '../renderer/src/uiPreferences.js';

const rows = [
  { category_id: 10, name: 'Bellezza', parent_id: 0 },
  { category_id: 11, name: 'Profumi', parent_id: 10 },
  { category_id: 12, name: 'Accessori', parent_id: 11 },
  { category_id: 20, name: 'Moda', parent_id: 0 },
  { category_id: 21, name: 'Accessori', parent_id: 20 },
];

test('Product Manager non espone la colonna Base.com ma mantiene il preflight nella scheda', () => {
  const source = readFileSync(new URL('../renderer/src/pages/CatalogPage.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /heading\('Base\.com','status'\)|columns\.base/);
  assert.match(source, /setDetailSection\('Base\.com'\)/);
});

test('Saved View legacy con colonna Base.com si apre e la colonna viene scartata al salvataggio', () => {
  const data = new Map([[UI_KEY, JSON.stringify({ schemaVersion: 1, base: {
    columns: { base: true, ean: false }, startup: 'old', views: [{ id: 'old', name: 'Storica',
      columns: { base: true, stock: false }, filters: { search: 'profumo' } }],
  } })]]);
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const state = readTableState('base', storage);
  assert.equal(state.startup, 'old');
  assert.equal(state.views[0].filters.search, 'profumo');
  assert.equal(state.columns.base, undefined);
  assert.equal(state.views[0].columns.base, undefined);
  assert.equal(writeTableState('base', state, storage), true);
  assert.equal(JSON.stringify(JSON.parse(data.get(UI_KEY))).includes('"base":true'), false);
});

test('path completo distingue nomi omonimi e restituisce il global category_id', () => {
  const index = buildGlobalCategoryIndex(rows);
  assert.equal(index.count, 5);
  assert.deepEqual(resolveGlobalCategoryPath(['Bellezza', 'Profumi', 'Accessori'], index), {
    status: 'GLOBAL_CATEGORY_MATCH', categoryId: 12, path: ['Bellezza', 'Profumi', 'Accessori'], candidates: [],
  });
  assert.equal(resolveGlobalCategoryPath(['Moda', 'Accessori'], index).categoryId, 21);
  assert.equal(resolveGlobalCategoryPath(['Accessori'], index).categoryId, null);
});

test('path globale duplicato resta ambiguo; nessun ID viene scelto', () => {
  const index = buildGlobalCategoryIndex([...rows, { category_id: 13, name: 'Accessori', parent_id: 11 }]);
  const result = resolveGlobalCategoryPath(['Bellezza', 'Profumi', 'Accessori'], index);
  assert.equal(result.status, 'AMBIGUOUS_CATEGORY_MAPPING');
  assert.equal(result.categoryId, null);
  assert.deepEqual(result.candidates.map(candidate => candidate.categoryId), [12, 13]);
});

test('mapping non trovato resta unresolved; stesso ID globale vale per Inventory diversi', () => {
  const index = buildGlobalCategoryIndex(rows);
  const unresolved = resolveGlobalCategoryPath(['Bellezza', 'Profumi', 'Eau de Parfum'], index);
  assert.equal(unresolved.status, 'UNRESOLVED_CATEGORY_MAPPING');
  assert.equal(unresolved.categoryId, null);
  for (const inventoryId of [100, 200]) {
    assert.equal(resolveGlobalCategoryPath(['Bellezza', 'Profumi', 'Accessori'], index).categoryId, 12,
      `Inventory ${inventoryId}`);
  }
});

test('gerarchia globale con parent assente o ciclo non viene usata', () => {
  assert.throws(() => buildGlobalCategoryIndex([{ category_id: 1, name: 'A', parent_id: 2 }]), /parent mancante/);
  assert.throws(() => buildGlobalCategoryIndex([{ category_id: 1, name: 'A', parent_id: 2 },
    { category_id: 2, name: 'B', parent_id: 1 }]), /ciclica/);
});

test('sette mapping canonici usano i path globali Base verificati, senza ID fissi', () => {
  const canonical = JSON.parse(readFileSync(new URL('../config/canonical-categories.json', import.meta.url), 'utf8'));
  const expected = {
    BODY_CREAM: ['Bellezza e Salute', 'Cura della Pelle', 'Corpo', 'Creme Corpo'],
    FRAGRANCE_ACCESSORIES: ['Bellezza e Salute', 'Profumi', 'Accessori Profumo'],
    EAU_DE_COLOGNE: ['Bellezza e Salute', 'Profumi', 'Eau de Cologne'],
    HOME_FRAGRANCE_REED_DIFFUSER: ['Casa e Giardino', 'Profumazione Ambiente', 'Diffusori a Bastoncini'],
    HOME_FRAGRANCE_SPRAY: ['Casa e Giardino', 'Profumazione Ambiente', 'Spray Ambiente'],
    PEN_REFILL: ['Cancelleria', 'Accessori Scrittura', 'Refill'],
    INTIMATE_HYGIENE: ['Bellezza e Salute', 'Igiene Personale', 'Igiene Intima'],
  };
  for (const [key, path] of Object.entries(expected)) {
    assert.deepEqual(canonical[key]?.base_path, path, key);
    assert.equal(Object.hasOwn(canonical[key], 'category_id'), false, key);
  }
});
