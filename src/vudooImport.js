import { fetchVudooXml, prepareVudooCatalog } from './vudooXml.js';
import { runPreflightCheck } from './preflight.js';
import { getVudooBaseFields } from './vudooBaseFields.js';
import { buildBasePayload } from './products.js';
import { runImport } from './importer.js';
import { syncManufacturers } from './productor.js';
import { dryRun, testMode, getUnmappedCategoryPolicy } from './config.js';
import { log } from './logger.js';
import {
  loadCategoryMappings,
  analyzeCatalogCategories,
  formatCategoryReport,
  formatUnmappedCategoryError,
  createSupplierDraft,
} from './categoryNormalizer.js';
import { recordNoNameProducts, noNameReportPath } from './noNameReport.js';

export async function loadVudooCatalog(codiceAzienda, options) {
  const xml = await fetchVudooXml(codiceAzienda);
  log('[VUDOO] Catalogo XML recuperato.');
  const catalog = prepareVudooCatalog(xml, options);
  const duplicates = [...catalog.duplicatesMap.values()].reduce((total, count) => total + count - 1, 0);
  log(`[VUDOO] Catalogo validato: ${catalog.products.length} prodotti ricevuti, ${catalog.uniqueProducts.length} SKU unici, ${duplicates} duplicati.`);
  if (catalog.eanWarnings.length) {
    log(`[WARNING EAN] ${catalog.eanWarnings.length} valori non validi omessi dal payload Base.com.`);
    for (const warning of catalog.eanWarnings.slice(0, 5)) log(`[WARNING EAN] ${JSON.stringify(warning)}`);
    if (catalog.eanWarnings.length > 5) log(`[WARNING EAN] Altri ${catalog.eanWarnings.length - 5} warning non mostrati.`);
  }
  log(`[VUDOO] DRY_RUN: ${dryRun}; TEST_MODE: ${testMode}`);
  return catalog;
}

export async function preflightVudooCatalog(codiceAzienda) {
  const categoryPolicy = getUnmappedCategoryPolicy();
  const catalog = await loadVudooCatalog(codiceAzienda, { skipMissingSourceCategory: true });
  const mappings = await loadCategoryMappings();
  const categories = analyzeCatalogCategories(catalog, mappings);
  categories.policy = categoryPolicy;
  log(`\n${formatCategoryReport(categories)}`);
  log(`Policy categorie non mappate: ${categoryPolicy.toUpperCase()}`);
  log(`Prodotti esclusi per categoria reale non mappata: ${categories.unmappedValidCategoryProducts}\n`);

  if (categories.supplierError) {
    if (!catalog.channelTitle?.trim()) throw new Error(`IMPORT BLOCCATO: ${categories.supplierError} Impostare channel.title nel feed Vudoo.`);
    const draft = await createSupplierDraft(categories, undefined, mappings);
    if (categories.missingProducts.length) {
      const recorded = await recordNoNameProducts(categories.missingProducts, draft.draft.supplier_id, catalog.channelTitle);
      if (recorded) log(`Prodotti senza categoria registrati in: ${noNameReportPath}`);
    }
    throw new Error(`IMPORT BLOCCATO: nuovo supplier "${catalog.channelTitle}". ${draft.created ? 'Bozza generata' : 'Bozza già presente'}: ${draft.file}. Categorie da configurare: ${categories.entries.length}. Compila i mapping verso categorie canoniche e ripeti il preflight.`);
  }

  if (categories.missingProducts.length) {
    const recorded = await recordNoNameProducts(categories.missingProducts, categories.supplier.id, catalog.channelTitle);
    if (recorded) log(`Prodotti senza categoria registrati in: ${noNameReportPath}`);
  }
  if (categoryPolicy === 'block' && categories.unmappedCount > 0) {
    throw new Error(formatUnmappedCategoryError(categories, categoryPolicy));
  }
  const mappedProducts = categories.mappedProducts;
  const mappedCatalog = {
    ...catalog,
    products: mappedProducts,
    uniqueProducts: categories.mappedUniqueProducts,
    categoryAnalysis: categories,
  };
  const preflight = mappedProducts.length > 0
    ? await runPreflightCheck(mappedCatalog)
    : {
        inventory: null,
        priceGroup: null,
        warehouse: null,
        products: [],
        selectedProducts: [],
        feedDuplicates: 0,
        normalizedProducts: true,
      };
  preflight.categoryAnalysis = categories;
  preflight.eanWarningsCount = catalog.eanWarnings.length;
  if (preflight.selectedProducts.length > 0) {
    preflight.extraFields = await getVudooBaseFields(preflight.selectedProducts);
    for (const product of preflight.selectedProducts) buildBasePayload(product, preflight);
  }
  log(`[VUDOO] Preflight completato: ${preflight.selectedProducts.length} prodotti selezionati.`);
  return preflight;
}

export async function syncVudooManufacturers(codiceAzienda) {
  const catalog = await loadVudooCatalog(codiceAzienda);
  await syncManufacturers(catalog.uniqueProducts);
  return 0;
}

export async function importVudooCatalog(codiceAzienda) {
  const preflight = await preflightVudooCatalog(codiceAzienda);
  return await runImport(preflight);
}
