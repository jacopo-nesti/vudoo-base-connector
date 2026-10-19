import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recentManufacturers } from '../renderer/src/manufacturersView.js';

const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Home usa CatalogLookup e il loader esistente, poi naviga a Prodotti', () => {
  const page = source('../renderer/src/pages/DashboardPage.jsx');
  const presentation = source('../renderer/src/AppPresentation.jsx');
  assert.match(page, /<CatalogLookup onLoad=\{onLoadCatalog\} onLoaded=\{\(\) => onNavigate\('base-catalog'\)\}/);
  assert.match(presentation, /onLoadCatalog=\{app\.handleFetchCatalog\}/);
  assert.match(page, /if \(await onLoadCatalog\(code\)\) onNavigate\('base-catalog'\)/);
  assert.match(source('../renderer/src/components/CatalogLookup.jsx'), /searchManufacturers\(term\)/);
});

test('Home ha hero, guida chiusa di default, recenti e stato compatto senza vecchi KPI', () => {
  const page = source('../renderer/src/pages/DashboardPage.jsx');
  assert.match(page, /Cerca il tuo catalogo/);
  assert.match(page, /<details className="card dashboard-guide">/);
  assert.match(page, /Vedi tutti i produttori →/);
  assert.match(page, /onNavigate\('base-manufacturers'\)/);
  assert.match(page, /Stato sistema/);
  for (const oldKpi of ['Prodotti nel catalogo', 'Prodotti selezionati', 'Base · pronti localmente',
    'Base · problemi', 'stat-grid']) assert.doesNotMatch(page, new RegExp(oldKpi));
});

test('recenti: solo cataloghi caricati, data discendente, nome come fallback e limite quattro', () => {
  const rows = [
    { name: 'Zeta', catalogCode: '9', lastLoadedAt: '2026-10-10T10:00:00.000Z' },
    { name: 'Beta', catalogCode: '2', lastLoadedAt: '2026-10-14T10:00:00.000Z' },
    { name: 'Alfa', catalogCode: '1', lastLoadedAt: '2026-10-14T10:00:00.000Z' },
    { name: 'Nuovo', catalogCode: '3', lastLoadedAt: null },
    { name: 'Gamma', catalogCode: '4', lastLoadedAt: '2026-10-09T10:00:00.000Z' },
    { name: 'Delta', catalogCode: '5', lastLoadedAt: '2026-10-08T10:00:00.000Z' },
  ];
  assert.deepEqual(recentManufacturers(rows).map(item => item.name), ['Alfa', 'Beta', 'Zeta', 'Gamma']);
  assert.equal(rows[0].name, 'Zeta');
});

test('Guida è accessibile dalla sidebar e offre le due sezioni richieste', () => {
  const shell = source('../renderer/src/components/AppShell.jsx');
  const presentation = source('../renderer/src/AppPresentation.jsx');
  const page = source('../renderer/src/pages/HelpPage.jsx');
  assert.match(shell, /page: 'system-help', label: 'Guida'/);
  assert.match(presentation, /page === 'system-help' && <HelpPage/);
  assert.match(page, /Guida operativa/);
  assert.match(page, /Documentazione tecnica/);
  assert.match(page, /Documentazione tecnica completa in preparazione/);
});
