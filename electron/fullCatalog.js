import {
  prepareFullVudooCatalog, preflightPreparedVudooCatalog,
  importPreparedVudooCatalog, syncPreparedVudooManufacturers,
} from '../src/vudooImport.js';
import { toPreflightResult, toImportResult } from './catalogResults.js';
import { prepareEffectiveFullCatalog } from './effectiveCatalog.js';

function requireCatalog(activeCatalog) {
  if (!activeCatalog) throw new Error('Carica prima un catalogo Vudoo.');
  return activeCatalog;
}

export async function preflightFullCatalog(activeCatalog, overrides = {}, companyCode) {
  const startedAt = Date.now();
  const prepared = prepareEffectiveFullCatalog(requireCatalog(activeCatalog), overrides, companyCode);
  return { ...toPreflightResult(await preflightPreparedVudooCatalog(prepared)),
    durationMs: Math.max(0, Date.now() - startedAt) };
}

export async function importFullCatalog(activeCatalog, overrides = {}, companyCode) {
  const startedAt = Date.now();
  const prepared = prepareEffectiveFullCatalog(requireCatalog(activeCatalog), overrides, companyCode);
  return { ...toImportResult(await importPreparedVudooCatalog(prepared)),
    durationMs: Math.max(0, Date.now() - startedAt) };
}

export async function syncFullCatalogManufacturers(activeCatalog) {
  const prepared = prepareFullVudooCatalog(requireCatalog(activeCatalog), { skipMissingSourceCategory: false });
  await syncPreparedVudooManufacturers(prepared);
  return { ok: true };
}
