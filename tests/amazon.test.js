import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getAmazonConfig, getAmazonEndpoint } from '../src/marketplaces/amazon/config.js';
import { getAmazonAccessToken, AMAZON_LWA_TOKEN_URL } from '../src/marketplaces/amazon/auth.js';
import { buildAmazonRequest } from '../src/marketplaces/amazon/client.js';
import { runAmazonDiagnostic } from '../src/checker.js';
import { redactToken } from '../src/logger.js';

const env = {
  AMAZON_REFRESH_TOKEN: 'fake-refresh-token',
  AMAZON_LWA_CLIENT_ID: 'fake-client-id',
  AMAZON_LWA_CLIENT_SECRET: 'fake-client-secret',
  AMAZON_ENV: 'sandbox',
  AMAZON_REGION: 'EU',
};

function successResponse(token = 'fake-access-token') {
  return { ok: true, json: async () => ({ access_token: token, expires_in: 3600 }) };
}

test('Amazon configuration validates secrets, environment, region and sandbox EU endpoint', () => {
  const config = getAmazonConfig(env);
  assert.equal(config.endpoint, 'https://sandbox.sellingpartnerapi-eu.amazon.com');
  assert.equal(getAmazonEndpoint({ environment: 'sandbox', region: 'EU' }), config.endpoint);
  for (const key of ['AMAZON_REFRESH_TOKEN', 'AMAZON_LWA_CLIENT_ID', 'AMAZON_LWA_CLIENT_SECRET']) {
    assert.throws(() => getAmazonConfig({ ...env, [key]: '' }), error =>
      error.message.includes(key) && !JSON.stringify(error).includes('fake-'));
  }
  assert.throws(() => getAmazonConfig({ ...env, AMAZON_ENV: 'production' }), /AMAZON_ENV/);
  assert.throws(() => getAmazonConfig({ ...env, AMAZON_REGION: 'NA' }), /AMAZON_REGION/);
});

test('Amazon LWA sends the documented form and returns a temporary token only in memory', async () => {
  let calls = 0;
  const result = await getAmazonAccessToken({ config: getAmazonConfig(env), fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, AMAZON_LWA_TOKEN_URL);
    assert.equal(options.method, 'POST');
    assert.match(options.headers['Content-Type'], /application\/x-www-form-urlencoded/);
    assert.equal(options.body.get('grant_type'), 'refresh_token');
    assert.equal(options.body.get('refresh_token'), env.AMAZON_REFRESH_TOKEN);
    assert.equal(options.body.get('client_id'), env.AMAZON_LWA_CLIENT_ID);
    assert.equal(options.body.get('client_secret'), env.AMAZON_LWA_CLIENT_SECRET);
    assert.ok(options.signal);
    return successResponse();
  } });
  assert.equal(calls, 1);
  assert.deepEqual(result, { accessToken: 'fake-access-token', expiresIn: 3600 });
  assert.equal(redactToken('fake-access-token'), '[TOKEN NASCOSTO]');
});

test('Amazon LWA handles HTTP 400, 401, 429 and 5xx without response-body secrets', async () => {
  for (const status of [400, 401, 429, 503]) {
    await assert.rejects(getAmazonAccessToken({ config: getAmazonConfig(env),
      fetchImpl: async () => ({ ok: false, status, text: async () => env.AMAZON_LWA_CLIENT_SECRET }) }),
    error => error.message.includes(`HTTP ${status}`) && !error.message.includes('fake-'));
  }
});

test('Amazon LWA network and timeout failures have safe messages', async () => {
  await assert.rejects(getAmazonAccessToken({ config: getAmazonConfig(env),
    fetchImpl: async () => { throw new Error(`network ${env.AMAZON_REFRESH_TOKEN}`); } }),
  error => /rete/.test(error.message) && !error.message.includes('fake-'));
  await assert.rejects(getAmazonAccessToken({ config: getAmazonConfig(env), timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })) }),
  /Timeout durante l’autenticazione Amazon/);
});

test('Amazon LWA rejects invalid JSON and missing access token', async () => {
  await assert.rejects(getAmazonAccessToken({ config: getAmazonConfig(env),
    fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }) }),
  /Risposta JSON non valida/);
  await assert.rejects(getAmazonAccessToken({ config: getAmazonConfig(env),
    fetchImpl: async () => successResponse('') }), /access_token assente/);
});

test('Amazon client builds a sandbox GET request with the LWA header without sending it', () => {
  const request = buildAmazonRequest('/example', 'fake-access-token', getAmazonConfig(env));
  assert.equal(request.url, 'https://sandbox.sellingpartnerapi-eu.amazon.com/example');
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.get('x-amz-access-token'), 'fake-access-token');
  assert.ok(request.headers.get('x-amz-date'));
  assert.ok(request.headers.get('user-agent'));
  assert.throws(() => buildAmazonRequest('//other-host/path', 'fake-access-token', getAmazonConfig(env)),
    /Percorso SP-API/);
  assert.throws(() => buildAmazonRequest('/\\other-host/path', 'fake-access-token', getAmazonConfig(env)),
    /Percorso SP-API/);
});

test('Amazon diagnostic distinguishes missing configuration, authentication failure and success without exposing tokens', async () => {
  const missing = await runAmazonDiagnostic({ env: { ...env, AMAZON_REFRESH_TOKEN: '' },
    fetchImpl: async () => { throw new Error('fetch must not run'); } });
  assert.equal(missing.configured, false);
  assert.equal(missing.authenticated, false);
  const failed = await runAmazonDiagnostic({ env,
    fetchImpl: async () => ({ ok: false, status: 401 }) });
  assert.equal(failed.configured, true);
  assert.equal(failed.authenticated, false);
  const good = await runAmazonDiagnostic({ env, fetchImpl: async () => successResponse() });
  assert.deepEqual(good, { ok: true, configured: true, authenticated: true,
    environment: 'sandbox', region: 'EU', endpoint: 'https://sandbox.sellingpartnerapi-eu.amazon.com' });
  for (const result of [missing, failed, good]) {
    assert.doesNotMatch(JSON.stringify(result), /fake-(refresh-token|client-id|client-secret|access-token)/);
  }
});

test('Amazon credentials are redacted from logs and Electron preload only exposes a specific diagnostic method', async () => {
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, env);
    const message = Object.values(env).slice(0, 3).join(' ') + ' fake-access-token';
    assert.doesNotMatch(redactToken(message), /fake-/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  assert.match(preload, /diagnoseAmazon:\s*\(\) => ipcRenderer\.invoke\("amazon:diagnose"\)/);
  assert.doesNotMatch(preload, /getAmazonAccessToken|AMAZON_REFRESH_TOKEN|AMAZON_LWA_CLIENT_SECRET/);
});
