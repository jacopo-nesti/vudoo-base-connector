import test from 'node:test';
import assert from 'node:assert/strict';
import { refreshBaseToken, setDryRunMode } from '../src/config.js';
import { callBase, getBaseConnectionState } from '../src/baseApi.js';

test('Base client: token inizializzato prima di Categorie, READ riuscita aggiorna stato condiviso', async () => {
  const original = {
    token: process.env.BASE_API_TOKEN, dryRun: process.env.DRY_RUN,
    attempts: process.env.BASE_API_READ_ATTEMPTS, fetch: globalThis.fetch,
  };
  try {
    process.env.BASE_API_TOKEN = 'offline-mock-token';
    process.env.BASE_API_READ_ATTEMPTS = '1';
    refreshBaseToken(); setDryRunMode(false);
    globalThis.fetch = async () => ({ ok: true, headers: new Headers(),
      json: async () => ({ status: 'SUCCESS', categories: [] }) });
    assert.equal(getBaseConnectionState().configured, true);
    assert.deepEqual((await callBase('getInventoryCategories')).categories, []);
    assert.equal(getBaseConnectionState().verification, 'connected');

    globalThis.fetch = async () => ({ ok: true, headers: new Headers(),
      json: async () => ({ status: 'ERROR', error_code: 'ERROR_INVALID_CATEGORY', error_message: 'bad category' }) });
    await assert.rejects(callBase('getInventoryCategories'), /ERROR_INVALID_CATEGORY/);
    assert.equal(getBaseConnectionState().verification, 'connected');

    globalThis.fetch = async () => { throw new Error('offline'); };
    await assert.rejects(callBase('getInventoryCategories'), /rete\/timeout/);
    assert.equal(getBaseConnectionState().verification, 'failed');
  } finally {
    globalThis.fetch = original.fetch;
    if (original.token === undefined) delete process.env.BASE_API_TOKEN;
    else process.env.BASE_API_TOKEN = original.token;
    if (original.attempts === undefined) delete process.env.BASE_API_READ_ATTEMPTS;
    else process.env.BASE_API_READ_ATTEMPTS = original.attempts;
    refreshBaseToken();
    setDryRunMode(original.dryRun === 'true');
    if (original.dryRun === undefined) delete process.env.DRY_RUN;
  }
});
