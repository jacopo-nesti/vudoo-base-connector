import { preflightPreparedVudooCatalog } from '../src/vudooImport.js';
import { toPreflightResult } from './catalogResults.js';
import { prepareEffectiveSelectedCatalog } from './effectiveCatalog.js';

export async function preflightSelectedCatalog(activeCatalog, selectedIds, overrides = {}, companyCode) {
  if (!activeCatalog) throw new Error('Carica un catalogo Vudoo prima del preflight.');
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('Seleziona almeno un prodotto prima del preflight.');
  }

  const startedAt = Date.now();
  const prepared = prepareEffectiveSelectedCatalog(activeCatalog, selectedIds, overrides, companyCode);
  return { ...toPreflightResult(await preflightPreparedVudooCatalog(prepared)),
    durationMs: Math.max(0, Date.now() - startedAt) };
}
