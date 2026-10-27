import { buildGlobalCategoryIndex } from '../src/categories.js';
import { nameIdentity } from '../src/names.js';

const categoryRows = index => index.entries.map(({ categoryId, parentId, name, path }) =>
  ({ categoryId, parentId, name, path }));

export function createBaseCategoryService({ request, isSimulation }) {
  async function write(method, parameters) {
    try { return await request(method, parameters); }
    catch (error) {
      if (error?.uncertain) throw new Error('Esito Base.com incerto. Aggiorna l’albero e verifica su Base.com prima di riprovare.');
      throw error;
    }
  }
  async function read() {
    const response = await request('getInventoryCategories');
    return categoryRows(buildGlobalCategoryIndex(response.categories));
  }

  async function mutate(operation, input = {}) {
    const current = buildGlobalCategoryIndex((await request('getInventoryCategories')).categories);
    const id = input.categoryId;
    if (operation !== 'create' && (!Number.isSafeInteger(id) || id <= 0))
      throw new Error('ID categoria Base.com non valido.');
    const existing = id == null ? null : current.byId.get(id);
    if (operation !== 'create' && !existing) throw new Error('Categoria Base.com non più disponibile. Aggiorna l’albero.');
    if (existing && input.expectedParentId != null && existing.parentId !== input.expectedParentId)
      throw new Error('La gerarchia Base.com è cambiata. Aggiorna l’albero e ripeti la conferma.');
    if (existing && input.expectedName != null && existing.name !== input.expectedName)
      throw new Error('Il nome categoria è cambiato su Base.com. Aggiorna l’albero e ripeti la conferma.');
    let changedId = id ?? null;
    if (operation === 'create' || operation === 'update') {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const parentId = input.parentId;
      if (!name || name.length > 200) throw new Error('Il nome categoria deve contenere da 1 a 200 caratteri.');
      if (!Number.isSafeInteger(parentId) || parentId < 0 || (parentId && !current.byId.has(parentId)))
        throw new Error('Categoria padre non disponibile su Base.com.');
      if (current.entries.some(entry => entry.categoryId !== id && entry.parentId === parentId &&
        nameIdentity(entry.name) === nameIdentity(name)))
        throw new Error('Esiste già una categoria con questo nome sotto la stessa categoria padre.');
      if (operation === 'update') {
        let parent = parentId;
        while (parent) {
          if (parent === id) throw new Error('Una categoria non può diventare figlia di sé stessa o di un discendente.');
          parent = current.byId.get(parent)?.parentId ?? 0;
        }
      }
      if (isSimulation()) return { simulated: true, categories: categoryRows(current) };
      const parameters = { name, parent_id: parentId };
      if (operation === 'update') parameters.category_id = id;
      const result = await write('addInventoryCategory', parameters);
      changedId = Number(result.category_id);
      if (!Number.isSafeInteger(changedId) || changedId <= 0 ||
        (operation === 'update' && changedId !== id))
        throw new Error('Base.com non ha confermato un ID categoria coerente. Aggiorna e verifica prima di riprovare.');
    } else if (operation === 'delete') {
      if (input.confirmation !== 'ELIMINA') throw new Error('Scrivi ELIMINA per confermare la cancellazione.');
      if (isSimulation()) return { simulated: true, categories: categoryRows(current) };
      await write('deleteInventoryCategory', { category_id: id });
    } else throw new Error('Operazione categoria non valida.');
    // Reconcile the actual Base state after each successful mutation.
    const categories = await read();
    if (operation === 'create' && !categories.some(category => category.categoryId === changedId &&
      category.name === input.name.trim() && category.parentId === input.parentId))
      throw new Error('La nuova categoria non risulta nella rilettura Base.com. Aggiorna e verifica prima di riprovare.');
    if (operation === 'delete' && categories.some(category => category.categoryId === id))
      throw new Error('Base.com non ha confermato la rimozione. Aggiorna e verifica prima di riprovare.');
    if (operation === 'update' && !categories.some(category => category.categoryId === id &&
      category.name === input.name.trim() && category.parentId === input.parentId))
      throw new Error('La modifica non risulta nella rilettura Base.com. Aggiorna e verifica prima di riprovare.');
    return { simulated: false, categoryId: changedId, categories };
  }
  async function deleteImpact(categoryId) {
    if (!Number.isSafeInteger(categoryId) || categoryId <= 0) throw new Error('ID categoria non valido.');
    const inventories = (await request('getInventories')).inventories;
    if (!Array.isArray(inventories)) throw new Error('Elenco cataloghi Base.com non valido.');
    let atLeast = 0;
    let truncated = false;
    for (const inventory of inventories) {
      const inventoryId = Number(inventory?.inventory_id);
      if (!Number.isSafeInteger(inventoryId) || inventoryId <= 0) throw new Error('ID catalogo Base.com non valido.');
      const response = await request('getInventoryProductsList', {
        inventory_id: inventoryId, filter_category_id: categoryId, page: 1,
      });
      if (!response.products || typeof response.products !== 'object' || Array.isArray(response.products))
        throw new Error('Risposta prodotti Base.com non valida.');
      const count = Object.keys(response.products).length;
      atLeast += count;
      truncated ||= count >= 1000;
    }
    return { atLeast, truncated };
  }
  return { read, mutate, deleteImpact };
}
