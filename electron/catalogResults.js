export function toPreflightResult(preflight) {
  const categories = preflight.categoryAnalysis;
  const globalCategoryPlans = preflight.categoryPlans ?? [];
  const globalCategoryWarnings = [...new Map(globalCategoryPlans.filter(plan =>
    ['UNRESOLVED_CATEGORY_MAPPING', 'AMBIGUOUS_CATEGORY_MAPPING'].includes(plan.status))
    .map(plan => [plan.path.join(' > '), { status: plan.status, path: plan.path,
      candidates: plan.candidates }])).values()];
  return {
    supplier: {
      id: categories.supplier?.id ?? null,
      sourceTitle: categories.channelTitle ?? null,
    },
    selection: preflight.selection,
    tags: {
      existing: [...new Set((preflight.tagPlans ?? []).flatMap(plan => plan.existing))],
      wouldCreate: [...new Set((preflight.tagPlans ?? []).flatMap(plan => plan.wouldCreate))],
      simulated: (preflight.tagPlans ?? []).some(plan => plan.simulated),
      explicitProducts: preflight.tagPlans?.length ?? 0,
    },
    products: {
      analyzed: categories.totalProducts,
      importable: categories.importableProducts,
      readyForBase: preflight.selectedProducts.length,
      missingSourceCategory: categories.missingSourceCategoryProducts,
      unmappedValidCategory: categories.unmappedValidCategoryProducts,
      withoutBaseCategory: categories.withoutBaseCategoryProducts,
      feedDuplicates: preflight.feedDuplicates,
      eanWarnings: preflight.eanWarningsCount,
    },
    categories: {
      mapped: categories.mappedCount,
      unmapped: categories.unmappedCount,
      globalCount: preflight.globalCategoryIndex?.count ?? null,
      globalMatchedProducts: globalCategoryPlans.filter(plan => plan.status === 'GLOBAL_CATEGORY_MATCH').length,
      globalWarnings: globalCategoryWarnings,
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
    simulatedSkus: result.simulatedSkus,
    feedDuplicates: result.feedDuplicates,
    errors: result.errors,
    errorSkus: result.errorSkus,
    tagErrors: result.tagErrors,
    imageErrors: result.imageErrors,
    uncertainSkus: result.uncertainSkus,
    eanWarningsCount: result.eanWarningsCount,
    categorySummary: result.categorySummary,
    durationMs: result.durationMs,
  };
}
