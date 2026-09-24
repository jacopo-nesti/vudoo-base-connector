import { parseCatalog, formatProductTitle } from './converter.js';
import { normalizeProduct, detectAndFilterDuplicates } from './products.js';
import { isMissingSourceCategory } from './categoryNormalizer.js';

const endpoint = 'https://www.vudoo.org/ProductCatalog.ashx';
const defaults = Object.freeze({ idCategoria: '', disponibili: true, lingua: 1, listino: 6, risultati: 500 });

export function buildVudooCatalogUrl(codiceAzienda) {
  if (typeof codiceAzienda !== 'string' || !codiceAzienda.trim()) {
    throw new Error('Codice azienda mancante.');
  }
  const url = new URL(endpoint);
  url.search = new URLSearchParams({ codiceAzienda: codiceAzienda.trim(), ...defaults }).toString();
  return url;
}

export async function fetchVudooXml(codiceAzienda) {
  const url = buildVudooCatalogUrl(codiceAzienda);
  const signal = AbortSignal.timeout(30000);
  let response;
  try {
    response = await fetch(url, { method: 'GET', signal, redirect: 'error' });
  } catch {
    throw new Error(signal.aborted ? 'Vudoo: timeout del catalogo.' : 'Vudoo: errore di rete o redirect.');
  }
  if (!response.ok) throw new Error(`Vudoo: errore HTTP ${response.status}.`);
  if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error('Vudoo: risposta HTML invece del catalogo XML.');
  }
  let xml;
  try {
    xml = await response.text();
  } catch {
    throw new Error(signal.aborted ? 'Vudoo: timeout lettura catalogo.' : 'Vudoo: risposta non leggibile.');
  }
  if (!xml.trim()) throw new Error('Vudoo: catalogo XML vuoto.');
  return xml;
}

function numericField(value, field) {
  if (!['string', 'number'].includes(typeof value) || !/^-?\d+(?:[.,]\d+)?$/.test(String(value).trim())) {
    throw new Error(`${field}: valore numerico non valido.`);
  }
  const number = Number(String(value).trim().replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error(`${field}: valore numerico non valido.`);
  return number;
}

function invalidSourceEan(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return false;
  return typeof value !== 'string' || !/^\d{8,14}$/.test(value);
}

export function normalizeVudooProduct(source) {
  const input = { ...source };
  for (const [field, value] of Object.entries(input)) {
    if (value == null || (typeof value === 'string' && !value.trim())) delete input[field];
  }
  if (input.shipping && typeof input.shipping === 'object' && !Array.isArray(input.shipping)) {
    input.shipping = Object.fromEntries(Object.entries(input.shipping).filter(([, value]) =>
      value != null && !(typeof value === 'string' && !value.trim())));
  }
  for (const field of ['sku', 'size', 'color']) {
    if (input[field] == null) continue;
    if (typeof input[field] !== 'string') throw new Error(`${field} deve essere una stringa.`);
    input[field] = input[field].trim();
  }
  if (invalidSourceEan(source.ean)) delete input.ean;
  const vudooSku = input.sku;
  const product = normalizeProduct(input);
  product.source = source;
  product.original_title = source.title;
  product.vudoo_sku = vudooSku;
  product.title = formatProductTitle(product.original_title, product.brand, product.size, product.color);
  product.tax_rate = input.tax_rate == null ? 22 : numericField(input.tax_rate, 'tax_rate');
  if (!(product.tax_rate >= 0 && product.tax_rate <= 100) && ![-1, -0.02, -0.03].includes(product.tax_rate)) {
    throw new Error('tax_rate: aliquota non valida per Base.com.');
  }
  for (const [sourceField, target] of [['conf_alt', 'height'], ['conf_lar', 'width'], ['conf_lun', 'length']]) {
    let value = 15;
    if (input[sourceField] != null) {
      try {
        const parsed = numericField(input[sourceField], sourceField);
        if (parsed > 0) value = parsed;
      } catch {
        value = 15;
      }
    }
    product[target] = value;
  }
  for (let index = 1; index <= 5; index++) {
    if (input[`bullet${index}`] == null) continue;
    if (typeof input[`bullet${index}`] !== 'string') throw new Error(`bullet${index}: testo non valido.`);
    if (index <= 4) product[`description_extra${index}`] = input[`bullet${index}`];
  }
  product.features = {};
  for (const [field, name] of [
    ['mpn', 'MPN'], ['condition', 'Condition'], ['pickup_SLA', 'Pickup SLA'],
    ['item_group_id', 'Item Group ID'], ['shipping_weight', 'Shipping Weight (kg)'],
    ['vudoo_sku', 'Vudoo SKU'], ['size', 'Size'], ['color', 'Color'],
  ]) {
    if (product[field] == null) continue;
    if (!['string', 'number'].includes(typeof product[field])) throw new Error(`${field}: valore non valido.`);
    product.features[name] = String(product[field]);
  }
  product.additional_fields = {};
  for (const [name, value] of [
    ['Vudoo Sale Price', product.sale_price], ['Vudoo Product URL', product.link],
    ['Vudoo Original Title', product.original_title], ['Additional description 5', input.bullet5],
    ['Shipping Country', product.shipping?.country], ['Shipping Service', product.shipping?.service],
    ['Shipping Price', product.shipping?.price],
  ]) {
    if (value == null || (typeof value === 'string' && !value.trim())) continue;
    if (!['string', 'number'].includes(typeof value)) throw new Error(`${name}: valore non valido.`);
    product.additional_fields[name] = value;
  }
  return product;
}

export function prepareVudooCatalog(xml, { skipMissingSourceCategory = false } = {}) {
  const { channelTitle, products: sources } = parseCatalog(xml);
  const eanWarnings = [];
  const products = sources.map((source, index) => {
    try {
      if (skipMissingSourceCategory && isMissingSourceCategory(source.product_type)) {
        return {
          id: source.id,
          vudoo_sku: source.sku,
          original_title: source.title,
          product_type: source.product_type,
          source,
        };
      }
      const product = normalizeVudooProduct(source);
      if (invalidSourceEan(source.ean)) {
        eanWarnings.push({ id: source.id, sku: source.sku, title: source.title, originalEan: source.ean });
      }
      return product;
    } catch (error) {
      throw new Error(`Catalogo Vudoo, record ${index + 1}: ${error.message}`);
    }
  });
  const deduplicated = detectAndFilterDuplicates(skipMissingSourceCategory
    ? products.filter(product => !isMissingSourceCategory(product.product_type))
    : products);
  return { channelTitle, sources, products, eanWarnings, ...deduplicated };
}
