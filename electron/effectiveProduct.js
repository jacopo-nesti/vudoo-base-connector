import { formatProductTitle } from '../src/converter.js';

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

export function effectiveProduct(product, fields) {
  return {
    ...product,
    ...(Object.hasOwn(fields, 'title') ? { title: fields.title } : {}),
    ...(Object.hasOwn(fields, 'description') ? { description: fields.description } : {}),
  };
}

export function effectiveSourceProduct(source, fields) {
  return effectiveProduct({ ...source, title: defaultProductTitle(source) }, fields);
}

export function applyProductOverrides(catalog, overrides, companyCode) {
  if (Object.keys(overrides).length === 0) return catalog;
  const copied = new Map();
  function copy(product) {
    if (copied.has(product)) return copied.get(product);
    const fields = product?.id ? getProductOverride(overrides, companyCode, product.id) : {};
    const result = effectiveProduct(product, fields);
    copied.set(product, result);
    return result;
  }
  return {
    ...catalog,
    products: catalog.products.map(copy),
    uniqueProducts: catalog.uniqueProducts.map(copy),
  };
}
