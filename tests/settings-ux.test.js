import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { settingHelpContent } from '../renderer/src/settingHelpContent.js';
import { parseNumericSettings } from '../renderer/src/settingsValidation.js';

const fields = [
  { key: 'vudooResultsLimit', label: 'Limite risultati Vudoo', min: 1 },
  { key: 'baseApiReadAttempts', label: 'Tentativi di lettura Base.com', min: 1, max: 10 },
];

test('settings help explains the real controls without exposing credentials', () => {
  for (const key of ['vudooResultsLimit', 'vudooTimeoutMs', 'dryRun', 'testMode',
    'unmappedCategoryPolicy', 'baseApiRequestsPerMinute', 'baseApiReadAttempts',
    'baseApiRetryDelayMs', 'baseApiRateLimitDelayMs']) {
    assert.ok(settingHelpContent[key]?.length > 30, key);
  }
  assert.match(settingHelpContent.vudooResultsLimit, /catalogo Vudoo/);
  assert.match(settingHelpContent.dryRun, /Reale.*Base\.com.*Simulazione/);
  assert.doesNotMatch(JSON.stringify(settingHelpContent), /token|secret|password/i);
});

test('settings numeric validation rejects invalid values without changing backend bounds', () => {
  for (const invalid of ['-1', 'abc', '', '0', '1.5', '9007199254740992']) {
    assert.match(parseNumericSettings({ vudooResultsLimit: invalid, baseApiReadAttempts: 3 }, fields).error, /Limite risultati Vudoo/);
  }
  assert.match(parseNumericSettings({ vudooResultsLimit: 2, baseApiReadAttempts: 11 }, fields).error, /Tentativi di lettura Base.com/);
  assert.deepEqual(parseNumericSettings({ vudooResultsLimit: '5000', baseApiReadAttempts: '10', dryRun: true }, fields),
    { settings: { vudooResultsLimit: 5000, baseApiReadAttempts: 10, dryRun: true } });
});

test('settings help is keyboard accessible and save still uses the existing settings API', () => {
  const help = readFileSync(new URL('../renderer/src/components/SettingHelp.jsx', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
  assert.match(help, /aria-label=/);
  assert.match(help, /aria-describedby=/);
  assert.match(help, /role="tooltip"/);
  assert.match(help, /onMouseEnter=/);
  assert.match(help, /onFocus=/);
  assert.match(help, /onBlur=/);
  assert.match(help, /event\.key === 'Escape'/);
  assert.match(panel, /saveSettings\(settings\)/);
  assert.match(panel, /onModeChanged\?\.\(response\.activeSettings\.dryRun\)/);
  assert.match(panel, /Modifiche non salvate/);
});
