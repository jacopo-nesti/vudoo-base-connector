import { formatProductTitle } from '../src/converter.js';
import { FIELD_BY_KEY, BASE_FIELD_BY_KEY, getField, setField } from '../src/productSchema.js';

export function defaultProductTitle(source) {
  return formatProductTitle(source.title, source.brand, source.size, source.color);
}

export function productKey(companyCode, productId) {
  if (typeof companyCode !== 'string' || !companyCode.trim() ||
      typeof productId !== 'string' || !productId.trim()) {
    throw new Error('Codice azienda o ID prodotto non valido.');
  }
  return JSON.stringify([companyCode.trim(), productId.trim()]);
}

export function getProductOverride(overrides, companyCode, productId) {
  return overrides[productKey(companyCode, productId)] ?? {};
}

/** One precedence rule for all consumers: marketplace > manual > canonical > supplier. */
export function resolveProductValue({ source, canonical, manual = {}, marketplace = {}, key }) {
  const sourceValue = getField(source, key);
  const canonicalValue = getField(canonical, key);
  const manualValue = Object.hasOwn(manual, key) ? manual[key] : undefined;
  const marketplaceValue = Object.hasOwn(marketplace, key) ? marketplace[key] : undefined;
  const globalValue = Object.hasOwn(manual, key) ? manualValue : canonicalValue !== undefined ? canonicalValue : sourceValue;
  const origin = Object.hasOwn(marketplace, key) ? 'marketplace'
    : Object.hasOwn(manual, key) ? 'manual'
      : canonicalValue !== undefined ? 'canonical' : 'supplier';
  return { value: origin === 'marketplace' ? marketplaceValue : globalValue, globalValue,
    origin, source: sourceValue ?? null, canonical: canonicalValue ?? null,
    manual: manualValue, marketplace: marketplaceValue };
}

function derivedBaseFields(product, original) {
  if (!original.features && !original.additional_fields) return product;
  const features = { ...original.features };
  const extras = { ...original.additional_fields };
  for (const [key, name] of [['mpn', 'MPN'], ['condition', 'Condition'], ['pickup_SLA', 'Pickup SLA'],
    ['item_group_id', 'Item Group ID'], ['shipping_weight', 'Shipping Weight (kg)'],
    ['size', 'Size'], ['color', 'Color']]) {
    if (product[key] != null || Object.hasOwn(features, name)) features[name] = String(product[key] ?? '');
  }
  for (const [key, name] of [['sale_price', 'Vudoo Sale Price'], ['link', 'Vudoo Product URL'],
    ['bullet5', 'Additional description 5'], ['shipping.country', 'Shipping Country'],
    ['shipping.service', 'Shipping Service'], ['shipping.price', 'Shipping Price']]) {
    const value = getField(product, key);
    if (value != null || Object.hasOwn(extras, name)) extras[name] = value == null ? '' : value;
  }
  return { ...product, features, additional_fields: extras };
}

export function effectiveProduct(product, fields = {}, marketplace = null) {
  let result = { ...product };
  if (fields.manual_images?.length) result.manual_images = fields.manual_images.map(image => ({ ...image }));
  for (const [key, value] of Object.entries(fields)) {
    if (FIELD_BY_KEY.get(key)?.editable) result = setField(result, key, value);
  }
  if (!Object.hasOwn(fields, 'title') && ['brand', 'size', 'color'].some(key => Object.hasOwn(fields, key)) &&
      typeof product.original_title === 'string') {
    result.title = formatProductTitle(product.original_title, result.brand, result.size, result.color);
  }
  if (marketplace === 'base') {
    for (const [key, value] of Object.entries(fields.base ?? {})) {
      if (BASE_FIELD_BY_KEY.has(key)) result = setField(result, key, value);
    }
  }
  return derivedBaseFields(result, product);
}

export function effectiveSourceProduct(source, fields) {
  return effectiveProduct({ ...source, title: defaultProductTitle(source) }, fields);
}

export function applyProductOverrides(catalog, overrides, companyCode, marketplace = 'base') {
  if (Object.keys(overrides).length === 0) return catalog;
  const copied = new Map();
  function copy(product) {
    if (copied.has(product)) return copied.get(product);
    const fields = product?.id ? getProductOverride(overrides, companyCode, product.id) : {};
    const result = effectiveProduct(product, fields, marketplace);
    copied.set(product, result);
    return result;
  }
  return {
    ...catalog,
    products: catalog.products.map(copy),
    uniqueProducts: catalog.uniqueProducts.map(copy),
  };
}
