import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { MANUFACTURERS_DB_FILE_NAME, openManufacturerDirectory,
  registerLoadedCatalog, suggestedManufacturerName } from '../electron/manufacturerDirectory.js';

async function withDirectory(action) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'vudoo-manufacturers-'));
  const file = path.join(folder, MANUFACTURERS_DB_FILE_NAME);
  try { await action(file); }
  finally { await rm(folder, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); }
}

test('Anagrafica: schema minimo, inserimento, codice unico e persistenza', async () => {
  await withDirectory(async file => {
    const directory = openManufacturerDirectory(file);
    assert.deepEqual(directory.save('390331', 'Carlo Bay').manufacturer.name, 'Carlo Bay');
    assert.equal(directory.save('390331', 'Nome diverso').created, false);
    assert.equal(directory.getByCode('390331').name, 'Carlo Bay');
    directory.close();
    const db = new DatabaseSync(file);
    assert.deepEqual(db.prepare('PRAGMA table_info(manufacturers)').all().map(row => row.name),
      ['id', 'catalog_code', 'name', 'base_inventory_id', 'last_product_count', 'last_loaded_at']);
    assert.equal(db.prepare('SELECT count(*) AS count FROM manufacturers').get().count, 1);
    db.close();
    const reopened = openManufacturerDirectory(file);
    assert.equal(reopened.getByCode('390331').name, 'Carlo Bay');
    assert.equal(reopened.getByCode('390331').base_inventory_id, null);
    assert.equal(reopened.setBaseInventoryId('390331', 307).base_inventory_id, 307);
    reopened.close();
  });
});

test('Anagrafica: migra lo schema SQLite precedente conservando i produttori', async () => {
  await withDirectory(async file => {
    const old = new DatabaseSync(file);
    old.exec('CREATE TABLE manufacturers (id INTEGER PRIMARY KEY, catalog_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL)');
    old.prepare('INSERT INTO manufacturers (catalog_code, name) VALUES (?, ?)').run('390296', 'Mazzuoli Giuliano');
    old.close();
    const directory = openManufacturerDirectory(file);
    assert.deepEqual({ ...directory.getByCode('390296') }, { id: 1, catalog_code: '390296',
      name: 'Mazzuoli Giuliano', base_inventory_id: null, last_product_count: null, last_loaded_at: null });
    directory.setBaseInventoryId('390296', 500);
    directory.close();
    const reopened = openManufacturerDirectory(file);
    assert.equal(reopened.getByCode('390296').base_inventory_id, 500);
    assert.equal(reopened.save('390296', 'Altro nome').created, false);
    assert.equal(reopened.getByCode('390296').name, 'Mazzuoli Giuliano');
    reopened.close();
  });
});

test('Anagrafica: migrazione conserva Inventory e aggiunge le statistiche senza perdere il produttore', async () => {
  await withDirectory(async file => {
    const old = new DatabaseSync(file);
    old.exec('CREATE TABLE manufacturers (id INTEGER PRIMARY KEY, catalog_code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, base_inventory_id INTEGER NULL)');
    old.prepare('INSERT INTO manufacturers (catalog_code, name, base_inventory_id) VALUES (?, ?, ?)').run('390296', 'Mazzuoli', 119455);
    old.close();
    const directory = openManufacturerDirectory(file);
    assert.equal(directory.getByCode('390296').base_inventory_id, 119455);
    assert.equal(directory.getByCode('390296').last_product_count, null);
    directory.close();
    const reopened = openManufacturerDirectory(file);
    assert.equal(reopened.list()[0].name, 'Mazzuoli');
    assert.equal(reopened.list()[0].baseInventoryId, 119455);
    reopened.close();
  });
});

