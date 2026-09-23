import { token, inventoryId, warehouseId, dryRun, getBaseApiRequestsPerMinute } from './config.js';
import { log } from './logger.js';
import { buildBasePayload, buildBaseUpdatePayload, featureValuesMatch } from './products.js';
import { nameIdentity } from './names.js';

const readMethods = new Set([
  'getInventories', 'getInventoryPriceGroups', 'getInventoryWarehouses',
  'getInventoryManufacturers', 'getInventoryCategories',
  'getInventoryExtraFields', 'getInventoryParameters',
  'getInventoryProductsList', 'getInventoryProductsData',
]);
let requestQueue = Promise.resolve();
let nextRequestAt = 0;
const requestTimes = [];
const uncertainWrites = new Map();

async function waitForRequestSlot(windowMs, safeLimit, softLimit) {
  while (true) {
    const now = Date.now();
    while (requestTimes.length && requestTimes[0] <= now - windowMs) requestTimes.shift();

    let preventiveWaitUntil = 0;
    const count = requestTimes.length;
    if (count >= safeLimit) {
      preventiveWaitUntil = requestTimes[0] + windowMs;
    } else if (count > 0 && count >= softLimit) {
      const pressure = (count - softLimit + 1) / (safeLimit - softLimit);
      const spacing = Math.ceil(windowMs / safeLimit * pressure);
      preventiveWaitUntil = Math.min(requestTimes[count - 1] + spacing, requestTimes[0] + windowMs);
    }

    const wait = Math.max(nextRequestAt, preventiveWaitUntil) - now;
    if (wait <= 0) return;
    log(`[RATE LIMIT] Attesa ${wait} ms prima della prossima richiesta Base.com (${count}/${safeLimit} nella finestra)`);
    await new Promise(resolve => setTimeout(resolve, Math.min(wait, 2147483647)));
  }
}

