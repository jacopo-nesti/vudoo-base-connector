import assert from 'node:assert/strict';
import { catalogXml, extraFields, parameters, parameterGroups } from './fixtures/vudoo.js';
const BASE_API_URL = 'https://api.baselinker.com/connector.php';
const scenario = process.env.TEST_BASE_SCENARIO;

function baseResponse(data) {
  return {
    ok: true,
    status: 200,
    headers: {
      get() {
        return null;
      },
    },
    async json() {
      return { status: 'SUCCESS', ...data };
    },
  };
}

globalThis.fetch = async (url, request = {}) => {
  if (String(url).startsWith('https://www.vudoo.org/ProductCatalog.ashx?') && process.env.TEST_VUDOO_CODE) {
    assert.equal(request.method, 'GET');
    assert.deepEqual(Object.fromEntries(new URL(url).searchParams), {
      codiceAzienda: process.env.TEST_VUDOO_CODE, idCategoria: '', disponibili: 'true', lingua: '1', listino: '6',
      risultati: process.env.TEST_VUDOO_EXPECTED_RESULTS ?? '3000',
    });
    assert.equal(request.headers?.['X-BLToken'], undefined);
    if (scenario === 'vudoo-timeout') throw new DOMException('Timeout simulato', 'TimeoutError');
    return { ok: true, headers: { get: () => 'application/xml' }, text: async () => scenario === 'vudoo-invalid' ? '<rss>' : catalogXml() };
  }
  if (url !== BASE_API_URL) {
    throw new Error(`Richiesta esterna non prevista nel test: ${url}`);
  }

  const method = request.body?.get('method');

  if (!method?.startsWith('get')) {
    throw new Error(`Scrittura Base.com bloccata nel test: ${method ?? 'metodo sconosciuto'}`);
  }

  if (scenario === 'preflight-error' && method === 'getInventories') {
    return baseResponse({
      status: 'ERROR',
      error_code: 'TEST_PREFLIGHT_ERROR',
      error_message: 'Errore preflight controllato dal test',
    });
  }

  if (scenario === 'import-error' && method === 'getInventoryManufacturers') {
    return baseResponse({
      status: 'ERROR',
      error_code: 'TEST_IMPORT_ERROR',
      error_message: 'Errore import controllato dal test',
    });
  }

  const responses = {
    getInventoryExtraFields: { extra_fields: extraFields },
    getInventoryParameters: { parameters, parameter_groups: parameterGroups },
    getInventories: {
      inventories: [
        {
          inventory_id: 10,
          name: 'Inventory test',
          is_default: true,
          price_groups: [20],
          default_price_group: 20,
          warehouses: ['bl_30'],
        },
      ],
    },
    getInventoryPriceGroups: {
      price_groups: [
        {
          price_group_id: 20,
          name: 'Default',
          currency: 'EUR',
          is_default: true,
        },
      ],
    },
    getInventoryWarehouses: {
      warehouses: [
        {
          warehouse_id: 30,
          name: 'Warehouse test',
          warehouse_type: 'bl',
        },
      ],
    },
    getInventoryManufacturers: {
      manufacturers: [{ manufacturer_id: 40, name: 'Marca' }],
    },
    getInventoryCategories: {
      categories: [],
    },
    getInventoryProductsList: {
      products: {},
    },
    getInventoryProductsData: {
      products: {},
    },
  };

  if (!(method in responses)) {
    throw new Error(`Lettura Base.com non prevista nel test: ${method}`);
  }

  return baseResponse(responses[method]);
};
