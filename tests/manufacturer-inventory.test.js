import test from 'node:test';
import assert from 'node:assert/strict';
import { createManufacturerInventoryService, inventoryIdentity } from '../electron/manufacturerInventory.js';

const template = { inventory_id: 1, name: 'Default', description: 'Template', is_default: true,
  languages: ['it', 'en'], default_language: 'it', price_groups: [21], default_price_group: 21,
  warehouses: ['bl_9'], default_warehouse: 'bl_9', reservations: false };
const manufacturer = { id: 7, catalog_code: '390296', name: 'Mazzuoli Giuliano', base_inventory_id: null };

function harness({ list = [template], mapped = null, simulate = false, readError = null, writeError = null,
  saveError = null, templateId = 1 } = {}) {
  let current = { ...manufacturer, base_inventory_id: mapped };
  let inventories = [...list];
  const calls = { read: 0, write: 0, saved: 0 };
  const directory = {
    getByCode: () => current,
    setBaseInventoryId: (_code, id) => {
      calls.saved++;
      if (saveError && calls.saved === 1) throw saveError;
      current = { ...current, base_inventory_id: id };
      return current;
    },
  };
  const service = createManufacturerInventoryService({ directory, configuredInventoryId: templateId,
    isSimulation: () => simulate,
    getInventories: async () => { calls.read++; if (readError) throw readError; return { inventories }; },
    addInventory: async input => {
      calls.write++;
      if (writeError) throw writeError;
      const created = { ...input, inventory_id: 500 };
      inventories = [...inventories, created];
      return { inventory_id: 500 };
    },
  });
  return { service, calls, current: () => current, inventories: () => inventories };
}

test('Inventory nuovo: legge prima di creare, copia solo il template e salva il mapping', async () => {
  const h = harness();
  const result = await h.service.ensureInventoryForManufacturer(manufacturer);
  assert.equal(result.status, 'CREATED');
  assert.equal(result.inventoryId, 500);
  assert.deepEqual(h.calls, { read: 1, write: 1, saved: 1 });
  assert.equal(h.current().base_inventory_id, 500);
  assert.deepEqual(h.inventories()[1], { ...inventoryIdentity(manufacturer), inventory_id: 500,
    languages: template.languages, default_language: 'it', price_groups: [21], default_price_group: 21,
    warehouses: ['bl_9'], default_warehouse: 'bl_9', reservations: false });
  assert.equal(Object.hasOwn(h.inventories()[1], 'is_default'), false);
  for (let i = 0; i < 9; i++) assert.equal((await h.service.ensureInventoryForManufacturer(manufacturer)).inventoryId, 500);
  assert.equal(h.calls.write, 1);
});

test('Mapping valido e ensure ripetuto non creano duplicati', async () => {
  const h = harness({ list: [template, { ...inventoryIdentity(manufacturer), inventory_id: 500 }], mapped: 500 });
  for (let i = 0; i < 10; i++) assert.equal((await h.service.ensureInventoryForManufacturer(manufacturer)).status, 'LINKED');
  assert.equal(h.calls.write, 0);
  assert.equal(h.calls.saved, 0);
});

test('Mapping perso, database ricreato e mapping stale riconciliano il marker senza creare', async () => {
  for (const mapped of [null, 307]) {
    const h = harness({ list: [template, { ...inventoryIdentity(manufacturer), inventory_id: 500 }], mapped });
    const result = await h.service.ensureInventoryForManufacturer({ ...manufacturer, base_inventory_id: mapped });
    assert.equal(result.status, 'RECONCILED');
    assert.equal(h.current().base_inventory_id, 500);
    assert.equal(h.calls.write, 0);
  }
});

