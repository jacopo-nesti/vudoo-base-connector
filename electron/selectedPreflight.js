import { prepareSelectedVudooCatalog, preflightPreparedVudooCatalog } from '../src/vudooImport.js';
import { toPreflightResult } from './catalogResults.js';

export async function preflightSelectedCatalog(activeCatalog, selectedIds) {
  if (!activeCatalog) throw new Error('Carica un catalogo Vudoo prima del preflight.');
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('Seleziona almeno un prodotto prima del preflight.');
  }

  const prepared = prepareSelectedVudooCatalog(activeCatalog, selectedIds);
  return toPreflightResult(await preflightPreparedVudooCatalog(prepared));
}
