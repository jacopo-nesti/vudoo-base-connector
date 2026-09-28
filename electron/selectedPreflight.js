import { prepareSelectedVudooCatalog, preflightPreparedVudooCatalog } from '../src/vudooImport.js';

export async function preflightSelectedCatalog(activeCatalog, selectedIds) {
  if (!activeCatalog) throw new Error('Carica un catalogo Vudoo prima del preflight.');
  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    throw new Error('Seleziona almeno un prodotto prima del preflight.');
  }

  const prepared = prepareSelectedVudooCatalog(activeCatalog, selectedIds);
  const preflight = await preflightPreparedVudooCatalog(prepared);
  const categories = preflight.categoryAnalysis;

  return {
    supplier: {
      id: categories.supplier?.id ?? null,
      sourceTitle: categories.channelTitle ?? null,
    },
    selection: preflight.selection,
    products: {
      analyzed: categories.totalProducts,
      importable: categories.importableProducts,
      readyForBase: preflight.selectedProducts.length,
      missingSourceCategory: categories.missingSourceCategoryProducts,
      unmappedValidCategory: categories.unmappedValidCategoryProducts,
      feedDuplicates: preflight.feedDuplicates,
      eanWarnings: preflight.eanWarningsCount,
    },
    categories: {
      mapped: categories.mappedCount,
      unmapped: categories.unmappedCount,
      entries: categories.entries.map(({ sourceCategory, canonicalCategory, basePath, count, status }) => ({
        sourceCategory,
        canonicalCategory: canonicalCategory ?? null,
        basePath: basePath ?? null,
        count,
        status,
      })),
    },
    base: {
      inventory: preflight.inventory && {
        id: preflight.inventory.inventory_id,
        name: preflight.inventory.name,
      },
      priceGroup: preflight.priceGroup && {
        id: preflight.priceGroup.price_group_id,
        name: preflight.priceGroup.name,
        currency: preflight.priceGroup.currency,
      },
      warehouse: preflight.warehouse && {
        id: preflight.warehouse.id,
        name: preflight.warehouse.name,
      },
    },
  };
}
