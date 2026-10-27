import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_COMMANDS, filterCommands, nextCommandIndex } from '../renderer/src/commandPalette.js';
import { NOTIFICATION_KEY, OPERATION_EVENTS, normalizeNotifications, readNotifications, writeNotifications, addNotification, clearNoncritical } from '../renderer/src/operationNotifications.js';

test('command palette exposes only safe navigation commands and filters by Italian labels', () => {
  assert.deepEqual(SAFE_COMMANDS.map(item => item.id), ['search', 'base-catalog', 'system-problems', 'base-overview', 'base-operations', 'base-categories', 'base-diagnostics', 'system-settings', 'catalog']);
  assert.deepEqual(filterCommands('ETSY').map(item => item.id), []);
  assert.equal(filterCommands('pubblica').length, 0);
  assert.equal(filterCommands('ean')[0].id, 'search');
});
test('command keyboard selection wraps and handles no results', () => {
  assert.equal(nextCommandIndex(0, 'ArrowUp', 7), 6);
  assert.equal(nextCommandIndex(6, 'ArrowDown', 7), 0);
  assert.equal(nextCommandIndex(0, 'ArrowDown', 0), 0);
});
test('notification persistence is bounded and strips all untrusted payload fields', () => {
  const map = new Map(); const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  let items = [];
  for (let i = 1; i <= 80; i++) items = addNotification(items, 'catalogLoaded', i);
  items[0].secret = 'must-not-persist'; items[0].description = 'access token';
  assert.equal(writeNotifications(storage, items), true);
  assert.equal(readNotifications(storage).length, 60);
  assert.equal(map.get(NOTIFICATION_KEY).includes('must-not-persist'), false);
  assert.equal(map.get(NOTIFICATION_KEY).includes('access token'), false);
  assert.deepEqual(addNotification(items, 'unknown'), items);
});
test('invalid history and unavailable storage degrade safely; clear preserves errors', () => {
  assert.deepEqual(normalizeNotifications({ schemaVersion: 2, items: [] }), []);
  assert.deepEqual(normalizeNotifications({ schemaVersion: 1, items: [{ id: 'a', event: 'rawSecret', timestamp: 2 }] }), []);
  assert.deepEqual(readNotifications({ getItem() { throw Error('denied'); } }), []);
  assert.equal(writeNotifications({ setItem() { throw Error('full'); } }, []), false);
  const items = addNotification(addNotification([], 'catalogLoaded', 1), 'catalogFailed', 2);
  assert.equal(clearNoncritical(items).length, 1);
  assert.equal(OPERATION_EVENTS[clearNoncritical(items)[0].event].type, 'error');
});
test('read state survives reopening notification history', () => {
  let saved; const storage = { getItem: () => saved, setItem: (_, value) => { saved = value; } };
  writeNotifications(storage, addNotification([], 'settingsSaved', 1).map(item => ({ ...item, read: true })));
  assert.equal(readNotifications(storage)[0].read, true);
});
