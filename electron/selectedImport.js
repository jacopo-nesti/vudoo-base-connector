import { importPreparedVudooCatalog } from '../src/vudooImport.js';
import { toImportResult } from './catalogResults.js';
import { prepareEffectiveSelectedCatalog } from './effectiveCatalog.js';

export async function importSelectedCatalog(activeCatalog, selectedIds, overrides = {}, companyCode) {
  if (!activeCatalog) throw new Error('Carica un catalogo Vudoo prima dell’importazione.');
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('Seleziona almeno un prodotto prima dell’importazione.');
  }

  const startedAt = Date.now();
  const prepared = prepareEffectiveSelectedCatalog(activeCatalog, selectedIds, overrides, companyCode);
  return { ...toImportResult(await importPreparedVudooCatalog(prepared)),
    durationMs: Math.max(0, Date.now() - startedAt) };
}
