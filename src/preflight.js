import { token, testMode, dryRun } from './config.js';
import { callBase, getBaseInventory, getBasePriceGroup, getBaseWarehouse } from './baseApi.js';
import { getProducts, detectAndFilterDuplicates, normalizeProduct } from './products.js';
import { createInventoryTagService, normalizeInventoryTagNames } from './inventoryTags.js';
import { getGlobalCategoryIndex, resolveProductGlobalCategory } from './categories.js';
import { log } from './logger.js';

export async function runPreflightCheck(catalog) {
  log('\n[PREFLIGHT]\nAvvio controlli preliminari...');

  // 1. Verifica token e flag di configurazione
  if (!token) {
    throw new Error('[PREFLIGHT] Credenziali Base.com non configurate nel runtime.');
  }

  if (!['true', 'false'].includes(testMode) || !['true', 'false'].includes(dryRun)) {
    throw new Error('[PREFLIGHT] TEST_MODE e DRY_RUN devono essere impostati su "true" oppure "false".');
  }

  // 2. Lettura e validazione catalogo
  let rawProducts;
  try {
    rawProducts = catalog ? catalog.products : await getProducts();
  } catch (error) {
    throw new Error(`[PREFLIGHT] Il catalogo locale real_products.json non è presente o non è leggibile. Usa il flusso Vudoo remoto oppure esegui npm run convert per l'utility legacy.`);
  }

  if (!Array.isArray(rawProducts) || rawProducts.length === 0) {
    throw new Error('[PREFLIGHT] Il catalogo è vuoto o non contiene prodotti validi.');
  }

  // 3. Selezione prodotti e filtro duplicati preliminare
  const candidates = testMode === 'true' ? rawProducts.slice(0, 1) : rawProducts;
  const deduplicated = catalog ?? detectAndFilterDuplicates(candidates);
  const { duplicatesMap } = deduplicated;
  const uniqueProducts = catalog && testMode === 'true' ? catalog.uniqueProducts.slice(0, 1) : deduplicated.uniqueProducts;
  // Reject invalid tags before any later resource creation in the import path.
  for (const product of uniqueProducts) normalizeInventoryTagNames(product?.tags);

  let feedDuplicates = 0;
  if (duplicatesMap && typeof duplicatesMap.values === 'function') {
    for (const count of duplicatesMap.values()) {
      feedDuplicates += count - 1;
    }
  }

  // 4. Verifica risorse Base.com: Inventory di default e Price Group
  const inventory = await getBaseInventory(catalog?.baseInventoryId);
  if (!inventory) {
    throw new Error('[PREFLIGHT] Impossibile recuperare l\'inventory Default su Base.com.');
  }

  const priceGroup = await getBasePriceGroup(inventory);
  if (!priceGroup) {
    throw new Error('[PREFLIGHT] Price group necessario non trovato su Base.com.');
  }

  // 5. Verifica Warehouse SOLO quando richiesto dallo stock dei prodotti
  let warehouse = null;
  const requiresWarehouse = uniqueProducts.some(product => {
    if (catalog) return product.quantity != null;
    try {
      return normalizeProduct(product).quantity != null;
    } catch {
      return product?.quantity != null;
    }
  });

  if (requiresWarehouse) {
    warehouse = await getBaseWarehouse(inventory);
    if (!warehouse) {
      throw new Error('[PREFLIGHT] Warehouse necessario per la gestione dello stock ma non disponibile su Base.com.');
    }
  }

  const tagService = createInventoryTagService({ request: callBase, isSimulation: () => dryRun === 'true' });
  const tagPlans = [];
  for (const product of uniqueProducts) {
    if (product?.tags == null) continue;
    const plan = await tagService.ensureInventoryTags(product.tags);
    tagPlans.push({ productId: product.id, ...plan,
      status: plan.wouldCreate.length ? plan.simulated ? 'TAG_SIMULATED_CREATE' : 'TAG_MISSING_WILL_CREATE' : 'TAG_EXISTING' });
  }
  const globalCategoryIndex = catalog?.globalCategoryIndex ?? (uniqueProducts.some(product =>
    product?.base_category_path?.length || product?.category_id) ? await getGlobalCategoryIndex() : null);
  const categoryPlans = uniqueProducts.map(product => ({ productId: product.id,
    ...resolveProductGlobalCategory(product, globalCategoryIndex) }));
  for (const plan of new Map(categoryPlans.filter(plan =>
    plan.status === 'AMBIGUOUS_CATEGORY_MAPPING' || plan.status === 'UNRESOLVED_CATEGORY_MAPPING')
    .map(plan => [plan.path.join(' > '), plan])).values()) {
    log(`[WARNING CATEGORIA] ${plan.status}: ${plan.path.join(' > ')}; category_id omesso.`);
  }

  log('[PREFLIGHT] Controlli preliminari completati con successo! ✅\n');

  return {
    inventory,
    priceGroup,
    warehouse,
    products: rawProducts,
    selectedProducts: uniqueProducts,
    feedDuplicates,
    normalizedProducts: Boolean(catalog),
    tagPlans,
    tagInventory: tagService.snapshot(),
    categoryPlans,
    globalCategoryIndex,
  };
}