function apiSetting(name, fallback, minimum, maximum) {
  const raw = process.env[name] ?? String(fallback);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} deve essere un intero tra ${minimum} e ${maximum}.`);
  }
  return value;
}

function apiError(message, temporary = false, uncertain = false, retryAfterMs = 0) {
  return Object.assign(new Error(message), { temporary, uncertain, retryAfterMs });
}

function requestKey(method, parameters, body) {
  if (method === 'addInventoryManufacturer' && typeof parameters.manufacturer_name === 'string') {
    return JSON.stringify([method, nameIdentity(parameters.manufacturer_name)]);
  }
  if (method === 'addInventoryCategory' && typeof parameters.name === 'string') {
    return JSON.stringify([method, parameters.inventory_id, parameters.parent_id, nameIdentity(parameters.name)]);
  }
  return body?.toString() ?? new URLSearchParams({ method, parameters: JSON.stringify(parameters) }).toString();
}

function retryAfter(response) {
  const value = response.headers?.get('retry-after');
  if (!value) return 0;
  const milliseconds = /^\d+(\.\d+)?$/.test(value)
    ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(milliseconds) ? Math.max(0, milliseconds) : 0;
}

async function requestBase(method, body, readOnly, rateLimitDelay) {
  let response;
  try {
    requestTimes.push(Date.now());
    response = await fetch('https://api.baselinker.com/connector.php', {
      method: 'POST',
      headers: { 'X-BLToken': token },
      body,
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw apiError(`${method}: rete/timeout: ${error.message}`, true, !readOnly);
  }
  if (!response.ok) {
    const temporary = [408, 429, 500, 502, 503, 504].includes(response.status);
    const wait = Math.max(retryAfter(response), response.status === 429 ? rateLimitDelay : 0);
    throw apiError(`${method}: HTTP ${response.status}`, temporary,
      !readOnly && (response.status === 408 || response.status >= 500), wait);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw apiError(`${method}: risposta JSON non leggibile`, true, !readOnly);
  }
  if (data?.status === 'ERROR') {
    const limited = data.error_code === 'ERROR_BLOCKED_TOKEN';
    throw apiError(`${method}: ${data.error_code ?? 'ERROR'} - ${data.error_message ?? 'Errore API'}`,
      limited, false, limited ? Math.max(rateLimitDelay, retryAfter(response)) : 0);
  }
  if (data?.status !== 'SUCCESS') {
    throw apiError(`${method}: risposta API non valida`, true, !readOnly);
  }
  return data;
}

export async function callBase(method, parameters = {}) {
  if (!['true', 'false'].includes(dryRun)) throw new Error('DRY_RUN deve essere true oppure false.');
  const readOnly = readMethods.has(method);
  if (dryRun === 'true' && !readOnly) {
    throw new Error(`DRY_RUN: scrittura ${method} bloccata.`);
  }
  const windowMs = 60000;
  const safeLimit = getBaseApiRequestsPerMinute();
  const softLimit = Math.floor(safeLimit * 0.8);
  const attempts = apiSetting('BASE_API_READ_ATTEMPTS', 3, 1, 10);
  const retryDelay = apiSetting('BASE_API_RETRY_DELAY_MS', 1000, 1, 3600000);
  const rateLimitDelay = apiSetting('BASE_API_RATE_LIMIT_DELAY_MS', 60000, 1, 3600000);
  const body = new URLSearchParams({ method, parameters: JSON.stringify(parameters) });
  const key = requestKey(method, parameters, body);
  const run = requestQueue.then(async () => {
    if (!readOnly && uncertainWrites.has(key)) throw uncertainWrites.get(key);
    for (let attempt = 1; attempt <= (readOnly ? attempts : 1); attempt++) {
      await waitForRequestSlot(windowMs, safeLimit, softLimit);
      try {
        return await requestBase(method, body, readOnly, rateLimitDelay);
      } catch (error) {
        nextRequestAt = Math.max(nextRequestAt, Date.now() + (error.retryAfterMs ?? 0));
        if (error.uncertain) uncertainWrites.set(key, error);
        if (!readOnly || !error.temporary || attempt === attempts) throw error;
        nextRequestAt = Math.max(nextRequestAt, Date.now() + retryDelay * 2 ** (attempt - 1));
        log(`[RETRY] ${method}: ${error.message}; tentativo ${attempt + 1}/${attempts}`);
      }
    }
  });
  requestQueue = run.catch(() => {});
  return run;
}

export async function getBaseInventory() {
  const data = await callBase('getInventories');
  log('[DEBUG] Chiamata getInventories completata');
  if (!Array.isArray(data.inventories) || data.inventories.length === 0) {
    throw new Error('getInventories: nessun catalogo trovato su Base.com.');
  }
  log(`[DEBUG] Inventory disponibili: ${data.inventories.length}`);

  if (inventoryId) {
    const inventory = data.inventories.find(item => String(item.inventory_id) === inventoryId);
    if (inventory) return inventory;
    throw new Error(`BASE_INVENTORY_ID=${inventoryId} non trovato; nessun catalogo alternativo selezionato.`);
  }

  const defaults = data.inventories.filter(inventory => inventory.is_default === true);
  if (defaults.length !== 1) throw new Error('Inventory Default non identificabile in modo univoco.');
  const defaultInventory = defaults[0];
  log(`[DEBUG] Catalogo selezionato automaticamente (default): ${defaultInventory.name} (ID: ${defaultInventory.inventory_id})`);
  return defaultInventory;
}

export async function getBasePriceGroup(inventory) {
  const data = await callBase('getInventoryPriceGroups');
  if (!Array.isArray(data.price_groups) || !Array.isArray(inventory.price_groups)) {
    throw new Error('Elenco gruppi prezzi non valido.');
  }
  const priceGroups = data.price_groups.filter(priceGroup =>
    inventory.price_groups.some(id => String(id) === String(priceGroup.price_group_id))
  );
  const defaults = priceGroups.filter(priceGroup =>
    inventory.default_price_group != null
      ? String(priceGroup.price_group_id) === String(inventory.default_price_group)
      : priceGroup.is_default === true
  );
  if (defaults.length !== 1) {
    for (const priceGroup of priceGroups) {
      log(`Gruppo prezzi disponibile: ${priceGroup.name} (${priceGroup.currency}) - ID: ${priceGroup.price_group_id}`);
    }
    throw new Error('Gruppo prezzi predefinito non identificabile. Indica quale usare; nessuna importazione eseguita.');
  }
  const priceGroup = defaults[0];
  log(`Gruppo prezzi predefinito: ${priceGroup.name} (${priceGroup.currency})\nprice_group_id: ${priceGroup.price_group_id}`);
  return priceGroup;
}

export async function getBaseWarehouse(inventory) {
  const data = await callBase('getInventoryWarehouses');
  if (!Array.isArray(data.warehouses) || !Array.isArray(inventory.warehouses)) {
    throw new Error('Elenco magazzini non valido.');
  }
  const warehouses = data.warehouses.filter(warehouse => warehouse.warehouse_type === 'bl' &&
    inventory.warehouses.includes(`bl_${warehouse.warehouse_id}`));
  const candidates = warehouseId
    ? warehouses.filter(warehouse => `bl_${warehouse.warehouse_id}` === warehouseId)
    : warehouses;
  if (candidates.length !== 1) throw new Error('Warehouse non trovato o ambiguo: specificare BASE_WAREHOUSE_ID associato al catalogo.');
  return { name: candidates[0].name, id: `bl_${candidates[0].warehouse_id}` };
}

export async function productExistsInBase(sku, inventoryId) {
  return (await findProductInBase(sku, inventoryId)) !== null;
}

export async function findProductInBase(sku, inventoryId) {
  if (typeof sku !== 'string' || sku.trim() === '') {
    throw new Error('Controllo duplicati: SKU mancante o non valido.');
  }
  const data = await callBase('getInventoryProductsList', {
    inventory_id: inventoryId,
    filter_sku: sku,
    include_variants: true,
  });
  if (!data.products || typeof data.products !== 'object') {
    throw new Error('getInventoryProductsList: elenco prodotti non valido.');
  }
  let match = null;
  for (const [key, product] of Object.entries(data.products)) {
    if (!product || typeof product.sku !== 'string') {
      throw new Error('getInventoryProductsList: prodotto senza SKU valido nella risposta.');
    }
    if (product.sku !== sku) continue;
    if (match) throw new Error(`SKU ${sku} ambiguo: piu prodotti presenti nel catalogo.`);
    const id = Number(product.id ?? product.product_id ?? key);
    if (!Number.isSafeInteger(id) || id <= 0 || String(id) !== key) {
      throw new Error('Identita prodotto non valida nella risposta Base.com.');
    }
    match = { ...product, product_id: id };
  }
  return match;
}

export async function getBaseProductDetails(inventoryId, productId) {
  const data = await callBase('getInventoryProductsData', { inventory_id: inventoryId, products: [productId] });
  const product = data.products?.[productId];
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    throw new Error(`Dettagli del prodotto ${productId} mancanti.`);
  }
  return product;
}

export async function updateProductInBase(productId, product, config, existing) {
  if (!Number.isSafeInteger(Number(productId)) || Number(productId) <= 0) throw new Error('product_id UPDATE non valido.');
  const details = existing ?? await getBaseProductDetails(config.inventory.inventory_id, productId);
  const changes = buildBaseUpdatePayload(product, details, config);
  if (!changes) return null;
  const payload = { ...changes, product_id: Number(productId) };
  if (dryRun === 'true') {
    log(`Payload Base.com (UPDATE):\n${JSON.stringify(payload, null, 2)}`);
    log('DRY_RUN: nessuna scrittura su Base.com');
    return null;
  }
  return await writeProductAndVerify(payload, product.sku);
}

export async function sendProductToBase(product, config) {
  const payload = buildBasePayload(product, config);
  if (dryRun === 'true') {
    log(`Payload Base.com (addInventoryProduct):\n${JSON.stringify(payload, null, 2)}`);
    log('DRY_RUN: nessuna scrittura su Base.com');
    return null;
  }
  return await writeProductAndVerify(payload, product.sku);
}

function writtenValuesMatch(payload, details, sku) {
  if (details.sku !== sku) return false;
  for (const [field, value] of Object.entries(payload)) {
    if (['inventory_id', 'product_id', 'sku'].includes(field)) continue;
    if (['text_fields', 'prices', 'stock'].includes(field)) {
      for (const [key, desired] of Object.entries(value)) {
        const current = details[field]?.[key];
        if (current == null) return false;
        if (field === 'text_fields' && key === 'features') {
          if (!featureValuesMatch(desired, current)) return false;
        } else if (field === 'text_fields' && typeof desired !== 'number'
          ? String(current) !== String(desired) : !sameNumber(current, desired)) return false;
      }
    } else if (field === 'images') {
      for (const [position, desired] of Object.entries(value)) {
        const current = details.images?.[Number(position) + 1];
        if (typeof current !== 'string' || current.replace(/^url:/, '') !== desired.replace(/^url:/, '')) return false;
      }
    } else if (field === 'ean') {
      if (details[field] == null || String(details[field]) !== String(value)) return false;
    } else if (['weight', 'manufacturer_id', 'category_id', 'tax_rate', 'height', 'width', 'length'].includes(field)) {
      if (!sameNumber(details[field], value)) return false;
    } else {
      return false;
    }
  }
  return true;
}

function sameNumber(current, desired) {
  return (typeof current === 'number' || (typeof current === 'string' && current.trim() !== '')) &&
    Number.isFinite(Number(current)) && Number(current) === Number(desired);
}

async function writeProductAndVerify(payload, sku) {
  const operation = payload.product_id == null ? 'CREATE' : 'UPDATE';
  try {
    const result = await callBase('addInventoryProduct', payload);
    if (payload.text_fields?.features && Object.keys(result.warnings?.parameters ?? {}).length) {
      throw apiError('addInventoryProduct: Parameters non confermati da Base.com', false, true);
    }
    const id = Number(result.product_id);
    if (!Number.isSafeInteger(id) || id <= 0 || (payload.product_id != null && id !== payload.product_id)) {
      throw apiError('addInventoryProduct: conferma senza product_id valido/corrispondente', false, true);
    }
    return result;
  } catch (error) {
    if (!error.uncertain) throw error;
    const key = requestKey('addInventoryProduct', payload);
    uncertainWrites.set(key, error);
    log(`[UNCERTAIN] ${operation} SKU ${sku}: ${error.message}; verifica read-only...`);
    try {
      const match = payload.product_id == null
        ? await findProductInBase(sku, payload.inventory_id)
        : { product_id: payload.product_id };
      if (!match) throw new Error('Nessun prodotto trovato tramite SKU; possibile visibilita ritardata.');
      const details = await getBaseProductDetails(payload.inventory_id, match.product_id);
      if (!writtenValuesMatch(payload, details, sku)) {
        throw new Error('Stato non corrispondente o campi inviati non verificabili (incluse eventuali immagini CDN).');
      }
      log(`[UNCERTAIN] ${operation} SKU ${sku}: stato desiderato verificato, operazione confermata.`);
      return { status: 'SUCCESS', product_id: match.product_id, confirmed_after_uncertain: true };
    } catch (verificationError) {
      throw apiError(`${operation} SKU ${sku}: esito incerto (${error.message}); verifica: ${verificationError.message}`, false, true);
    }
  }
}
