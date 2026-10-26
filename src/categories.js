import { callBase } from './baseApi.js';
import { dryRun } from './config.js';
import { log } from './logger.js';
import { cleanName, nameIdentity } from './names.js';

function categoryKey(parent, name) {
  return `${parent}:${nameIdentity(name)}`;
}

/** Categories returned without inventory_id are available to every Inventory. */
export function buildGlobalCategoryIndex(rows) {
  if (!Array.isArray(rows)) throw new Error('getInventoryCategories: elenco globale non valido.');
  const byId = new Map();
  for (const row of rows) {
    const id = Number(row?.category_id);
    const parentId = Number(row?.parent_id ?? 0);
    if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(parentId) || parentId < 0 ||
      typeof row?.name !== 'string' || !row.name.trim() || byId.has(id)) {
      throw new Error('getInventoryCategories: categoria globale non valida o ID duplicato.');
    }
    byId.set(id, { categoryId: id, parentId, name: cleanName(row.name) });
  }
  const byPath = new Map();
  const byName = new Map();
  const entries = [];
  for (const row of byId.values()) {
    const path = [];
    const seen = new Set();
    let current = row;
    while (current) {
      if (seen.has(current.categoryId)) throw new Error('getInventoryCategories: gerarchia ciclica.');
      seen.add(current.categoryId);
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : null;
      if (seen.size && path.length && current === undefined) throw new Error('getInventoryCategories: parent mancante.');
    }
    const entry = { ...row, path };
    entries.push(entry);
    const pathKey = nameIdentity(path.join(' > '));
    const nameKey = nameIdentity(row.name);
    byPath.set(pathKey, [...(byPath.get(pathKey) ?? []), entry]);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), entry]);
  }
  return { count: rows.length, byId: new Map(entries.map(entry => [entry.categoryId, entry])), byPath, byName, entries };
}

export function resolveGlobalCategoryId(categoryId, index) {
  const entry = index?.byId.get(Number(categoryId));
  if (!entry || entry.categoryId !== Number(categoryId)) return null;
  const matches = index.byPath.get(nameIdentity(entry.path.join(' > '))) ?? [];
  return matches.length === 1 ? { categoryId: entry.categoryId, path: [...entry.path] } : null;
}

export function resolveProductGlobalCategory(product, index) {
  if (!product?.category_id) return resolveGlobalCategoryPath(product?.base_category_path, index);
  const direct = resolveGlobalCategoryId(product.category_id, index);
  return direct && JSON.stringify(direct.path) === JSON.stringify(product.base_category_path)
    ? { status: 'GLOBAL_CATEGORY_MATCH', ...direct, candidates: [] }
    : { status: 'UNRESOLVED_CATEGORY_MAPPING', categoryId: null,
      path: product.base_category_path ?? [], candidates: [] };
}

export async function getGlobalCategoryIndex() {
  const data = await callBase('getInventoryCategories');
  return buildGlobalCategoryIndex(data.categories);
}

export function resolveGlobalCategoryPath(parts, index) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return { status: 'UNMAPPED_CATEGORY', categoryId: null, candidates: [] };
  }
  const path = parts.map(part => cleanName(part));
  if (path.some(part => !part)) throw new Error('Percorso categoria con livello vuoto.');
  const matches = index.byPath.get(nameIdentity(path.join(' > '))) ?? [];
  if (matches.length === 1) return { status: 'GLOBAL_CATEGORY_MATCH', categoryId: matches[0].categoryId,
    path: matches[0].path, candidates: [] };
  const candidates = (matches.length ? matches : index.byName.get(nameIdentity(path.at(-1))) ?? [])
    .map(entry => ({ categoryId: entry.categoryId, path: entry.path }));
  return { status: matches.length > 1 ? 'AMBIGUOUS_CATEGORY_MAPPING' : 'UNRESOLVED_CATEGORY_MAPPING',
    categoryId: null, path, candidates };
}

export async function getCategoryMap(inventoryId) {
  const data = await callBase('getInventoryCategories', { inventory_id: inventoryId });
  if (!Array.isArray(data.categories)) throw new Error('getInventoryCategories: elenco non valido.');
  const categories = new Map();
  for (const category of data.categories) {
    const id = Number(category.category_id);
    const parent = Number(category.parent_id ?? 0);
    if (typeof category.name !== 'string' || !category.name.trim() || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(parent) || parent < 0) {
      throw new Error('Categoria Base.com non valida.');
    }
    const key = categoryKey(parent, category.name);
    if (categories.has(key) && categories.get(key) !== id) throw new Error(`Categoria ambigua: ${category.name}.`);
    categories.set(key, id);
  }
  return categories;
}

export async function ensureCategoryPath(productType, inventoryId, categories) {
  if (productType == null || productType === '') return null;
  if (!Array.isArray(productType) && typeof productType !== 'string') {
    throw new Error('Il percorso categoria deve essere una stringa o un array.');
  }
  if (typeof productType === 'string' && !productType.trim()) return null;
  const parts = (Array.isArray(productType) ? productType : productType.split('>')).map(part => {
    if (typeof part !== 'string') throw new Error('Percorso categorie con livello non testuale.');
    return cleanName(part);
  });
  if (parts.some(name => !name)) throw new Error('Percorso categorie con livello vuoto.');
  let parent = 0;
  for (const name of parts) {
    const key = categoryKey(parent, name);
    if (!categories.has(key)) {
      if (dryRun === 'true') {
        log(`[DRY_RUN] Categoria da creare: ${name} (parent: ${parent})`);
        categories.set(key, null);
      } else {
        let id;
        try {
          const result = await callBase('addInventoryCategory', { inventory_id: inventoryId, name, parent_id: parent });
          id = Number(result.category_id);
          if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`ID categoria non valido: ${name}.`);
        } catch (error) {
          if (!error.uncertain) throw error;
          log(`[UNCERTAIN] Categoria ${name}: verifica read-only dopo CREATE incerta...`);
          try {
            const refreshed = await getCategoryMap(inventoryId);
            id = refreshed.get(key);
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Categoria equivalente non trovata con lo stesso parent.');
            log(`[UNCERTAIN] Categoria ${name}: risorsa equivalente trovata (${id}), CREATE confermata.`);
          } catch (verificationError) {
            log(`[UNCERTAIN] Categoria ${name}: verifica non conclusiva (${verificationError.message}).`);
            throw error;
          }
        }
        categories.set(key, id);
        log(`SUCCESS - Categoria creata: ${name} (${id})`);
      }
    }
    parent = categories.get(key) ?? `simulata:${key}`;
  }
  return typeof parent === 'number' ? parent : null;
}
