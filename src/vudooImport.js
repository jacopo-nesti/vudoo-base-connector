import { fetchVudooXml, prepareParsedVudooCatalog } from './vudooXml.js';
import { parseCatalog } from './converter.js';
import { runPreflightCheck } from './preflight.js';
import { getVudooBaseFields } from './vudooBaseFields.js';
import { buildBasePayload } from './products.js';
import { runImport } from './importer.js';
import { syncManufacturers } from './productor.js';
import { dryRun, testMode, getUnmappedCategoryPolicy, getVudooResultsConfig, getVudooTimeoutConfig } from './config.js';
import { log } from './logger.js';
import {
  loadCategoryMappings,
  analyzeCatalogCategories,
  formatCategoryReport,
  formatUnmappedCategoryError,
  createSupplierDraft,
} from './categoryNormalizer.js';
import { recordNoNameProducts, noNameReportPath } from './noNameReport.js';
import { sourceIdentity, selectedProducts, selectionSummary } from './productSelector.js';

export async function loadVudooCatalog(codiceAzienda, options = {}) {
  const results = getVudooResultsConfig();
  const timeout = getVudooTimeoutConfig();
  if (results.invalid) log(`[VUDOO] WARNING: VUDOO_RESULTS_LIMIT non valido: uso il default di ${results.limit}.`);
  if (timeout.invalid) log(`[VUDOO] VUDOO_TIMEOUT_MS non valido: uso il default di ${timeout.ms} ms.`);
  log(`\n[VUDOO - FETCH]\nLimite risultati configurato: ${results.limit}\nTimeout configurato: ${timeout.ms} ms`);
  const started = Date.now();
  const xml = await fetchVudooXml(codiceAzienda, results.limit, timeout.ms);
  const duration = ((Date.now() - started) / 1000).toFixed(2);
  const size = (Buffer.byteLength(xml, 'utf8') / 1000000).toFixed(2);
  const parsed = parseCatalog(xml);
  log(`Catalogo XML recuperato.\nDurata: ${duration} s\nDimensione XML: ${size} MB\nProdotti ricevuti: ${parsed.products.length}`);
  const requestedSources = options.selectSources ? await options.selectSources(parsed.products) : parsed.products;
  if (requestedSources === null) return null;
  const sourceSet = new Set(parsed.products);
  if (!Array.isArray(requestedSources) || requestedSources.some(source => !sourceSet.has(source))) {
    throw new Error('Selezione prodotti non valida.');
  }
  // Conserva tutti i record di un g:id scelto: la deduplicazione deve rilevare eventuali conflitti.
  const selectedSources = selectedProducts(parsed.products, new Set(requestedSources.map(sourceIdentity)));
  const catalog = prepareParsedVudooCatalog({ ...parsed, products: selectedSources }, options);
  catalog.selection = selectionSummary(parsed.products, new Set(selectedSources.map(sourceIdentity)));
  const duplicates = [...catalog.duplicatesMap.values()].reduce((total, count) => total + count - 1, 0);
  log(`\n[VUDOO - CATALOGO]\nProdotti elaborati: ${catalog.products.length}\nSKU unici: ${catalog.uniqueProducts.length}\nDuplicati nel feed: ${duplicates}\nDRY_RUN: ${dryRun}; TEST_MODE: ${testMode}`);
  if (catalog.eanWarnings.length) {
    log(`[WARNING EAN] ${catalog.eanWarnings.length} valori non validi omessi dal payload Base.com.`);
    for (const warning of catalog.eanWarnings.slice(0, 5)) log(`[WARNING EAN] ${JSON.stringify(warning)}`);
    if (catalog.eanWarnings.length > 5) log(`[WARNING EAN] Altri ${catalog.eanWarnings.length - 5} warning non mostrati.`);
  }
  return catalog;
}

export async function preflightVudooCatalog(codiceAzienda, options = {}) {
  const categoryPolicy = getUnmappedCategoryPolicy();
  const catalog = await loadVudooCatalog(codiceAzienda, { ...options, skipMissingSourceCategory: true });
  if (catalog === null) return null;
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
    if (!draft.created) {
      throw new Error(`IMPORT BLOCCATO: nuovo supplier "${catalog.channelTitle}". File già presente e non modificato: ${draft.file}. Verifica i mapping e ripeti il preflight.`);
    }
    const autoMapped = draft.stats.supplier + draft.stats.canonical;
    throw new Error(`IMPORT BLOCCATO: nuovo supplier "${catalog.channelTitle}".\nCategorie reali trovate: ${Object.keys(draft.draft.categories).length}\nAuto-mappate con certezza: ${autoMapped} (supplier: ${draft.stats.supplier}, base_path canonico: ${draft.stats.canonical})\nDa configurare manualmente: ${draft.stats.manual}\nFile creato: ${draft.file}\nVerifica i mapping, completa quelli null e ripeti il preflight.`);
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
  preflight.selection = catalog.selection;
  preflight.eanWarningsCount = catalog.eanWarnings.length;
  if (preflight.selectedProducts.length > 0) {
    preflight.extraFields = await getVudooBaseFields(preflight.selectedProducts);
    for (const product of preflight.selectedProducts) buildBasePayload(product, preflight);
  }
  log(`[VUDOO] Preflight completato: ${preflight.selectedProducts.length} prodotti selezionati.`);
  return preflight;
}

export async function syncVudooManufacturers(codiceAzienda, options = {}) {
  const catalog = await loadVudooCatalog(codiceAzienda, options);
  await syncManufacturers(catalog.uniqueProducts);
  return 0;
}

export async function importVudooCatalog(codiceAzienda, options = {}) {
  const preflight = await preflightVudooCatalog(codiceAzienda, options);
  if (preflight === null) return 0;
  return await runImport(preflight);
}
