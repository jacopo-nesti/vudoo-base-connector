import { readFile } from 'node:fs/promises';
import { normalizeInventoryTagNames } from './inventoryTags.js';

export async function getProducts() {
  const content = await readFile(new URL('../real_products.json', import.meta.url), 'utf8');
  const products = JSON.parse(content.replace(/^\uFEFF/, ''));
  if (!Array.isArray(products)) {
    throw new Error('real_products.json deve contenere un array di prodotti.');
  }
  return products;
}

export function parseFeedNumber(value, unit, field) {
  if (typeof value !== 'string' || !(unit.toLowerCase() === 'kg'
    ? value.trim().toLowerCase().endsWith('kg') : value.trim().endsWith(unit))) {
    throw new Error(`${field} deve essere una stringa con unita ${unit}.`);
  }
  let text = value.trim().slice(0, -unit.length).trim();
  if (text.includes(',')) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(text)) {
      throw new Error(`${field} contiene un numero non valido (${value}).`);
    }
    text = text.replace(/\./g, '').replace(',', '.');
  }
  const number = Number(text);
  if (!/^\d+(\.\d+)?$/.test(text) || !Number.isFinite(number)) {
    throw new Error(`${field} contiene un numero non valido.`);
  }
  return number;
}

function getEffectiveQuantity(source) {
  const quantityMissing = source.quantity == null ||
    (typeof source.quantity === 'string' && source.quantity.trim() === '');

  if (!quantityMissing) {
    const quantity = typeof source.quantity === 'string'
      ? Number(source.quantity.trim())
      : source.quantity;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) {
      throw new Error('quantity deve essere un numero maggiore o uguale a zero.');
    }
    return quantity;
  }

  if (source.availability != null && typeof source.availability !== 'string') {
    throw new Error('availability deve essere una stringa.');
  }
  const availability = source.availability?.trim().toLowerCase();
  if (availability === 'in stock') return 10;
  if (availability === 'out of stock') return 0;
  return undefined;
}

function resolveAutomaticStock(source) {
  const supplierQuantity = getEffectiveQuantity(source);
  return supplierQuantity == null ? undefined : Math.min(supplierQuantity, 10);
}

export function normalizeProduct(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Il prodotto deve essere un oggetto JSON.');
  }
  const normalized = { ...source };

  // +++ BLOCCO 1: Controllo severo campi obbligatori +++
  if (!source.id || typeof source.id !== 'string' || source.id.trim() === '') {
    throw new Error('Validazione fallita: SKU mancante.');
  }
  if (!source.title || typeof source.title !== 'string' || source.title.trim() === '') {
    throw new Error('Validazione fallita: Titolo mancante.');
  }
  if (!source.price || typeof source.price !== 'string' || source.price.trim() === '') {
    throw new Error('Validazione fallita: Prezzo mancante.');
  }

  for (const field of ['id', 'ean', 'mpn', 'title', 'brand', 'condition', 'description',
    'image_link', 'link', 'product_type', 'availability', 'pickup_SLA']) {
    if (source[field] != null && typeof source[field] !== 'string') {
      throw new Error(`${field} deve essere una stringa.`);
    }
  }

  // +++ BLOCCO 2: Pulizia spazi EAN e check sintassi URL +++
  if (source.ean != null) {
    normalized.ean = source.ean.replace(/\s+/g, ''); // Rimuove gli spazi anomali
    if (normalized.ean !== '' && !/^\d{8,14}$/.test(normalized.ean)) {
      throw new Error(`Validazione fallita: EAN non valido (${source.ean}).`);
    }
  }
  
  if (source.image_link != null) {
    if (!URL.canParse(source.image_link) || !['http:', 'https:'].includes(new URL(source.image_link).protocol)) {
      throw new Error(`Validazione fallita: URL immagine non valido (${source.image_link}).`);
    }
  }
  if (source.id != null) normalized.sku = source.id;
  for (const field of ['price', 'sale_price', 'weight', 'shipping_weight']) {
    if (source[field] == null) continue;
    const unit = field === 'price' || field === 'sale_price' ? 'EUR' : 'Kg';
    normalized[field] = parseFeedNumber(source[field], unit, field);
  }
  if (source.shipping != null) {
    if (typeof source.shipping !== 'object' || Array.isArray(source.shipping)) {
      throw new Error('shipping deve essere un oggetto.');
    }
    normalized.shipping = { ...source.shipping };
    if (source.shipping.price != null) {
      normalized.shipping.price = parseFeedNumber(source.shipping.price, 'EUR', 'shipping.price');
    }
  }
  const quantity = resolveAutomaticStock(source);
  if (quantity != null) normalized.quantity = quantity;
  else delete normalized.quantity;
  return normalized;
}

export function sanitizeTextForBase(text) {
  return text.replace(/ *(?:[\u{10000}-\u{10FFFF}][\uFE0E\uFE0F]? *)+/gu, (removed, offset) => {
    const before = text[offset - 1];
    const after = text[offset + removed.length];
    return removed.includes(' ') && before && after && !/[\r\n]/.test(before + after) ? ' ' : '';
  });
}

