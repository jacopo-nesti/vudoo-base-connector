import { fetchVudooXml, prepareVudooCatalog } from './vudooXml.js';
import { runPreflightCheck } from './preflight.js';
import { getVudooBaseFields } from './vudooBaseFields.js';
import { buildBasePayload } from './products.js';
import { runImport } from './importer.js';
import { syncManufacturers } from './productor.js';
import { dryRun, testMode } from './config.js';
import { log } from './logger.js';

export async function loadVudooCatalog(codiceAzienda) {
  const xml = await fetchVudooXml(codiceAzienda);
  log('[VUDOO] Catalogo XML recuperato.');
  const catalog = prepareVudooCatalog(xml);
  log(`[VUDOO] Catalogo validato: ${catalog.products.length} prodotti ricevuti, ${catalog.uniqueProducts.length} SKU unici, ${catalog.products.length - catalog.uniqueProducts.length} duplicati.`);
  log(`[VUDOO] DRY_RUN: ${dryRun}; TEST_MODE: ${testMode}`);
  return catalog;
}

export async function preflightVudooCatalog(codiceAzienda) {
  const catalog = await loadVudooCatalog(codiceAzienda);
  const preflight = await runPreflightCheck(catalog);
  preflight.extraFields = await getVudooBaseFields(preflight.selectedProducts);
  for (const product of preflight.selectedProducts) buildBasePayload(product, preflight);
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
