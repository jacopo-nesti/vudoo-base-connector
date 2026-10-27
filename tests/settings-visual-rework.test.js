import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baseConnectionView } from '../renderer/src/baseConnectionView.js';
import { DEFAULT_SETTINGS } from '../electron/settingsManager.js';

const panel = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../renderer/src/index.css', import.meta.url), 'utf8');
const presentation = readFileSync(new URL('../renderer/src/AppPresentation.jsx', import.meta.url), 'utf8');

test('business settings cards use only persisted fields and keep the existing save path', () => {
  const shown = [...panel.matchAll(/key: '([^']+)'[^\n]+section: '(technical|catalog|base)'/g)].map(match => match[1]);
  assert.deepEqual(shown.sort(), [
    'vudooResultsLimit', 'vudooTimeoutMs', 'automaticStockCap', 'baseApiRequestsPerMinute',
    'baseApiReadAttempts', 'baseApiRetryDelayMs', 'baseApiRateLimitDelayMs',
  ].sort());
  for (const key of shown) assert.ok(Object.hasOwn(DEFAULT_SETTINGS, key), `${key} has a backend default`);
  assert.match(panel, /<form className="settings-sections settings-business-form" onSubmit=\{save\}>/);
  assert.match(panel, /window\.electronAPI\.saveSettings\(parsed\.settings\)/);
  assert.match(panel, /<NumericSetting key=\{field\.key\}/);
  assert.match(css, /\.settings-business-form \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width: 1050px\) \{ \.settings-business-form \{ grid-template-columns:1fr;/);
});

test('Base status and verification use the shared connection state and existing diagnostics API', () => {
  assert.match(panel, /baseConnectionView\(baseConnection\?\.configured \?\? baseConfigured, baseConnection\?\.verification\)/);
  assert.match(panel, /window\.electronAPI\.checkEnvironment\(\)/);
  assert.match(panel, /onConnectionChanged\?\.\(response\.baseConnection\)/);
  assert.match(presentation, /onConnectionChanged=\{app\.setBaseConnection\}/);
  assert.equal(baseConnectionView(true, null).tone, 'warning');
  assert.equal(baseConnectionView(true, 'connected').tone, 'success');
  assert.match(panel, /Il token Base\.com viene letto dalla configurazione locale/);
  assert.doesNotMatch(panel, /BASE_API_TOKEN|type="password"/);
});

test('unsupported mockup controls are absent while real trial, mode, inventory and load data remain scoped', () => {
  assert.ok(Object.hasOwn(DEFAULT_SETTINGS, 'testMode'));
  assert.ok(Object.hasOwn(DEFAULT_SETTINGS, 'dryRun'));
  assert.match(panel, /checked=\{draft\.testMode\}/);
  assert.match(panel, /checked=\{draft\.dryRun\}/);
  assert.match(panel, /catalog\?\.inventoryStatus\?\.inventoryId \?\? catalog\?\.baseInventoryId/);
  assert.match(panel, /Number\.isFinite\(catalog\.durationMs\)/);
  for (const unsupported of ['tracking automatico', 'email automatiche', 'corriere predefinito', 'aliquota IVA predefinita']) {
    assert.ok(!panel.toLowerCase().includes(unsupported), `${unsupported} is not exposed`);
  }
});
