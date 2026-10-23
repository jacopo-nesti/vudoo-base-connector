import { token, testMode, dryRun } from './config.js';
import { log, redactToken } from './logger.js';
import {
  sendProductToBase, findProductInBase, getBaseProductDetails, updateProductInBase,
  getBaseProductSummaries, getBaseProductsData, callBase,
} from './baseApi.js';
import { createInventoryTagService } from './inventoryTags.js';
import { normalizeProduct, buildBasePayload, hasProductChanged, assertVudooSkuCompatibility, planManualImageData } from './products.js';
import { getManufacturerMap, ensureManufacturer } from './manufacturers.js';
import { getGlobalCategoryIndex, resolveGlobalCategoryPath } from './categories.js';
import { runPreflightCheck } from './preflight.js';

export const BULK_LOOKUP_THRESHOLD = 50;

export async function runImport(prepared) {
  const startedAt = Date.now();
  log('[DEBUG] Avvio script');

  let config = {};
  let read = 0;
  let processed = 0;
  let skipped = 0;
  let created = 0;
  let updated = 0;
  let simulated = 0;
  let selectedCount = 0;
  let errors = 0;
  let feedDuplicates = 0;
  const errorSkus = [];
  const tagErrors = [];
  const imageErrors = [];
  const simulatedSkus = [];
  const uncertainSkus = [];
  let warehouseStatus = 'non selezionato';
  let preflightError = null;

  // FASE PREFLIGHT: Esecuzione controlli preliminari
  let preflightData;
  const result = () => ({
    ok: preflightError === null && errors === 0 && uncertainSkus.length === 0,
    preflightError,
    read,
    selected: selectedCount,
    processed,
    created,
    updated,
    unchanged: skipped,
    simulated,
    simulatedSkus: [...simulatedSkus],
    feedDuplicates,
    errors,
    errorSkus: [...errorSkus],
    tagErrors: [...tagErrors],
    imageErrors: [...imageErrors],
    uncertainSkus: [...uncertainSkus],
    eanWarningsCount: preflightData?.eanWarningsCount ?? 0,
    categorySummary: preflightData?.categoryAnalysis ? {
      totalFeedProducts: preflightData.categoryAnalysis.totalProducts,
      importableProducts: preflightData.categoryAnalysis.importableProducts,
      missingSourceCategoryProducts: preflightData.categoryAnalysis.missingSourceCategoryProducts,
      missingSourceCategoryUnrecordableProducts: preflightData.categoryAnalysis.missingSourceCategoryUnrecordableProducts,
      unmappedValidCategoryProducts: preflightData.categoryAnalysis.unmappedValidCategoryProducts,
      withoutBaseCategoryProducts: preflightData.categoryAnalysis.withoutBaseCategoryProducts,
      unmappedCategories: preflightData.categoryAnalysis.unmappedCount,
    } : null,
    durationMs: Math.max(0, Date.now() - startedAt),
  });
  try {
    preflightData = prepared ?? await runPreflightCheck();
  } catch (error) {
    log(`ERROR [PREFLIGHT]: ${error.message}`);
    preflightError = redactToken(error.message);
    return result(); // Interrompe il processo ed evita qualsiasi scrittura/elaborazione
  }

  // Assegnazione risorse già convalidate dal Preflight Check
  config.inventory = preflightData.inventory;
  config.priceGroup = preflightData.priceGroup;
  config.warehouse = preflightData.warehouse;
  config.extraFields = preflightData.extraFields;
  feedDuplicates = preflightData.feedDuplicates;

  if (!config.warehouse) {
    warehouseStatus = 'non necessario';
  }

  try {
    const products = preflightData.products;
    read = products.length;
    const selected = preflightData.selectedProducts;
    selectedCount = selected.length;
    const tagService = createInventoryTagService({ request: callBase, isSimulation: () => dryRun === 'true',
      initialTags: preflightData.tagInventory });

    // Recupero mappe Categorie e Produttori
    const mfgMap = selected.length > 0 ? await getManufacturerMap() : new Map();
    const globalCategoryIndex = preflightData.globalCategoryIndex ??
      (selected.some(product => product?.base_category_path?.length) ? await getGlobalCategoryIndex() : null);

    let productsBySku = null;
    let detailsById = null;
    if (selected.length >= BULK_LOOKUP_THRESHOLD) {
      productsBySku = await getBaseProductSummaries(config.inventory.inventory_id);
      const matchedIds = selected.flatMap(product => {
        const summary = productsBySku.get(product.sku ?? product.id);
        return summary ? [summary.product_id] : [];
      });
      detailsById = await getBaseProductsData(config.inventory.inventory_id, matchedIds);
    }

    // Ciclo sui prodotti
    for (const sourceProduct of selected) {
      processed++;
      log(`\nImportazione ${sourceProduct?.id ?? '(SKU assente)'}...`);
      try {
        const product = preflightData.normalizedProducts ? { ...sourceProduct } : normalizeProduct(sourceProduct);
        buildBasePayload(product, config);

        if (productsBySku?.has(product.sku) && productsBySku.get(product.sku) === null) {
          throw new Error(`SKU ${product.sku} ambiguo: piu prodotti presenti nel catalogo.`);
        }
        let existingProduct = productsBySku
          ? productsBySku.get(product.sku) ?? null
          : await findProductInBase(product.sku, config.inventory.inventory_id);
        // A snapshot can become stale while an import runs. Recheck missing SKUs before CREATE.
        if (productsBySku && !existingProduct) {
          existingProduct = await findProductInBase(product.sku, config.inventory.inventory_id);
        }
        const existingDetails = existingProduct
          ? detailsById?.get(existingProduct.product_id) ??
            await getBaseProductDetails(config.inventory.inventory_id, existingProduct.product_id)
          : null;

        if (existingDetails && existingDetails.sku !== product.sku) {
          throw new Error('SKU del dettaglio Base.com non corrispondente.');
        }
        if (existingDetails) assertVudooSkuCompatibility(product, existingDetails);

        if (product.manual_images?.length && preflightData.resolveManualImages) {
          const pending = await preflightData.resolveManualImages(product, existingDetails,
            existingProduct?.product_id ?? null);
          product.manual_image_data = planManualImageData(product, existingDetails, pending);
        }

        const tagPlan = await tagService.ensureInventoryTags(product.tags, { allowCreate: true });
        if (tagPlan.names !== undefined) product.tags = tagPlan.names;
        if (tagPlan.wouldCreate.length) log(`[DRY_RUN] Product Tags da creare: ${tagPlan.wouldCreate.join(', ')}`);

        const categoryPath = product.base_category_path;
        const categoryPlan = resolveGlobalCategoryPath(categoryPath, globalCategoryIndex);
        const categoryId = categoryPlan.categoryId;
        if (categoryPath?.length && categoryId == null) {
          log(`[WARNING CATEGORIA] ${categoryPlan.status}: ${categoryPath.join(' > ')}; category_id omesso.`);
        }
        const manufacturerId = await ensureManufacturer(product.brand, mfgMap);

        delete product.category_id;
        if (categoryId != null) product.category_id = categoryId;
        if (manufacturerId != null) product.manufacturer_id = manufacturerId;

        const pendingReferences = dryRun === 'true' &&
          (((Array.isArray(categoryPath) ? categoryPath.length > 0 : categoryPath?.trim()) && categoryId == null)
            || (product.brand?.trim() && manufacturerId == null));

        if (existingProduct) {
          if (hasProductChanged(product, existingDetails, config)) {
            log(`Rilevate modifiche per SKU ${product.sku}. Procedo con l'aggiornamento...`);
            const result = await updateProductInBase(existingProduct.product_id, product, config, existingDetails);
            if (!result) {
              simulated++;
              simulatedSkus.push(product.sku);
              continue;
            }
            updated++;
            if (product.manual_image_data?.length) await preflightData.onManualImagesUploaded?.(
              product, existingProduct.product_id, product.manual_image_data);
            log(`SUCCESS (Aggiornato) - product_id: ${existingProduct.product_id}`);
          } else {
            if (pendingReferences) {
              simulated++;
              simulatedSkus.push(product.sku);
              continue;
            }
            skipped++;
            log(`SKIPPED - SKU ${product.sku} già presente e nessun dato modificato`);
          }
          continue;
        }

        const result = await sendProductToBase(product, config);
        if (!result) {
          simulated++;
          simulatedSkus.push(product.sku);
          continue;
        }
        created++;
        if (product.manual_image_data?.length) await preflightData.onManualImagesUploaded?.(
          product, result.product_id, product.manual_image_data);
        log(`SUCCESS (Creato) - product_id: ${result.product_id}`);

      } catch (error) {
        if (error.uncertain) {
          uncertainSkus.push(sourceProduct?.id ?? '(SKU assente)');
          log(`[UNCERTAIN] ${error.message}`);
          continue;
        }
        errors++;
        errorSkus.push(sourceProduct?.id ?? '(SKU assente)');
        if (error.code?.startsWith('TAG_')) tagErrors.push({
          sku: sourceProduct?.id ?? '(SKU assente)', code: error.code,
          tagName: error.tagName ?? null, message: redactToken(error.message),
        });
        if (['IMAGE_FILE_MISSING', 'INVALID_IMAGE', 'OPTIMIZATION_FAILED'].includes(error.code)) {
          imageErrors.push({ sku: sourceProduct?.id ?? '(SKU assente)', code: error.code,
            message: redactToken(error.message) });
        }
        log(`ERROR: ${error.message}`);
      }
    }
  } catch (error) {
    errors++;
    log(`ERROR: ${error.message}`);
  } finally {
    const { inventory, priceGroup, warehouse } = config;
    log(`\n[RISULTATO IMPORT]\nInventory: ${inventory ? `${inventory.name} (${inventory.inventory_id})` : 'non selezionato'}`);
    log(`Gruppo prezzi: ${priceGroup ? `${priceGroup.name} (${priceGroup.price_group_id}, ${priceGroup.currency})` : 'non selezionato'}`);
    log(`Warehouse: ${warehouse ? `${warehouse.name} (${warehouse.id})` : warehouseStatus}`);
    log(`Prodotti letti: ${read}\nProdotti selezionati: ${selectedCount}\nProdotti processati: ${processed}\nCreati: ${created}\nAggiornati: ${updated}\nSaltati perché invariati: ${skipped}\nDuplicati nel feed saltati: ${feedDuplicates}\nSimulati: ${simulated}\nErrori: ${errors}`);
    if (preflightData?.categoryAnalysis) {
      const categories = preflightData.categoryAnalysis;
      log(`Prodotti totali feed: ${categories.totalProducts}`);
      log(`Prodotti importabili: ${categories.importableProducts}`);
      log(`Prodotti con categoria sorgente mancante: ${categories.missingSourceCategoryProducts}`);
      log(`Prodotti senza categoria non registrabili (g:id mancante): ${categories.missingSourceCategoryUnrecordableProducts}`);
      log(`Senza categoria Base.com: ${categories.withoutBaseCategoryProducts}`);
      log(`Categorie reali non mappate: ${categories.unmappedCount}`);
      for (const entry of categories.entries.filter(entry => !entry.mapped)) {
        log(`${entry.sourceCategory} → ${entry.count} prodotti senza categoria Base.com`);
      }
      if (categories.missingSourceCategoryProducts > categories.missingSourceCategoryUnrecordableProducts) {
        log('Prodotti senza categoria registrati in: reports/no_name_products.json');
      }
    }
    if (preflightData?.eanWarningsCount) log(`EAN non validi omessi: ${preflightData.eanWarningsCount}`);
    if (errorSkus.length) log(`SKU con errori: ${errorSkus.join(', ')}`);
    log(`Esiti incerti: ${uncertainSkus.length}`);
    if (uncertainSkus.length) log(`SKU con esito incerto: ${uncertainSkus.join(', ')}`);
  }
  return result();
}
