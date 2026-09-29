import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_SETTINGS, applySettingsToEnvironment, getEffectiveSettings,
  loadSettings, readEnvironmentSettings, resetSettings, saveSettings, validateSettings,
} from '../electron/settingsManager.js';

async function withSettingsFile(action) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-electron-settings-'));
  try {
    await action(path.join(directory, 'settings.json'), directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('Electron settings: a missing file uses backend defaults without creating a file', async () => {
  await withSettingsFile(async (filePath, directory) => {
    const loaded = await loadSettings(filePath);
    assert.deepEqual(loaded, { settings: {}, warning: null });
    assert.deepEqual(getEffectiveSettings(DEFAULT_SETTINGS, loaded.settings), DEFAULT_SETTINGS);
    assert.deepEqual(await readdir(directory), []);
  });
});

test('Electron settings: typed booleans and numbers survive save, reload, and atomic replacement', async () => {
  await withSettingsFile(async (filePath, directory) => {
    const first = { dryRun: false, testMode: false, baseApiRequestsPerMinute: 95 };
    await saveSettings(filePath, first);
    assert.deepEqual((await loadSettings(filePath)).settings, first);
    await saveSettings(filePath, { ...first, baseApiRequestsPerMinute: 98 });
    const parsed = JSON.parse(await readFile(filePath, 'utf8'));
    assert.deepEqual(parsed, { ...first, baseApiRequestsPerMinute: 98 });
    assert.equal(typeof parsed.dryRun, 'boolean');
    assert.equal(typeof parsed.baseApiRequestsPerMinute, 'number');
    assert.deepEqual(await readdir(directory), ['settings.json']);
  });
});

test('Electron settings: only supported keys and types can be persisted', async () => {
  await withSettingsFile(async filePath => {
    for (const input of [
      { dryRun: true, maliciousProperty: 'value' },
      { BASE_API_TOKEN: 'do-not-save' },
      { dryRun: 'false' },
      { baseApiRequestsPerMinute: 0 },
      { baseApiReadAttempts: 11 },
      { baseApiRetryDelayMs: 3600001 },
      { unmappedCategoryPolicy: 'other' },
    ]) {
      await assert.rejects(saveSettings(filePath, input));
    }
    assert.deepEqual((await loadSettings(filePath)).settings, {});
    assert.equal((await readFile(filePath, 'utf8').catch(error => error.code)), 'ENOENT');
  });
});

test('Electron settings: backend validation limits and policy normalization are retained', () => {
  assert.deepEqual(validateSettings({
    baseApiReadAttempts: 1,
    baseApiRetryDelayMs: 3600000,
    baseApiRateLimitDelayMs: 1,
    unmappedCategoryPolicy: ' SKIP ',
  }), {
    baseApiReadAttempts: 1,
    baseApiRetryDelayMs: 3600000,
    baseApiRateLimitDelayMs: 1,
    unmappedCategoryPolicy: 'skip',
  });
  for (const key of ['vudooResultsLimit', 'vudooTimeoutMs', 'baseApiRequestsPerMinute']) {
    assert.throws(() => validateSettings({ [key]: -1 }), /invalidValue/);
  }
});

test('Electron settings: all supported fields map to their core environment keys', () => {
  assert.deepEqual(readEnvironmentSettings({}).settings, DEFAULT_SETTINGS);
  const environment = { BASE_API_TOKEN: 'test-only-secret' };
  applySettingsToEnvironment({
    testMode: false,
    dryRun: true,
    unmappedCategoryPolicy: 'skip',
    vudooResultsLimit: 5000,
    vudooTimeoutMs: 120000,
    baseApiRequestsPerMinute: 98,
    baseApiReadAttempts: 10,
    baseApiRetryDelayMs: 2500,
    baseApiRateLimitDelayMs: 45000,
  }, environment);
  assert.deepEqual(environment, {
    BASE_API_TOKEN: 'test-only-secret',
    TEST_MODE: 'false',
    DRY_RUN: 'true',
    UNMAPPED_CATEGORY_POLICY: 'skip',
    VUDOO_RESULTS_LIMIT: '5000',
    VUDOO_TIMEOUT_MS: '120000',
    BASE_API_REQUESTS_PER_MINUTE: '98',
    BASE_API_READ_ATTEMPTS: '10',
    BASE_API_RETRY_DELAY_MS: '2500',
    BASE_API_RATE_LIMIT_DELAY_MS: '45000',
  });
});

test('Electron settings: invalid local environment values use explicit defaults with warnings', () => {
  const result = readEnvironmentSettings({
    VUDOO_RESULTS_LIMIT: 'bad', BASE_API_READ_ATTEMPTS: '11', DRY_RUN: 'bad',
  });
  assert.equal(result.settings.vudooResultsLimit, 3000);
  assert.equal(result.settings.baseApiReadAttempts, 3);
  assert.equal(result.settings.dryRun, true);
  assert.deepEqual(result.warnings, ['DRY_RUN', 'VUDOO_RESULTS_LIMIT', 'BASE_API_READ_ATTEMPTS']);
});

test('Electron settings: user settings override .env and apply before core config is evaluated', async () => {
  const environment = {
    TEST_MODE: 'false', DRY_RUN: 'true', BASE_API_REQUESTS_PER_MINUTE: '95',
    BASE_API_TOKEN: 'test-only-secret',
  };
  const base = readEnvironmentSettings(environment);
  assert.equal(base.settings.baseApiRequestsPerMinute, 95);
  const effective = getEffectiveSettings(base.settings, {
    dryRun: false, baseApiRequestsPerMinute: 98,
  });
  applySettingsToEnvironment(effective, environment);
  assert.equal(environment.DRY_RUN, 'false');
  assert.equal(environment.BASE_API_REQUESTS_PER_MINUTE, '98');
  assert.equal(environment.BASE_API_TOKEN, 'test-only-secret');
  assert.equal('BASE_API_TOKEN' in effective, false);
  assert.throws(() => applySettingsToEnvironment({ BASE_API_TOKEN: 'other-secret' }, environment),
    /unsupportedSetting/);
  assert.equal(environment.BASE_API_TOKEN, 'test-only-secret');

  const source = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, {
    context: vm.createContext({ process: { env: environment } }),
  });
  await module.link(() => { throw new Error('Unexpected core dependency'); });
  await module.evaluate();
  assert.equal(module.namespace.dryRun, 'false');
  assert.equal(module.namespace.testMode, 'false');
  assert.equal(module.namespace.getBaseApiRequestsPerMinute(), 98);
});

test('Electron settings: reset removes overrides and restores original .env-derived values', async () => {
  await withSettingsFile(async filePath => {
    const base = readEnvironmentSettings({ BASE_API_REQUESTS_PER_MINUTE: '95' }).settings;
    await saveSettings(filePath, { baseApiRequestsPerMinute: 98 });
    assert.equal(getEffectiveSettings(base, (await loadSettings(filePath)).settings).baseApiRequestsPerMinute, 98);
    await resetSettings(filePath);
    assert.equal(getEffectiveSettings(base, (await loadSettings(filePath)).settings).baseApiRequestsPerMinute, 95);
    await resetSettings(filePath);
  });
});

test('Electron settings: corrupt, invalid, and unknown file data fall back without crashing', async () => {
  await withSettingsFile(async filePath => {
    for (const contents of ['{broken', '{"dryRun":"false"}', '{"BASE_API_TOKEN":"secret"}']) {
      await writeFile(filePath, contents);
      assert.deepEqual(await loadSettings(filePath), { settings: {}, warning: 'invalidFile' });
    }
    await writeFile(filePath, '{"dryRun":true}');
    assert.deepEqual(await loadSettings(filePath), { settings: { dryRun: true }, warning: null });
  });
});

test('Electron settings: preload exposes only specific settings channels', async () => {
  const invocations = [];
  let exposed;
  vm.runInNewContext(readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'), {
    require: specifier => {
      assert.equal(specifier, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, api) => {
          assert.equal(name, 'electronAPI');
          exposed = api;
        } },
        ipcRenderer: { invoke: (...args) => { invocations.push(args); return Promise.resolve({ ok: true }); } },
      };
    },
  });
  await exposed.getSettings();
  await exposed.saveSettings({ dryRun: true });
  await exposed.resetSettings();
  await exposed.restartApp();
  assert.deepEqual(invocations, [
    ['settings:get'],
    ['settings:save', { dryRun: true }],
    ['settings:reset'],
    ['app:restart'],
  ]);
  assert.equal('ipcRenderer' in exposed, false);
  assert.equal('invoke' in exposed, false);
  assert.equal('readFile' in exposed, false);
});

test('Electron settings: startup applies saved values before dynamic core imports and renderer has no filesystem access', () => {
  const main = readFileSync(new URL('../electron/main.js', import.meta.url), 'utf8');
  assert.ok(main.indexOf('loadEnvFile(') < main.indexOf('await loadSettings('));
  assert.ok(main.indexOf('await loadSettings(') < main.indexOf('applySettingsToEnvironment(savedSettings)'));
  assert.ok(main.indexOf('applySettingsToEnvironment(savedSettings)') < main.indexOf('await import("../src/checker.js")'));
  const renderer = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(renderer, /node:fs|node:path|process\.env|localStorage|ipcRenderer/);
});
