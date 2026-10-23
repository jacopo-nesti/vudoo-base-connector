import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filterManufacturers } from '../renderer/src/manufacturersView.js';

const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('ogni nuova sessione parte da Panoramica e la sidebar mette Produttori subito dopo', () => {
  const app = source('../renderer/src/App.jsx');
  const shell = source('../renderer/src/components/AppShell.jsx');
  assert.match(app, /\[page, setPage\] = useState\('base-overview'\)/);
  assert.match(shell, /page: 'base-overview'.*\n\s*\{ page: 'base-manufacturers'/);
  assert.match(source('../renderer/src/AppPresentation.jsx'), /page === 'base-manufacturers' && <ManufacturersPage/);
});

test('ricerca locale trova nome e codice senza distinguere maiuscole', () => {
  const rows = [{ name: '365 by Giuliano Mazzuoli', catalogCode: '390296' },
    { name: 'Carlo Bay', catalogCode: '390331' }];
  assert.deepEqual(filterManufacturers(rows, 'MAZZUOLI'), [rows[0]]);
  assert.deepEqual(filterManufacturers(rows, '390331'), [rows[1]]);
  assert.deepEqual(filterManufacturers(rows, '  '), rows);
  assert.deepEqual(filterManufacturers(rows, 'assente'), []);
});

test('pagina Produttori usa solo lettura IPC e mostra statistiche, Inventory ed empty state', () => {
  const page = source('../renderer/src/pages/ManufacturersPage.jsx');
  assert.match(page, /electronAPI\.getManufacturers\(\)/);
  assert.doesNotMatch(page, /getInventories|callBase|node:sqlite|node:fs/);
  for (const label of ['Nessun produttore salvato', 'Inventory associato', 'Inventory non associato',
    'lastProductCount', 'lastLoadedAt']) assert.ok(page.includes(label), label);
  assert.match(page, /onClick=\{\(\) => loadCatalog\(item\)\}>Carica catalogo/);
});