export function buildBasePayload(product, config) {
  const payload = { inventory_id: config.inventory.inventory_id };
  for (const field of ['sku', 'ean', 'weight', 'tax_rate', 'height', 'width', 'length']) {
    if (product[field] != null) payload[field] = product[field];
  }

  // Aggiunta dell'ID Produttore nel payload se presente
  for (const field of ['manufacturer_id', 'category_id']) {
    if (product[field] == null) continue;
    const id = Number(product[field]);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${field} non valido.`);
    payload[field] = id;
  }

  const textFields = {};
  if (product.title != null) textFields.name = sanitizeTextForBase(product.title);
  if (product.description != null) textFields.description = sanitizeTextForBase(product.description);
  for (const field of ['description_extra1', 'description_extra2', 'description_extra3', 'description_extra4']) {
    if (product[field] != null) textFields[field] = sanitizeTextForBase(product[field]);
  }
  if (Object.keys(product.features ?? {}).length) {
    textFields.features = Object.fromEntries(Object.entries(product.features).map(([name, value]) => [name, sanitizeTextForBase(value)]));
  }
  for (const [name, value] of Object.entries(product.additional_fields ?? {})) {
    const field = config.extraFields?.get(name);
    if (!field) throw new Error(`Additional Field non risolto: ${name}.`);
    const text = sanitizeTextForBase(String(value));
    if (field.kind === 0 && text.length > 200) throw new Error(`Additional Field troppo lungo: ${name}.`);
    if (field.editor_type === 'number' && (text.trim() === '' || !Number.isFinite(Number(text)))) {
      throw new Error(`Additional Field numerico non valido: ${name}.`);
    }
    textFields[`extra_field_${field.extra_field_id}`] = field.editor_type === 'number' ? Number(text) : text;
  }
  if (Object.keys(textFields).length > 0) payload.text_fields = textFields;

  if (product.price != null) {
    if (config.priceGroup.currency !== 'EUR') {
      throw new Error('Il feed contiene prezzi EUR ma il gruppo prezzi Base.com ha una valuta diversa.');
    }
    payload.prices = { [config.priceGroup.price_group_id]: product.price };
  }
  if (product.quantity != null) {
    if (!config.warehouse || !/^bl_\d+$/.test(config.warehouse.id)) {
      throw new Error('Magazzino Base valido mancante per la quantita.');
    }
    payload.stock = { [config.warehouse.id]: product.quantity };
  }
  if (product.image_link != null) {
    if (!URL.canParse(product.image_link) || !['http:', 'https:'].includes(new URL(product.image_link).protocol)) {
      throw new Error('image_link deve essere un URL HTTP o HTTPS valido.');
    }
    payload.images = { '0': `url:${product.image_link}` };
  }
  const additional = product.additional_image_link == null ? []
    : Array.isArray(product.additional_image_link) ? product.additional_image_link : [product.additional_image_link];
  if (additional.length > 15) throw new Error('Base.com supporta fino a 15 immagini aggiuntive.');
  for (const [index, image] of additional.entries()) {
    if (typeof image !== 'string' || !URL.canParse(image) ||
        !['http:', 'https:'].includes(new URL(image).protocol) || image.length > 1000) {
      throw new Error(`Immagine aggiuntiva ${index + 1}: URL HTTP/HTTPS non valido.`);
    }
    payload.images ??= {};
    payload.images[String(index + 1)] = `url:${image}`;
  }
  if ((product.manual_images?.length ?? 0) + additional.length + (product.image_link ? 1 : 0) > 16) {
    throw new Error('Base.com supporta al massimo 16 immagini effettive per prodotto.');
  }
  for (const image of product.manual_image_data ?? []) {
    if (!Number.isInteger(image.position) || image.position < 1 || image.position > 16 ||
        typeof image.data !== 'string' || !image.data.startsWith('data:')) {
      throw new Error('Immagine manuale Base.com non preparata correttamente.');
    }
    payload.images ??= {};
    const slot = String(image.position - 1);
    if (payload.images[slot]) throw new Error('Slot immagine Base.com già occupato dal catalogo Vudoo.');
    payload.images[slot] = image.data;
  }
  if (product.tags != null) payload.tags = normalizeInventoryTagNames(product.tags);
  return payload;
}

export function planManualImageData(product, existing, pending) {
  const originalLast = (product.image_link ? 1 : 0) +
    (Array.isArray(product.additional_image_link) ? product.additional_image_link.length
      : product.additional_image_link ? 1 : 0);
  const occupied = new Set(Object.keys(existing?.images ?? {})
    .filter(key => /^([1-9]|1[0-6])$/.test(key) && existing.images[key]).map(Number));
  const assignments = [];
  for (const image of pending) {
    let position = existing ? Math.max(2, originalLast + 1) : Math.max(1, originalLast + 1);
    while (occupied.has(position)) position++;
    if (position > 16) throw new Error('Limite Base.com di 16 immagini raggiunto: nessuna foto esistente sarà sovrascritta.');
    occupied.add(position);
    assignments.push({ ...image, position });
  }
  return assignments;
}

export function detectAndFilterDuplicates(products) {
    const seenSkus = new Set();
    const duplicatesMap = new Map();
    const uniqueProducts = [];

    for (const product of products) {
      const sku = product?.id;
      if (typeof sku !== 'string' || sku.trim() === '') {
        uniqueProducts.push(product);
        continue;
      }

      if (seenSkus.has(sku)) {
        const first = uniqueProducts.find(item => item?.id === sku);
        for (const field of ['title', 'description', 'price', 'ean', 'weight', 'image_link', 'brand', 'product_type', 'manufacturer_id', 'category_id',
          'tax_rate', 'height', 'width', 'length', 'description_extra1', 'description_extra2', 'description_extra3', 'description_extra4', 'features', 'additional_fields']) {
          if (JSON.stringify(first[field] ?? null) !== JSON.stringify(product[field] ?? null)) {
            throw new Error(`SKU duplicato ${sku} con valori discordanti: ${field}.`);
          }
        }
        if (getEffectiveQuantity(first.source ?? first) !== getEffectiveQuantity(product.source ?? product)) {
          throw new Error(`SKU duplicato ${sku} con valori discordanti: quantity.`);
        }
        const count = duplicatesMap.get(sku) ?? 1;
        duplicatesMap.set(sku, count + 1);
      } else {
        seenSkus.add(sku);
        uniqueProducts.push(product);
      }
    }

    return {
      uniqueProducts,
      duplicatesMap,
      hasDuplicates: duplicatesMap.size > 0
    };
}

export function featureValuesMatch(desired, current) {
  if (!current || typeof current !== 'object') return false;
  return Object.entries(desired).every(([name, value]) => {
    const saved = current[name];
    if (saved == null) return false;
    if (name === 'Shipping Weight (kg)') {
      return String(saved).trim() !== '' && Number.isFinite(Number(saved)) && Number(saved) === Number(value);
    }
    return String(saved) === String(value);
  });
}

export function assertVudooSkuCompatibility(product, existing) {
  const desired = product.features?.['Vudoo SKU'];
  const current = existing?.text_fields?.features?.['Vudoo SKU'];
  if (desired != null && current != null && String(desired).trim() !== String(current).trim()) {
    throw new Error(`SKU Base ${product.sku}: Parameter Vudoo SKU incompatibile.`);
  }
}

export function buildBaseUpdatePayload(product, existing, config) {
  if (existing.sku !== product.sku) throw new Error('UPDATE: SKU del dettaglio diverso da quello richiesto.');
  assertVudooSkuCompatibility(product, existing);
  const desired = buildBasePayload(product, config);
  const changes = {};
  for (const field of ['ean', 'weight', 'manufacturer_id', 'category_id', 'tax_rate', 'height', 'width', 'length']) {
    if (desired[field] == null) continue;
    const equal = field === 'ean'
      ? String(desired[field]) === String(existing[field] ?? '')
      : existing[field] != null && Number(desired[field]) === Number(existing[field]);
    if (!equal) changes[field] = desired[field];
  }
  for (const field of ['text_fields', 'prices', 'stock']) {
    const values = {};
    for (const [key, value] of Object.entries(desired[field] ?? {})) {
      const current = existing[field]?.[key];
      if (field === 'text_fields' && key === 'features') {
        if (current != null && (typeof current !== 'object' || (Array.isArray(current) && current.length))) {
          throw new Error('Parameters Base: struttura esistente non valida.');
        }
        if (!featureValuesMatch(value, current)) values.features = { ...current, ...value };
        continue;
      }
      const equal = field === 'text_fields'
        ? (typeof value === 'number'
          ? current != null && String(current).trim() !== '' && Number(current) === value
          : String(value) === String(current ?? ''))
        : current != null && Number(value) === Number(current);
      if (!equal) values[key] = value;
    }
    if (Object.keys(values).length) changes[field] = values;
  }
  if (desired.tags && JSON.stringify(desired.tags) !== JSON.stringify(existing.tags ?? [])) changes.tags = desired.tags;
  if (desired.images) {
    const images = {};
    const manualSlots = new Set((product.manual_image_data ?? []).map(image => String(image.position - 1)));
    for (const [position, value] of Object.entries(desired.images)) {
      if (manualSlots.has(position)) {
        if (existing.images?.[String(Number(position) + 1)]) throw new Error('Slot immagine Base.com non più libero: ripeti il preflight.');
        images[position] = value;
        continue;
      }
      const current = existing.images?.[String(Number(position) + 1)];
      const url = typeof current === 'string' ? current.replace(/^url:/, '') : '';
      // A changed supplier URL must never replace an already occupied Base slot implicitly.
      if (!url) images[position] = value;
    }
    if (Object.keys(images).length) changes.images = images;
  }
  return Object.keys(changes).length ? { inventory_id: desired.inventory_id, ...changes } : null;
}

export function hasProductChanged(product, existing, config) {
  return buildBaseUpdatePayload(product, existing, config) !== null;
}
