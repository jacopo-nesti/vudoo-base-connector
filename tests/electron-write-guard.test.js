import test from 'node:test';
import assert from 'node:assert/strict';
import { createWriteGuard } from '../electron/writeGuard.js';

test('Electron write guard blocks a concurrent full or selected import and manufacturer sync', async () => {
  const guard = createWriteGuard();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const first = guard.run(() => pending);
  assert.equal(guard.isBusy(), true);
  for (const operation of ['full import', 'selected import', 'manufacturer sync']) {
    await assert.rejects(guard.run(() => operation), /già in corso/);
  }
  release('completed');
  assert.equal(await first, 'completed');
  assert.equal(guard.isBusy(), false);
  assert.equal(await guard.run(async () => 'next'), 'next');
});

test('Electron write guard releases the lock after an operation fails', async () => {
  const guard = createWriteGuard();
  await assert.rejects(guard.run(async () => { throw new Error('failure'); }), /failure/);
  assert.equal(guard.isBusy(), false);
});