test('Anagrafica: due caricamenti registrano 83 poi 91 prodotti e aggiornano data', async () => {
  await withDirectory(async file => {
    const directory = openManufacturerDirectory(file);
    const first = registerLoadedCatalog(directory, '390296', 'Mazzuoli', 83, '2026-10-14T09:32:00.000Z');
    assert.equal(first.manufacturer.last_product_count, 83);
    assert.equal(first.manufacturer.last_loaded_at, '2026-10-14T09:32:00.000Z');
    directory.setBaseInventoryId('390296', 119455);
    const second = registerLoadedCatalog(directory, '390296', 'Nome diverso', 91, '2026-10-15T11:00:00.000Z');
    assert.equal(second.status, 'known');
    assert.equal(second.manufacturer.last_product_count, 91);
    assert.equal(second.manufacturer.last_loaded_at, '2026-10-15T11:00:00.000Z');
    assert.equal(second.manufacturer.base_inventory_id, 119455);
    directory.save('390331', 'Carlo Bay');
    assert.deepEqual(directory.list().map(item => item.catalogCode), ['390296', '390331']);
    directory.close();
    const reopened = openManufacturerDirectory(file);
    assert.equal(reopened.list()[0].lastProductCount, 91);
    assert.equal(reopened.list()[0].lastLoadedAt, '2026-10-15T11:00:00.000Z');
    reopened.close();
  });
});

test('Anagrafica: ricerca per codice, nome completo, sottostringa e maiuscole', async () => {
  await withDirectory(async file => {
    const directory = openManufacturerDirectory(file);
    directory.save('123456', 'Duca di Montaperti');
    directory.save('3900333', 'Fisio Cosmetics');
    const names = query => directory.search(query).map(row => row.name);
    assert.deepEqual(names('Duca di Montaperti'), ['Duca di Montaperti']);
    assert.deepEqual(names('duca'), ['Duca di Montaperti']);
    assert.deepEqual(names('monta'), ['Duca di Montaperti']);
    assert.deepEqual(names('DUCA'), ['Duca di Montaperti']);
    assert.deepEqual(names('3900333'), ['Fisio Cosmetics']);
    assert.deepEqual(names('non-esiste'), []);
    assert.deepEqual(names(''), []);
    directory.close();
  });
});

test('Anagrafica: catalogo nuovo auto-salvato solo con channel title affidabile', async () => {
  await withDirectory(async file => {
    const directory = openManufacturerDirectory(file);
    assert.equal(registerLoadedCatalog(directory, '390331', 'Carlo Bay').status, 'auto_saved');
    assert.equal(registerLoadedCatalog(directory, '390331', 'Nome cambiato').manufacturer.name, 'Carlo Bay');
    assert.equal(registerLoadedCatalog(directory, '390331', 'Nome cambiato').status, 'known');
    assert.equal(registerLoadedCatalog(directory, '123456', 'Catalogo Vudoo').status, 'needs_name');
    assert.equal(directory.getByCode('123456'), null);
    assert.equal(suggestedManufacturerName('123456', '123456'), null);
    assert.equal(directory.save('123456', 'Duca di Montaperti').created, true);
    assert.equal(registerLoadedCatalog(directory, '123456', 'Catalogo Vudoo').manufacturer.name, 'Duca di Montaperti');
    assert.throws(() => directory.save('', 'Nome'), /catalogCode/);
    assert.throws(() => directory.save('456', '  '), /name/);
    directory.close();
  });
});

test('Electron: IPC specifico; renderer senza filesystem o SQLite', async () => {
  const calls = [];
  let api;
  const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  vm.runInNewContext(preload, { require: specifier => {
    assert.equal(specifier, 'electron');
    return { contextBridge: { exposeInMainWorld: (_name, exposed) => { api = exposed; } },
      ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({ ok: true }); } } };
  } });
  await api.searchManufacturers('duca');
  await api.getManufacturers();
  await api.saveManufacturer({ catalogCode: '123456', name: 'Duca di Montaperti' });
  assert.deepEqual(calls, [['manufacturers:search', 'duca'], ['manufacturers:list'],
    ['manufacturers:save', { catalogCode: '123456', name: 'Duca di Montaperti' }]]);
  assert.equal('ipcRenderer' in api, false);
  for (const relative of ['../renderer/src/components/CatalogLookup.jsx',
    '../renderer/src/components/SaveManufacturerDialog.jsx', '../renderer/src/pages/ManufacturersPage.jsx']) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /node:sqlite|node:fs|ipcRenderer|require\(/);
  }
});
