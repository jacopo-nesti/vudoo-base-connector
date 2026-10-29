import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNumericSettings } from '../renderer/src/settingsValidation.js';

const fields = [
  { key: 'vudooResultsLimit', label: 'Limite risultati Vudoo', min: 1 },
  { key: 'baseApiReadAttempts', label: 'Tentativi di lettura Base.com', min: 1, max: 10 },
];

test('settings help describes current controls without exposing credentials', () => {
  const panel = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
  const help = panel.match(/const fieldHelp = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(help, 'fieldHelp corrente presente');
  for (const key of ['vudooResultsLimit', 'vudooTimeoutMs',
    'baseApiRequestsPerMinute', 'baseApiReadAttempts',
    'baseApiRetryDelayMs', 'baseApiRateLimitDelayMs']) {
    assert.match(panel, new RegExp(`${key}: '.{30,}`), key);
  }
  assert.match(help, /vudooResultsLimit: '.*catalogo Vudoo/);
  assert.match(help, /baseApiReadAttempts: '.*lettura Base\.com/);
  assert.match(panel, /<SettingHelp label=\{field\.label\}>\{fieldHelp\[field\.key\]\}<\/SettingHelp>/);
  assert.match(panel, /<SettingHelp label="Limite di prova">/);
  assert.match(panel, /<SettingHelp label="Modalità operativa">/);
  assert.doesNotMatch(help, /BASE_API_TOKEN|refreshToken|sharedSecret/);
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
  assert.match(panel, /saveSettings\(parsed\.settings\)/);
  assert.match(panel, /onModeChanged\?\.\(response\.activeSettings\.dryRun, response\.activeSettings\.testMode\)/);
  assert.match(panel, /Modifiche non salvate/);
});
