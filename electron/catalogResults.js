export function toPreflightResult(preflight) {
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

export function toImportResult(result) {
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
    durationMs: result.durationMs,
  };
}
