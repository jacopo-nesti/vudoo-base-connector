import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOrder, parseOrderId } from '../src/orders/orderModel.js';
import { readBaseOrder, classifyOrderError } from '../src/orders/baseOrderReader.js';

const rawOrder = {
  order_id: 1234, external_order_id: 'ET-42', order_source: 'etsy', order_status_id: 7,
  confirmed: false, delivery_fullname: 'Example Buyer', delivery_address: 'Example Street 1',
  delivery_postcode: '1000', delivery_city: 'Brussels', delivery_country: 'Poland',
  delivery_country_code: 'PL', invoice_fullname: 'Example Billing', invoice_nip: 'VAT123',
  invoice_country: 'Belgium', invoice_country_code: 'BE',
  products: [{ name: 'Example', sku: 'SKU-1', ean: '', quantity: 2, price_brutto: 5 }],
};

test('validates a single positive safe order ID', () => {
  assert.equal(parseOrderId('1234'), 1234);
  for (const bad of ['0', '-1', '1x', '1.2', '9007199254740992', null, {}]) assert.equal(parseOrderId(bad), null);
});

test('getOrders requests exactly one ID including unconfirmed orders, then resolves status', async () => {
  const calls = [];
  const order = await readBaseOrder('1234', { hasToken: () => true, call: async (method, parameters) => {
    calls.push([method, parameters]);
    return method === 'getOrders' ? { orders: [rawOrder] } : { statuses: [{ id: 7, name: 'Processing' }] };
  } });
  assert.deepEqual(calls, [['getOrders', { order_id: 1234, get_unconfirmed_orders: true }], ['getOrderStatusList', {}]]);
  assert.equal(order.statusName, 'Processing');
  assert.equal(order.identity.confirmed, false);
  assert.equal(order.quality.unconfirmed, true);
  assert.equal(order.billing.invoice_fullname, 'Example Billing');
  assert.equal(order.billing.invoice_nip, 'VAT123');
  assert.equal(order.billing.invoice_address, null);
  assert.equal(order.shipping.delivery_country, 'Poland');
  assert.equal(order.shipping.delivery_country_code, 'PL');
  assert.equal(order.quality.reviewWithEtsy, true);
});

test('incomplete and complete shipping are distinguished without correcting the country', () => {
  const incomplete = normalizeOrder({ ...rawOrder, delivery_postcode: '', delivery_city: null }, 1234);
  assert.deepEqual(incomplete.quality.missingShipping, ['delivery_postcode', 'delivery_city']);
  assert.deepEqual(normalizeOrder(rawOrder, 1234).quality.missingShipping, []);
  assert.equal(incomplete.shipping.delivery_country, 'Poland');
});

test('invalid ID, absent token, no order and malformed response do not trigger unrelated calls', async () => {
  const calls = [];
  const call = async method => { calls.push(method); return { orders: [] }; };
  await assert.rejects(readBaseOrder('bad', { hasToken: () => true, call }), { code: 'invalidId' });
  await assert.rejects(readBaseOrder('1234', { hasToken: () => false, call }), { code: 'missingToken' });
  assert.deepEqual(calls, []);
  await assert.rejects(readBaseOrder('1234', { hasToken: () => true, call }), { code: 'notFound' });
  assert.deepEqual(calls, ['getOrders']);
  await assert.rejects(readBaseOrder('1234', { hasToken: () => true, call: async () => ({ orders: [{ order_id: 999 }] }) }), { code: 'invalidResponse' });
});

test('status lookup failure preserves the order and errors are reduced to safe codes', async () => {
  const order = await readBaseOrder('1234', { hasToken: () => true, call: async method => {
    if (method === 'getOrders') return { orders: [rawOrder] };
    throw new Error('Do not show personal response data');
  } });
  assert.equal(order.statusName, null);
  assert.equal(order.identity.order_status_id, 7);
  assert.equal(classifyOrderError(new Error('getOrders: HTTP 401 secret')), 'authentication');
  assert.equal(classifyOrderError(new Error('getOrders: risposta JSON non leggibile')), 'invalidResponse');
  assert.equal(classifyOrderError(new Error('private address')), 'apiError');
});

test('only the two order methods join the existing read allowlist', async () => {
  const { setDryRunMode } = await import('../src/config.js');
  const { callBase } = await import('../src/baseApi.js');
  const oldFetch = globalThis.fetch;
  const observed = [];
  globalThis.fetch = async (_url, options) => {
    const method = new URLSearchParams(options.body).get('method');
    observed.push(method);
    return { ok: true, json: async () => ({ status: 'SUCCESS', orders: [], statuses: [], inventories: [] }) };
  };
  setDryRunMode(true);
  try {
    await callBase('getOrders', { order_id: 1234, get_unconfirmed_orders: true });
    await callBase('getOrderStatusList');
    await callBase('getInventories');
    await assert.rejects(callBase('addOrder', {}), /DRY_RUN: scrittura addOrder bloccata/);
    await assert.rejects(callBase('addInventoryProduct', {}), /DRY_RUN: scrittura addInventoryProduct bloccata/);
    assert.deepEqual(observed, ['getOrders', 'getOrderStatusList', 'getInventories']);
  } finally { globalThis.fetch = oldFetch; }
});
