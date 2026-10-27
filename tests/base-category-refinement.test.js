import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createBaseCategoryCache } from '../electron/baseCategoryCache.js';
import { buildGlobalCategoryIndex } from '../src/categories.js';
import { prepareBaseCategoryMove } from '../renderer/src/baseCategoryMove.js';
import { createBaseCategoryService } from '../electron/baseCategoryService.js';

const category = (categoryId, parentId, name, path) => ({ categoryId, parentId, name, path });
const rows = [category(1, 0, 'Bellezza', ['Bellezza']),
  category(2, 1, 'Profumi', ['Bellezza', 'Profumi']),
  category(3, 2, 'Fragranze', ['Bellezza', 'Profumi', 'Fragranze'])];

test('cache categorie: un solo READ concorrente, riuso e refresh forzato condiviso', async () => {
  let reads = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const cache = createBaseCategoryCache({ read: async () => { reads++; await gate; return rows; },
    buildIndex: buildGlobalCategoryIndex });
  const first = cache.ensure();
  const second = cache.ensure();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(reads, 1);
  assert.strictEqual(a, b);
  assert.equal(a.categoriesVerified, true);
  assert.equal(a.index.byId.get(3).path.join(' > '), 'Bellezza > Profumi > Fragranze');
  assert.strictEqual(await cache.ensure(), a);
  assert.equal(reads, 1);
  const refreshed = await cache.ensure({ force: true });
  assert.equal(reads, 2);
  assert.ok(refreshed.lastCategoriesRefresh);
  assert.equal(cache.current(), refreshed);
});

test('cache categorie: errore READ non finge verifica e resta retryabile', async () => {
  let reads = 0;
  const cache = createBaseCategoryCache({ read: async () => {
    reads++; if (reads === 1) throw new Error('offline'); return rows;
  }, buildIndex: buildGlobalCategoryIndex });
  await assert.rejects(cache.ensure(), /offline/);
  assert.equal(cache.current(), null);
  assert.equal((await cache.ensure()).categoriesVerified, true);
  assert.equal(reads, 2);
});

test('cache categorie: una READ lenta non sovrascrive il risultato più recente di un CRUD', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const cache = createBaseCategoryCache({ read: async () => { await gate; return rows; },
    buildIndex: buildGlobalCategoryIndex });
  const pending = cache.ensure();
  const updated = cache.replace([category(4, 0, 'Nuova', ['Nuova'])]);
  release();
  assert.strictEqual(await pending, updated);
  assert.equal(cache.current().index.byId.has(4), true);
});

test('drag categoria cambia solo parent: target e root validi; cicli e noop esclusi', () => {
  assert.deepEqual(prepareBaseCategoryMove(rows, 3, 1)?.toPath, ['Bellezza']);
  assert.equal(prepareBaseCategoryMove(rows, 3, 0)?.parentId, 0);
  for (const [source, target] of [[1, 3], [2, 3], [1, 1], [3, 2], [99, 1], [3, 99]]) {
    assert.equal(prepareBaseCategoryMove(rows, source, target), null);
  }
});

test('drop confermato: update una volta e rilettura Base; simulazione senza write', async () => {
  for (const simulation of [false, true]) {
    let current = rows.map(row => ({ category_id: row.categoryId, parent_id: row.parentId, name: row.name }));
    const calls = [];
    const service = createBaseCategoryService({ isSimulation: () => simulation,
      request: async (method, input = {}) => {
        calls.push({ method, input });
        if (method === 'getInventoryCategories') return { categories: current };
        if (method === 'addInventoryCategory') {
          current = current.map(row => row.category_id === input.category_id
            ? { ...row, parent_id: input.parent_id } : row);
          return { category_id: input.category_id };
        }
        throw new Error('Unexpected request');
      } });
    const proposal = prepareBaseCategoryMove(rows, 3, 0);
    assert.equal(calls.length, 0); // A drop only opens the confirmation.
    const result = await service.mutate('update', { categoryId: proposal.categoryId,
      name: proposal.name, parentId: proposal.parentId,
      expectedName: proposal.name, expectedParentId: proposal.currentParentId });
    assert.equal(result.simulated, simulation);
    assert.equal(calls.filter(call => call.method === 'addInventoryCategory').length, simulation ? 0 : 1);
    assert.equal(calls.filter(call => call.method === 'getInventoryCategories').length, simulation ? 1 : 2);
    assert.equal(result.categories.find(row => row.categoryId === 3).parentId, simulation ? 2 : 0);
  }
});

test('startup token e limite di prova usano binding runtime condivisi', async () => {
  const environment = {};
  const source = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context: vm.createContext({ process: { env: environment } }) });
  await module.link(() => { throw new Error('Unexpected dependency'); });
  await module.evaluate();
  assert.equal(module.namespace.token, undefined);
  assert.equal(module.namespace.testMode, 'false');
  environment.BASE_API_TOKEN = 'offline-test-only';
  module.namespace.refreshBaseToken();
  assert.equal(module.namespace.token, 'offline-test-only');
  module.namespace.setTestMode(true);
  assert.equal(module.namespace.testMode, 'true');
  module.namespace.setTestMode(false);
  assert.equal(module.namespace.testMode, 'false');
  assert.equal(environment.TEST_MODE, 'false');
});

test('UI: create root e sottocategoria precompilano parent; move richiede conferma', () => {
  const page = readFileSync(new URL('../renderer/src/pages/BaseCategoriesPage.jsx', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../renderer/src/components/BaseCategoryBrowser.jsx', import.meta.url), 'utf8');
  assert.match(page, /startCreate\(0\)/);
  assert.match(page, /startCreate\(selected\.categoryId\)/);
  assert.match(page, /moveProposal && <MoveCategoryDialog/);
  assert.match(page, /onConfirm=\{confirmMove\}/);
  assert.match(browser, /prepareBaseCategoryMove\(categories, draggedId, parentId\)/);
  assert.match(browser, /Livello principale · trascina qui/);
});
