import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recentManufacturers } from '../renderer/src/manufacturersView.js';
import { baseConnectionView, connectionResultFromChecks } from '../renderer/src/baseConnectionView.js';

const source = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Home usa CatalogLookup e il loader esistente, poi naviga a Prodotti', () => {
  const page = source('../renderer/src/pages/DashboardPage.jsx');
  const presentation = source('../renderer/src/AppPresentation.jsx');
  assert.match(page, /<CatalogLookup onLoad=\{onLoadCatalog\} onLoaded=\{\(\) => onNavigate\('base-catalog'\)\}/);
  assert.match(presentation, /onLoadCatalog=\{app\.handleFetchCatalog\}/);
  assert.match(page, /await onLoadCatalog\(item\.catalogCode\)/);
  assert.match(page, /onNavigate\('base-catalog'\)/);
  assert.match(source('../renderer/src/components/CatalogLookup.jsx'), /searchManufacturers\(term\)/);
});

test('Home mostra solo ricerca e produttori recenti, senza guida e stato sistema', () => {
  const page = source('../renderer/src/pages/DashboardPage.jsx');
  assert.match(page, /Cerca il tuo catalogo/);
  assert.doesNotMatch(page, /dashboard-guide|Come si usa Vudoo Product Manager|Stato sistema/);
  assert.match(page, /Vedi tutti i produttori →/);
  assert.match(page, /onNavigate\('base-manufacturers'\)/);
  for (const oldKpi of ['Prodotti nel catalogo', 'Prodotti selezionati', 'Base · pronti localmente',
    'Base · problemi', 'stat-grid']) assert.doesNotMatch(page, new RegExp(oldKpi));
});

test('Caricamento catalogo con barra condivisa e senza percentuali inventate', () => {
  const progress = source('../renderer/src/components/CatalogLoadProgress.jsx');
  const lookup = source('../renderer/src/components/CatalogLookup.jsx');
  const dashboard = source('../renderer/src/pages/DashboardPage.jsx');
  const manufacturers = source('../renderer/src/pages/ManufacturersPage.jsx');
  const presentation = source('../renderer/src/AppPresentation.jsx');
  assert.match(progress, /role="progressbar"/);
  assert.match(progress, /aria-valuenow=\{complete \? 100 : undefined\}/);
  assert.match(progress, /Recupero prodotti da Vudoo/);
  for (const page of [lookup, dashboard, manufacturers]) {
    assert.match(page, /set\w*LoadStatus\('loading'\)|setLoadStatus\('loading'\)/);
    assert.match(page, /<CatalogLoadProgress/);
  }
  assert.match(manufacturers, /Carica catalogo/);
  assert.match(presentation, /<ManufacturersPage[^>]*onLoadCatalog=\{app\.handleFetchCatalog\}/);
  assert.doesNotMatch(presentation, /ATTENZIONE: modalità reale attiva/);
  assert.match(source('../renderer/src/components/AppShell.jsx'), /mode-badge--real/);
});

test('Diagnostica mostra stato Base.com derivato dalla verifica reale', () => {
  const page = source('../renderer/src/pages/BaseDiagnosticsPage.jsx');
  const presentation = source('../renderer/src/AppPresentation.jsx');
  assert.ok(page.indexOf('<InventoryStatus') < page.indexOf('Stato sistema'));
  assert.ok(page.indexOf('Stato sistema') < page.indexOf('className="card connection-card"'));
  assert.match(page, /setConnectionResult\(connectionResultFromChecks\(response\.checks\)\)/);
  assert.equal(connectionResultFromChecks([]), undefined);
  assert.equal(connectionResultFromChecks([{ title: 'Connessione Base.com & Inventory', ok: true }]), true);
  assert.equal(connectionResultFromChecks([{ title: 'Connessione Base.com & Inventory', ok: false }]), false);
  assert.match(presentation, /<BaseDiagnosticsPage[^>]*baseConfigured=\{app\.baseConfigured\}/);
  assert.equal(baseConnectionView(false, undefined).text, 'Non configurato');
  assert.equal(baseConnectionView(true, undefined).text, 'Configurato - connessione da verificare');
  assert.equal(baseConnectionView(true, true).text, 'Configurato - connesso a Base.com');
  assert.equal(baseConnectionView(true, false).text, 'Configurato - connessione non riuscita');
  assert.equal(baseConnectionView(true, true).tone, 'success');
  assert.equal(baseConnectionView(true, false).tone, 'error');
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