test('Riconciliazione usa marker prioritario, poi nome esatto, mai nome produttore generico', async () => {
  const identity = inventoryIdentity(manufacturer);
  const marked = { inventory_id: 500, name: 'Nome modificato', description: identity.description };
  const named = { inventory_id: 501, name: identity.name, description: '' };
  assert.equal((await harness({ list: [template, named, marked] }).service.ensureInventoryForManufacturer(manufacturer)).inventoryId, 500);
  assert.equal((await harness({ list: [template, named] }).service.ensureInventoryForManufacturer(manufacturer)).inventoryId, 501);
  const h = harness({ list: [template, { inventory_id: 502, name: 'Mazzuoli Giuliano', description: '' }], simulate: true });
  assert.equal((await h.service.ensureInventoryForManufacturer(manufacturer)).status, 'SIMULATED_CREATE');
});

test('Ambiguità richiede scelta esplicita e non crea un terzo Inventory', async () => {
  const same = inventoryIdentity(manufacturer);
  const h = harness({ list: [template, { ...same, inventory_id: 500 }, { ...same, inventory_id: 501 }] });
  const ambiguous = await h.service.ensureInventoryForManufacturer(manufacturer);
  assert.equal(ambiguous.status, 'AMBIGUOUS');
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal(h.calls.write, 0);
  const chosen = await h.service.ensureInventoryForManufacturer(manufacturer, { selectedInventoryId: 501 });
  assert.equal(chosen.inventoryId, 501);
  assert.equal(h.current().base_inventory_id, 501);
  assert.equal(h.calls.write, 0);
});

test('Simulazione mostra payload completo, non crea e non salva ID fittizi', async () => {
  const h = harness({ simulate: true });
  const result = await h.service.ensureInventoryForManufacturer(manufacturer);
  assert.equal(result.status, 'SIMULATED_CREATE');
  assert.equal(result.inventoryId, null);
  assert.equal(result.planned.name, '390296 - Mazzuoli Giuliano');
  assert.equal(result.planned.description, 'Vudoo catalog 390296 | Mazzuoli Giuliano');
  assert.deepEqual(h.calls, { read: 1, write: 0, saved: 0 });
});

test('getInventories, template o addInventory falliti non salvano mapping errati', async () => {
  const offline = harness({ readError: new Error('offline') });
  await assert.rejects(offline.service.ensureInventoryForManufacturer(manufacturer), /offline/);
  assert.equal(offline.calls.write, 0);
  const missing = harness({ templateId: 999 });
  await assert.rejects(missing.service.ensureInventoryForManufacturer(manufacturer), error => error.code === 'CONFIGURED_INVENTORY_NOT_FOUND');
  assert.equal(missing.calls.write, 0);
  const failed = harness({ writeError: new Error('write failed') });
  await assert.rejects(failed.service.ensureInventoryForManufacturer(manufacturer), /write failed/);
  assert.equal(failed.current().base_inventory_id, null);
});

test('Creazione remota riuscita e salvataggio SQLite fallito: il retry riconcilia senza duplicare', async () => {
  const h = harness({ saveError: new Error('SQLite unavailable') });
  await assert.rejects(h.service.ensureInventoryForManufacturer(manufacturer), /SQLite unavailable/);
  const retry = await h.service.ensureInventoryForManufacturer(manufacturer);
  assert.equal(retry.status, 'RECONCILED');
  assert.equal(h.calls.write, 1);
  assert.equal(h.current().base_inventory_id, 500);
});

test('Due ensure concorrenti sul catalogo producono una sola creazione', async () => {
  const h = harness();
  const [a, b] = await Promise.all([
    h.service.ensureInventoryForManufacturer(manufacturer), h.service.ensureInventoryForManufacturer(manufacturer),
  ]);
  assert.equal(a.inventoryId, b.inventoryId);
  assert.equal(h.calls.write, 1);
});

test('Nome lungo è troncato a 100 caratteri conservando catalog_code completo', () => {
  const name = inventoryIdentity({ ...manufacturer, name: 'x'.repeat(160) }).name;
  assert.equal(name.length, 100);
  assert.ok(name.startsWith('390296 - '));
});
