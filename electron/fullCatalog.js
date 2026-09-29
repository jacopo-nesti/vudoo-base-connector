import {
  prepareFullVudooCatalog, preflightPreparedVudooCatalog,
  importPreparedVudooCatalog, syncPreparedVudooManufacturers,
} from '../src/vudooImport.js';
import { toPreflightResult, toImportResult } from './catalogResults.js';

function requireCatalog(activeCatalog) {
  if (!activeCatalog) throw new Error('Carica prima un catalogo Vudoo.');
  return activeCatalog;
}

export async function preflightFullCatalog(activeCatalog) {
  const prepared = prepareFullVudooCatalog(requireCatalog(activeCatalog));
  return toPreflightResult(await preflightPreparedVudooCatalog(prepared));
}

export async function importFullCatalog(activeCatalog) {
  const prepared = prepareFullVudooCatalog(requireCatalog(activeCatalog));
  return toImportResult(await importPreparedVudooCatalog(prepared));
}

export async function syncFullCatalogManufacturers(activeCatalog) {
  const prepared = prepareFullVudooCatalog(requireCatalog(activeCatalog), { skipMissingSourceCategory: false });
  await syncPreparedVudooManufacturers(prepared);
  return { ok: true };
}
