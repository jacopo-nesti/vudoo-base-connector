import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const SETTINGS_FILE_NAME = 'settings.json';

export const DEFAULT_SETTINGS = Object.freeze({
  testMode: true,
  dryRun: true,
  unmappedCategoryPolicy: 'block',
  vudooResultsLimit: 3000,
  vudooTimeoutMs: 90000,
  baseApiRequestsPerMinute: 95,
  baseApiReadAttempts: 3,
  baseApiRetryDelayMs: 1000,
  baseApiRateLimitDelayMs: 60000,
});

const environmentKeys = Object.freeze({
  testMode: 'TEST_MODE',
  dryRun: 'DRY_RUN',
  unmappedCategoryPolicy: 'UNMAPPED_CATEGORY_POLICY',
  vudooResultsLimit: 'VUDOO_RESULTS_LIMIT',
  vudooTimeoutMs: 'VUDOO_TIMEOUT_MS',
  baseApiRequestsPerMinute: 'BASE_API_REQUESTS_PER_MINUTE',
  baseApiReadAttempts: 'BASE_API_READ_ATTEMPTS',
  baseApiRetryDelayMs: 'BASE_API_RETRY_DELAY_MS',
  baseApiRateLimitDelayMs: 'BASE_API_RATE_LIMIT_DELAY_MS',
});

const numericLimits = Object.freeze({
  vudooResultsLimit: [1, Number.MAX_SAFE_INTEGER],
  vudooTimeoutMs: [1, Number.MAX_SAFE_INTEGER],
  baseApiRequestsPerMinute: [1, Number.MAX_SAFE_INTEGER],
  baseApiReadAttempts: [1, 10],
  baseApiRetryDelayMs: [1, 3600000],
  baseApiRateLimitDelayMs: [1, 3600000],
});

function settingsError(code, field) {
  return Object.assign(new Error(code), { code, field });
}

function normalizeValue(key, value) {
  if (key === 'testMode' || key === 'dryRun') {
    if (typeof value !== 'boolean') throw settingsError('invalidValue', key);
    return value;
  }
  if (key === 'unmappedCategoryPolicy') {
    if (typeof value !== 'string' || !['block', 'skip'].includes(value.trim().toLowerCase())) {
      throw settingsError('invalidValue', key);
    }
    return value.trim().toLowerCase();
  }
  const [minimum, maximum] = numericLimits[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw settingsError('invalidValue', key);
  }
  return value;
}

export function validateSettings(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw settingsError('invalidSettings');
  }
  const settings = {};
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(environmentKeys, key)) throw settingsError('unsupportedSetting', key);
    settings[key] = normalizeValue(key, input[key]);
  }
  return settings;
}

export function readEnvironmentSettings(environment = process.env) {
  const settings = {};
  const warnings = [];
  for (const [key, envKey] of Object.entries(environmentKeys)) {
    const raw = environment[envKey];
    if (raw == null || raw === '') {
      settings[key] = DEFAULT_SETTINGS[key];
      continue;
    }
    try {
      let value;
      if (key === 'testMode' || key === 'dryRun') {
        if (raw !== 'true' && raw !== 'false') throw settingsError('invalidValue', key);
        value = raw === 'true';
      } else if (key === 'unmappedCategoryPolicy') {
        value = raw;
      } else {
        if (!/^\d+$/.test(raw.trim())) throw settingsError('invalidValue', key);
        value = Number(raw.trim());
      }
      settings[key] = normalizeValue(key, value);
    } catch {
      settings[key] = DEFAULT_SETTINGS[key];
      warnings.push(envKey);
    }
  }
  return { settings, warnings };
}

export function getEffectiveSettings(baseSettings, overrides = {}) {
  return { ...validateSettings(baseSettings), ...validateSettings(overrides) };
}

export function applySettingsToEnvironment(settings, environment = process.env) {
  const validated = validateSettings(settings);
  for (const [key, value] of Object.entries(validated)) {
    environment[environmentKeys[key]] = String(value);
  }
}

export async function loadSettings(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { settings: {}, warning: null };
    return { settings: {}, warning: 'readError' };
  }
  try {
    return { settings: validateSettings(JSON.parse(content)), warning: null };
  } catch {
    return { settings: {}, warning: 'invalidFile' };
  }
}

export async function saveSettings(filePath, input) {
  const settings = validateSettings(input);
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  return settings;
}

export async function resetSettings(filePath) {
  await unlink(filePath).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
}
