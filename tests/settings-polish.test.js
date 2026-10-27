import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseConnectionView } from '../renderer/src/baseConnectionView.js';
import { UI_KEY, layoutDefaults, readLayoutPreferences, readTableState, resetVisualPreferences, writeLayoutPreferences, writeTableState } from '../renderer/src/uiPreferences.js';
import { applyVisualPreferences } from '../renderer/src/theme.js';

const storage = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};

test('visual preferences migrate safely and persist with existing column views', () => {
  const local = storage();
  local.setItem(UI_KEY, JSON.stringify({ schemaVersion: 1, layout: { theme: 'dark', pageSize: 80 }, businessMarker: 'untouched' }));
  assert.deepEqual(readLayoutPreferences(local), { ...layoutDefaults, theme: 'dark', pageSize: 80 });
  const table = readTableState('base', local);
  table.columns.sku = false;
  table.views = [{ id: 'mine', name: 'La mia vista' }];
  writeTableState('base', table, local);
  assert.equal(writeLayoutPreferences({ accent: 'cyan', animations: false, tableFontSize: 17, radius: 19 }, local), true);
  assert.deepEqual(readLayoutPreferences(local), { ...layoutDefaults, theme: 'dark', pageSize: 80,
    accent: 'cyan', animations: false, tableFontSize: 17, radius: 19 });
  assert.equal(readTableState('base', local).views[0].name, 'La mia vista');
  assert.equal(readTableState('base', local).columns.sku, false);
  assert.equal(JSON.parse(local.getItem(UI_KEY)).businessMarker, 'untouched');
  assert.equal(writeLayoutPreferences({ radius: 25 }, local), false);
  assert.equal(writeLayoutPreferences({ tableFontSize: 11 }, local), false);
});

test('UI reset restores visual defaults without clearing columns, saved views, or other data', () => {
  const local = storage();
  local.setItem(UI_KEY, JSON.stringify({ schemaVersion: 1, businessMarker: { id: 1 } }));
  const table = readTableState('base', local);
  table.density = 'compact'; table.columns.sku = false;
  table.views = [{ id: 'saved', name: 'Vista personale' }];
  writeTableState('base', table, local);
  writeLayoutPreferences({ theme: 'dark', accent: 'azure', animations: false, tableFontSize: 18, radius: 21, pageSize: 90, sidebarCollapsed: true }, local);
  assert.equal(resetVisualPreferences(local), true);
  assert.deepEqual(readLayoutPreferences(local), layoutDefaults);
  assert.equal(readTableState('base', local).density, 'comfortable');
  assert.equal(readTableState('base', local).columns.sku, false);
  assert.equal(readTableState('base', local).views[0].name, 'Vista personale');
  assert.deepEqual(JSON.parse(local.getItem(UI_KEY)).businessMarker, { id: 1 });
});

test('live visual application updates root tokens without altering semantic status colors', () => {
  const values = new Map();
  const root = { dataset: {}, style: { setProperty: (key, value) => values.set(key, value) } };
  applyVisualPreferences({ ...layoutDefaults, theme: 'dark', accent: 'cyan', animations: false, tableFontSize: 16, radius: 14 }, root);
  assert.deepEqual(root.dataset, { theme: 'dark', accent: 'cyan', animations: 'off' });
  assert.equal(values.get('--table-font-size'), '16px');
  assert.equal(values.get('--radius-md'), '14px');
  assert.equal(values.get('--radius-sm'), '10px');
  const css = readFileSync(new URL('../renderer/src/index.css', import.meta.url), 'utf8');
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const selector of ['data-accent="azure"', 'data-accent="cyan"']) assert.ok(css.includes(selector));
  assert.doesNotMatch(css.match(/:root\[data-accent="cyan"\][^}]+}/)?.[0] || '', /--color-(success|warning|danger)/);
});

test('Generali uses runtime version, active catalog and shared Base state; preview is static', () => {
  const main = readFileSync(new URL('../electron/main.js', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
  const presentation = readFileSync(new URL('../renderer/src/AppPresentation.jsx', import.meta.url), 'utf8');
  assert.match(main, /packageVersion = createRequire\(import\.meta\.url\)\('\.\.\/package\.json'\)\.version/);
  assert.match(main, /version: app\.isPackaged \? app\.getVersion\(\) : packageVersion/);
  assert.match(main, /dataPath: app\.getPath\('userData'\)/);
  assert.match(panel, /catalog\?\.manufacturerName \|\| catalog\?\.channelTitle/);
  assert.match(panel, /baseConnectionView\(baseConnection\?\.configured \?\? baseConfigured, baseConnection\?\.verification\)/);
  assert.match(presentation, /baseConnection=\{app\.baseConnection\} catalog=\{catalog\}/);
  assert.equal(baseConnectionView(true, 'connected').text, 'Configurato - connesso a Base.com');
  assert.equal(baseConnectionView(false, null).text, 'Non configurato');
  assert.match(panel, /Collana Venere/);
  assert.doesNotMatch(panel.match(/export function LayoutPreview[\s\S]*?function ColumnWidthInput/)?.[0] || '', /electronAPI|fetch\(/);
});
