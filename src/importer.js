import { token, testMode, dryRun } from './config.js';
import { log } from './logger.js';
import { sendProductToBase, findProductInBase, getBaseProductDetails, updateProductInBase } from './baseApi.js';
import { normalizeProduct, buildBasePayload, hasProductChanged, assertVudooSkuCompatibility } from './products.js';
import { getManufacturerMap, ensureManufacturer } from './manufacturers.js';
import { getCategoryMap, ensureCategoryPath } from './categories.js';
import { runPreflightCheck } from './preflight.js';

export async function runImport(prepared) {
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
  const uncertainSkus = [];
  let warehouseStatus = 'non selezionato';

  // FASE PREFLIGHT: Esecuzione controlli preliminari
  let preflightData;
  try {
    preflightData = prepared ?? await runPreflightCheck();
  } catch (error) {
    log(`ERROR [PREFLIGHT]: ${error.message}`);
    process.exitCode = 1;
    return 1; // Interrompe il processo ed evita qualsiasi scrittura/elaborazione
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

    // Recupero mappe Categorie e Produttori
    const mfgMap = selected.length > 0 ? await getManufacturerMap() : new Map();
    const categoryMap = selected.length > 0 && selected.some(product => product?.base_category_path?.length || product?.product_type)
      ? await getCategoryMap(config.inventory.inventory_id)
      : new Map();

    // Ciclo sui prodotti
    for (const sourceProduct of selected) {
      processed++;
      log(`\nImportazione ${sourceProduct?.id ?? '(SKU assente)'}...`);
      try {
        const product = preflightData.normalizedProducts ? { ...sourceProduct } : normalizeProduct(sourceProduct);
        buildBasePayload(product, config);

        const existingProduct = await findProductInBase(product.sku, config.inventory.inventory_id);
        const existingDetails = existingProduct
          ? await getBaseProductDetails(config.inventory.inventory_id, existingProduct.product_id)
          : null;

        if (existingDetails && existingDetails.sku !== product.sku) {
          throw new Error('SKU del dettaglio Base.com non corrispondente.');
        }
        if (existingDetails) assertVudooSkuCompatibility(product, existingDetails);

        const categoryPath = product.base_category_path ?? product.product_type;
        const categoryId = await ensureCategoryPath(categoryPath, config.inventory.inventory_id, categoryMap);
        const manufacturerId = await ensureManufacturer(product.brand, mfgMap);

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
              continue;
            }
            updated++;
            log(`SUCCESS (Aggiornato) - product_id: ${existingProduct.product_id}`);
          } else {
            if (pendingReferences) {
              simulated++;
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
          continue;
        }
        created++;
        log(`SUCCESS (Creato) - product_id: ${result.product_id}`);

      } catch (error) {
        if (error.uncertain) {
          uncertainSkus.push(sourceProduct?.id ?? '(SKU assente)');
          log(`[UNCERTAIN] ${error.message}`);
          continue;
        }
        errors++;
        errorSkus.push(sourceProduct?.id ?? '(SKU assente)');
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
      log(`Prodotti esclusi per categoria sorgente mancante: ${categories.missingSourceCategoryProducts}`);
      log(`Prodotti senza categoria non registrabili (g:id mancante): ${categories.missingSourceCategoryUnrecordableProducts}`);
      log(`Esclusi categoria non mappata: ${categories.unmappedValidCategoryProducts}`);
      log(`Categorie reali non mappate: ${categories.unmappedCount}`);
      for (const entry of categories.entries.filter(entry => !entry.mapped)) {
        log(`${entry.sourceCategory} → ${entry.count} prodotti esclusi`);
      }
      if (categories.missingSourceCategoryProducts > categories.missingSourceCategoryUnrecordableProducts) {
        log('Prodotti senza categoria registrati in: reports/no_name_products.json');
      }
    }
    if (preflightData?.eanWarningsCount) log(`EAN non validi omessi: ${preflightData.eanWarningsCount}`);
    if (errorSkus.length) log(`SKU con errori: ${errorSkus.join(', ')}`);
    log(`Esiti incerti: ${uncertainSkus.length}`);
    if (uncertainSkus.length) log(`SKU con esito incerto: ${uncertainSkus.join(', ')}`);
    if (errors > 0 || uncertainSkus.length > 0) process.exitCode = 1;
  }
  return errors > 0 || uncertainSkus.length > 0 ? 1 : 0;
}
