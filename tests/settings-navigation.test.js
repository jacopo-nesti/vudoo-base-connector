import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('settings expose real sections and keep the existing runtime save path', () => {
  const panel = source('../renderer/src/SettingsPanel.jsx');
  for (const section of ['Tecniche', 'Catalogo e importazione', 'Base.com', 'Layout', 'Colonne prodotti']) {
    assert.ok(panel.includes(section), section);
  }
  assert.match(panel, /saveSettings\(parsed\.settings\)/);
  assert.match(panel, /getSettings\(\)/);
  assert.match(panel, /snapshot\.activeSettings\.dryRun === true && draft\.dryRun === false/);
  assert.match(panel, /automaticStockCap/);
  assert.match(panel, /scale: 1000/);
});

test('products link directly to column settings without removing problem detection', () => {
  const shell = source('../renderer/src/components/AppShell.jsx');
  const catalog = source('../renderer/src/pages/CatalogPage.jsx');
  const presentation = source('../renderer/src/AppPresentation.jsx');
  assert.doesNotMatch(shell, /page: 'system-problems', label: 'Problemi'/);
  assert.match(presentation, /page === 'system-problems'/);
  assert.match(catalog, /onCustomize=\{model\.onSettingsColumns\}/);
  assert.match(presentation, /setSettingsTab\('columns'\)/);
  assert.match(catalog, /readLayoutPreferences\(\)\.pageSize/);
});
