import { nameIdentity } from './names.js';
import { isMissingSourceCategory } from './categoryNormalizer.js';

export function sourceIdentity(product) {
  return typeof product.id === 'string' && product.id.trim()
    ? `id:${product.id.trim()}` : product;
}

export function uniqueProductCount(products) {
  return new Set(products.map(sourceIdentity)).size;
}

export function findCategories(products, query) {
  const search = nameIdentity(query);
  if (!search) return [];
  const categories = new Map();
  for (const product of products) {
    const path = product.product_type;
    if (isMissingSourceCategory(path)) continue;
    const key = nameIdentity(path);
    if (!key.includes(search)) continue;
    if (!categories.has(key)) categories.set(key, { path, identities: new Set() });
    categories.get(key).identities.add(sourceIdentity(product));
  }
  return [...categories.values()].map(({ path, identities }) => ({ path, count: identities.size }))
    .sort((a, b) => a.path.localeCompare(b.path, 'it', { sensitivity: 'base' }));
}

export function findByCategory(products, path) {
  const key = nameIdentity(path);
  if (!key || isMissingSourceCategory(path)) return [];
  return products.filter(product => !isMissingSourceCategory(product.product_type) &&
    nameIdentity(product.product_type) === key);
}

export function findByCode(products, code) {
  const value = code?.trim();
  if (!value) return [];
  return products.filter(product => product.id === value ||
    (typeof product.sku === 'string' && nameIdentity(product.sku) === nameIdentity(value)));
}

export function findByKeyword(products, keyword) {
  const value = nameIdentity(keyword);
  if (!value) return [];
  return products.filter(product => ['title', 'description', 'product_type', 'brand']
    .some(field => typeof product[field] === 'string' && nameIdentity(product[field]).includes(value)));
}

export function addToSelection(selection, products) {
  const next = new Set(selection);
  for (const product of products) next.add(sourceIdentity(product));
  return { selection: next, added: next.size - selection.size };
}

export function selectedProducts(products, selection) {
  return products.filter(product => selection.has(sourceIdentity(product)));
}

export function findSelectedByCode(products, selection, code) {
  const value = code?.trim();
  if (!value) return { kind: null, matches: [] };
  const selected = selectedProducts(products, selection);
  const byId = selected.filter(product => product.id === value);
  if (byId.length) return { kind: 'id', matches: byId };
  return {
    kind: 'sku',
    matches: selected.filter(product => typeof product.sku === 'string' &&
      nameIdentity(product.sku) === nameIdentity(value)),
  };
}

export function removeFromSelection(selection, products) {
  const next = new Set(selection);
  for (const product of products) next.delete(sourceIdentity(product));
  return { selection: next, removed: selection.size - next.size };
}

export function selectionSummary(products, selection) {
  const identities = new Set(products.map(sourceIdentity));
  const selected = [...identities].filter(key => selection.has(key)).length;
  return { total: identities.size, selected, excluded: identities.size - selected };
}
