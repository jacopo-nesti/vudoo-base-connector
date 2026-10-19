import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog } from '../src/converter.js';
import { prepareSelectedVudooCatalog, prepareFullVudooCatalog } from '../src/vudooImport.js';
import { getBaseInventory } from '../src/baseApi.js';
import { inventoryId as configuredInventoryId, refreshBaseToken } from '../src/config.js';
import { runPreflightCheck } from '../src/preflight.js';
import { buildBasePayload } from '../src/products.js';
import { catalogXml, itemXml } from './fixtures/vudoo.js';

test('Inventory routing A/B e fallback globale restano distinti fino al payload', async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.BASE_API_TOKEN;
  process.env.BASE_API_TOKEN = 'offline-mock-token';
  refreshBaseToken();
  const globalId = configuredInventoryId ?? 1;
  const inventories = [
    { inventory_id: globalId, name: 'Configured', is_default: true, price_groups: [21], default_price_group: 21, warehouses: ['bl_9'] },
    { inventory_id: 200, name: 'Produttore A', price_groups: [21], default_price_group: 21, warehouses: ['bl_9'] },
    { inventory_id: 300, name: 'Produttore B', price_groups: [21], default_price_group: 21, warehouses: ['bl_9'] },
  ];
  globalThis.fetch = async (_url, options) => {
    const body = new URLSearchParams(options.body);
    const method = body.get('method');
    const data = method === 'getInventories' ? { inventories }
      : method === 'getInventoryPriceGroups' ? { price_groups: [{ price_group_id: 21, name: 'EUR', currency: 'EUR' }] }
        : method === 'getInventoryWarehouses' ? { warehouses: [{ warehouse_type: 'bl', warehouse_id: 9, name: 'Main' }] }
          : null;
    assert.ok(data, `Metodo inatteso: ${method}`);
    return { ok: true, headers: new Headers(), json: async () => ({ status: 'SUCCESS', ...data }) };
  };
  try {
    const parsed = parseCatalog(catalogXml(itemXml));
    const id = parsed.products[0].id;
    const prepared = preferred => {
      const catalog = { ...parsed, baseInventoryId: preferred };
      return prepareSelectedVudooCatalog(catalog, [id]);
    };
    assert.equal(prepared(200).baseInventoryId, 200);
    assert.equal(prepareFullVudooCatalog({ ...parsed, baseInventoryId: 300 }).baseInventoryId, 300);
    for (const [preferred, expected] of [[200, 200], [300, 300], [null, globalId]]) {
      const selected = await getBaseInventory(preferred);
      assert.equal(String(selected.inventory_id), String(expected));
      const payload = buildBasePayload({ id, sku: id, title: 'Test', price: 10 },
        { inventory: selected, priceGroup: { price_group_id: 21, currency: 'EUR' } });
      assert.equal(String(payload.inventory_id), String(expected));
    }
    for (const preferred of [200, 300]) {
      const product = { id, sku: id, title: 'Test', price: 10, quantity: 1 };
      const result = await runPreflightCheck({ products: [product], uniqueProducts: [product],
        duplicatesMap: new Map(), baseInventoryId: preferred });
      assert.equal(result.inventory.inventory_id, preferred);
      assert.equal(buildBasePayload(product, result).inventory_id, preferred);
    }
    await assert.rejects(getBaseInventory(999), /riconciliazione/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.BASE_API_TOKEN;
    else process.env.BASE_API_TOKEN = originalToken;
    refreshBaseToken();
  }
});
