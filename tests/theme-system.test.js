import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { UI_KEY, readLayoutPreferences, readTableState, writeLayoutPreferences, writeTableState } from '../renderer/src/uiPreferences.js';
import { applyTheme, installThemeSync, resolveTheme } from '../renderer/src/theme.js';

const memory = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('theme defaults to light and persists alongside table and layout preferences', () => {
  const storage = memory();
  assert.equal(readLayoutPreferences(storage).theme, 'light');
  const table = readTableState('base', storage);
  table.widths.title = 440; table.density = 'compact';
  table.views = [{ id: 'view', name: 'Vista', widths: { price: 140 } }];
  writeTableState('base', table, storage);
  assert.equal(writeLayoutPreferences({ theme: 'dark', sidebarCollapsed: true, pageSize: 80 }, storage), true);
  assert.deepEqual(readLayoutPreferences(storage), { theme: 'dark', sidebarCollapsed: true, pageSize: 80,
    accent: 'blue', animations: true, tableFontSize: 12, radius: 8 });
  assert.equal(readTableState('base', storage).widths.title, 440);
  assert.equal(readTableState('base', storage).density, 'compact');
  assert.equal(readTableState('base', storage).views[0].widths.price, 140);
  assert.equal(writeLayoutPreferences({ theme: 'light' }, storage), true);
  assert.equal(readLayoutPreferences(storage).theme, 'light');
  assert.equal(writeLayoutPreferences({ theme: 'invalid' }, storage), false);
});

test('system follows OS changes; explicit light and dark override them immediately', () => {
  const storage = memory();
  const root = { dataset: {}, style: {} };
  const listeners = new Map();
  const mediaListeners = new Map();
  const media = { matches: false, addEventListener: (event, callback) => mediaListeners.set(event, callback),
    removeEventListener: event => mediaListeners.delete(event) };
  const browserWindow = { localStorage: storage, matchMedia: () => media,
    addEventListener: (event, callback) => listeners.set(event, callback),
    removeEventListener: event => listeners.delete(event) };
  const cleanup = installThemeSync({ window: browserWindow, document: { documentElement: root } });
  assert.equal(root.dataset.theme, 'light');
  writeLayoutPreferences({ theme: 'system' }, storage);
  listeners.get('vudoo:ui-preferences')();
  assert.equal(root.dataset.theme, 'light');
  media.matches = true; mediaListeners.get('change')();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(root.style.colorScheme, 'dark');
  writeLayoutPreferences({ theme: 'light' }, storage);
  listeners.get('vudoo:ui-preferences')();
  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.style.colorScheme, 'light');
  writeLayoutPreferences({ theme: 'dark' }, storage);
  listeners.get('vudoo:ui-preferences')();
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(applyTheme('light', root, true), 'light');
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(mediaListeners.size, 0);
});

test('startup theme is applied before renderer script and window opens after first paint', () => {
  const html = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inline);
  assert.ok(html.indexOf('<script>') < html.indexOf('type="module"'));
  for (const [preference, osDark, expected] of [
    [undefined, true, 'light'], ['dark', false, 'dark'], ['system', true, 'dark'],
    ['system', false, 'light'], ['light', true, 'light'],
  ]) {
    const root = { dataset: {}, style: {} };
    const localStorage = { getItem: key => { assert.equal(key, UI_KEY);
      return JSON.stringify({ layout: preference ? { theme: preference } : {} }); } };
    vm.runInNewContext(inline, { document: { documentElement: root }, localStorage,
      matchMedia: () => ({ matches: osDark }) });
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.style.colorScheme, expected);
  }
  const main = readFileSync(new URL('../electron/main.js', import.meta.url), 'utf8');
  assert.match(main, /show:\s*false/);
  assert.match(main, /ready-to-show[^\n]*window\.show\(\)/);
});

test('theme controls and critical surfaces use semantic tokens', () => {
  const settings = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../renderer/src/index.css', import.meta.url), 'utf8');
  const tableCss = readFileSync(new URL('../renderer/src/enterpriseTables.css', import.meta.url), 'utf8');
  const overlayCss = readFileSync(new URL('../renderer/src/workspaceTools.css', import.meta.url), 'utf8');
  assert.match(settings, /<fieldset className="settings-theme"><legend>Tema<\/legend>/);
  assert.match(settings, /\['light', 'Chiaro'\], \['dark', 'Scuro'\], \['system', 'Sistema'\]/);
  assert.match(settings, /type="radio" name="theme"/);
  assert.match(css, /\[data-theme="dark"\] \{/);
  assert.match(css, /:root\[data-theme="dark"\] \{ color-scheme: dark; \}/);
  assert.match(css, /\.product-dialog \{[^}]*background: var\(--color-surface\)/);
  assert.match(css, /\.base-category-line--drop[^}]*background: var\(--color-primary-light\)/);
  assert.match(css, /\.window-control--close:hover[^}]*background: var\(--color-window-close\)/);
  assert.match(tableCss, /\.pinned-product-column \{[^}]*background:var\(--color-surface\)/);
  assert.match(overlayCss, /\.command-palette,.notification-panel \{[^}]*background:var\(--color-surface\)/);
});
