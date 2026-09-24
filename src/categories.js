import { callBase } from './baseApi.js';
import { dryRun } from './config.js';
import { log } from './logger.js';
import { cleanName, nameIdentity } from './names.js';

function categoryKey(parent, name) {
  return `${parent}:${nameIdentity(name)}`;
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
