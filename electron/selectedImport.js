import { prepareSelectedVudooCatalog, importPreparedVudooCatalog } from '../src/vudooImport.js';

export async function importSelectedCatalog(activeCatalog, selectedIds) {
  if (!activeCatalog) throw new Error('Carica un catalogo Vudoo prima dell’importazione.');
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('Seleziona almeno un prodotto prima dell’importazione.');
  }

  const prepared = prepareSelectedVudooCatalog(activeCatalog, selectedIds);
  const result = await importPreparedVudooCatalog(prepared);

  return {
    ok: result.ok,
    preflightError: result.preflightError,
    read: result.read,
    selected: result.selected,
    processed: result.processed,
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    simulated: result.simulated,
    feedDuplicates: result.feedDuplicates,
    errors: result.errors,
    errorSkus: result.errorSkus,
    uncertainSkus: result.uncertainSkus,
    eanWarningsCount: result.eanWarningsCount,
    categorySummary: result.categorySummary,
  };
}
