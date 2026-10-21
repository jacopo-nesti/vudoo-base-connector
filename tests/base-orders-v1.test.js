import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openOrderStore } from '../electron/orderStore.js';
import { normalizeOrder } from '../src/orders/orderModel.js';
import { reviewOrder } from '../src/orders/orderReview.js';
import { syncOrders } from '../src/orders/orderSync.js';

function syntheticOrder(id, overrides = {}) {
  return {
    order_id: id, external_order_id: `TEST-${id}`, date_add: 1700000000 + id,
    order_source: 'etsy', order_source_id: 4, order_status_id: 7, confirmed: true,
    delivery_fullname: 'Test Recipient', delivery_address: 'Example Street 1',
    delivery_postcode: '1000', delivery_city: 'Brussels', delivery_country: 'Belgium',
    delivery_country_code: 'BE', invoice_fullname: 'Test Billing', email: 'buyer@example.invalid',
    currency: 'EUR', payment_done: 24, delivery_price: 2,
    products: [{ order_product_id: id * 10, product_id: 'P-1', name: 'Synthetic item', sku: 'TEST-SKU',
      ean: '0000000000000', quantity: 1, price_brutto: 22, tax_rate: 22 }],
    ...overrides,
  };
}
function model(raw) {
  return normalizeOrder(raw, raw.order_id, [{ id: 7, name: 'Sent' }],
    { etsy: { 4: 'Omniasenses (Etsy)' } });
}
test('Base mapping resolves status, source, customer fallback, tax and distinct billing', () => {
  const order = model(syntheticOrder(1));
  assert.equal(order.identity.order_id, 1);
  assert.equal(order.statusName, 'Sent');
  assert.equal(order.sourceName, 'Omniasenses (Etsy)');
  assert.equal(order.customer.displayName, 'Test Recipient');
  assert.equal(order.billing.invoice_fullname, 'Test Billing');
  assert.equal(order.products[0].tax_rate, 22);
  assert.equal(order.quality.status, 'Completo');
  const fallback = model(syntheticOrder(2, { delivery_fullname: '', invoice_fullname: 'Billing fallback' }));
  assert.equal(fallback.customer.displayName, 'Billing fallback');
  assert.equal(fallback.shipping.delivery_fullname, null);
});

test('quality identifies missing shipping, country mismatch, missing/zero/nonstandard VAT and payment uncertainty', () => {
  const order = model(syntheticOrder(3, {
    delivery_postcode: '', delivery_country_code: 'PL', email: '', payment_done: 0,
    products: [
      { name: 'One', sku: 'ONE', price_brutto: 10, quantity: 1, tax_rate: 0 },
      { name: 'Two', sku: 'TWO', price_brutto: 10, quantity: 1 },
      { name: 'Three', sku: 'THREE', price_brutto: 10, quantity: 1, tax_rate: 10 },
    ],
  }));
  const issues = order.quality.issues.join(' | ');
  for (const term of ['CAP', 'Paese e codice Paese incoerenti', 'Email', '0%', 'IVA assente', '10%', 'Pagamento da verificare']) {
    assert.match(issues, new RegExp(term));
  }
  assert.equal(order.quality.status, 'Da verificare');
  const differentBillingCountry = model(syntheticOrder(4, { invoice_country: 'Poland', invoice_country_code: 'PL' }));
  assert.equal(differentBillingCountry.quality.status, 'Completo');
  assert.equal(reviewOrder(differentBillingCountry).issues.length, 0);
});

test('SQLite UPSERT updates one order and replaces items without duplicates; search and sync state survive reopen', () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'vudoo-orders-v1-'));
  const file = path.join(folder, 'orders.sqlite');
  let store = openOrderStore(file);
  try {
    assert.deepEqual(store.upsertOrders([model(syntheticOrder(10))]), { created: 1, updated: 0 });
    const changedRaw = syntheticOrder(10, { delivery_city: 'Ghent', products: [
      { name: 'Changed', sku: 'UPDATED', ean: '123', quantity: 2, price_brutto: 4, tax_rate: 0 },
    ] });
    const changed = model(changedRaw);
    assert.deepEqual(store.upsertOrders([changed]), { created: 0, updated: 1 });
    store.upsertOrders([normalizeOrder(changedRaw, 10)]);
    store.markAttempt('2026-10-19T10:00:00.000Z');
    store.markSuccess('2026-10-19T10:01:00.000Z');
    store.close(); store = openOrderStore(file);
    assert.equal(store.list().total, 1);
    assert.equal(store.get(10).shipping.delivery_city, 'Ghent');
    assert.equal(store.get(10).products.length, 1);
    assert.equal(store.get(10).products[0].sku, 'UPDATED');
    assert.equal(store.get(10).statusName, 'Sent');
    assert.equal(store.get(10).sourceName, 'Omniasenses (Etsy)');
    assert.equal(store.list({ query: 'UPDATED' }).total, 1);
    assert.equal(store.list({ query: '123' }).total, 1);
    assert.equal(store.list({ quality: 'Da verificare' }).total, 1);
    assert.equal(store.syncState().lastSuccessAt, '2026-10-19T10:01:00.000Z');
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('manual sync paginates 100 orders, UPSERTs and records success; a second run updates existing rows', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'vudoo-orders-v1-'));
  const store = openOrderStore(path.join(folder, 'orders.sqlite'));
  const requested = [];
  const call = async (method, parameters) => {
    if (method === 'getOrderStatusList') return { statuses: [{ id: 7, name: 'Sent' }] };
    if (method === 'getOrderSources') return { sources: { etsy: { 4: 'Omniasenses (Etsy)' } } };
    assert.equal(method, 'getOrders');
    requested.push(parameters);
    return { orders: parameters.id_from === 1
      ? Array.from({ length: 100 }, (_, index) => syntheticOrder(index + 1))
      : parameters.id_from === 101 ? [syntheticOrder(101)] : [] };
  };
  try {
    const first = await syncOrders(store, { call, hasToken: () => true });
    assert.deepEqual({ created: first.created, updated: first.updated, pages: first.pages },
      { created: 101, updated: 0, pages: 2 });
    assert.equal(store.list().total, 101);
    assert.equal(store.list({ limit: 50, offset: 50 }).rows.length, 50);
    assert.deepEqual(requested.map(item => item.id_from), [1, 101]);
    assert.equal(requested[0].get_unconfirmed_orders, true);
    assert.equal(requested[0].include_discounts_data, true);
    const second = await syncOrders(store, { call, hasToken: () => true });
    assert.equal(second.created, 0);
    assert.equal(second.updated, 101);
    assert.equal(store.list().total, 101);
    assert.ok(store.syncState().lastSuccessAt);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('sync failure retains last successful timestamp and does not duplicate orders', async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'vudoo-orders-v1-'));
  const store = openOrderStore(path.join(folder, 'orders.sqlite'));
  try {
    store.upsertOrders([model(syntheticOrder(1))]);
    store.markSuccess('2026-10-19T10:00:00.000Z');
    await assert.rejects(syncOrders(store, { hasToken: () => true, call: async method => {
      if (method === 'getOrders') throw new Error('synthetic network failure');
      return {};
    } }), /synthetic network failure/);
    assert.equal(store.list().total, 1);
    assert.equal(store.syncState().lastSuccessAt, '2026-10-19T10:00:00.000Z');
    assert.equal(store.syncState().lastErrorCode, 'network');
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});
