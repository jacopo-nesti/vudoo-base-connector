import { normalizeVudooProduct } from '../src/vudooXml.js';
import { normalizeCategory, resolveSupplierProfile } from '../src/categoryNormalizer.js';
import { baseLocalPreflight } from '../src/marketplaces/base/localPreview.js';
import { effectiveProduct, getProductOverride } from './effectiveProduct.js';
import { toCatalogProductDto } from './catalogDto.js';
import { resolveEffectiveBaseCategory } from '../src/categoryResolution.js';

export function projectCatalogForOperator(catalog, mappings, overrides, companyCode, runtimeMappings = {}, categoryIndex) {
  let supplier = null;
  try { supplier = resolveSupplierProfile(catalog.channelTitle, mappings); } catch { /* Visible as pending. */ }
  const rows = catalog.products.map(source => {
    let canonical;
    let normalizationError = null;
    try { canonical = normalizeVudooProduct(source); }
    catch (error) { normalizationError = error.message; canonical = { ...source, source, title: source.title }; }
    const category = normalizeCategory({ supplier, sourceCategory: source.product_type, mappings });
    canonical = { ...canonical, canonical_category: category.canonicalCategory ?? null,
      base_category_path: category.basePath ?? null };
    const overridesForProduct = typeof source.id === 'string' && source.id.trim()
      ? getProductOverride(overrides, companyCode, source.id) : {};
    const manual = Object.fromEntries(Object.entries(overridesForProduct).filter(([key]) =>
      !['base', 'base_category', 'manual_images'].includes(key)));
    const base = overridesForProduct.base ?? {};
    const globalProduct = effectiveProduct(canonical, overridesForProduct);
    const baseProduct = effectiveProduct(canonical, overridesForProduct, 'base');
    const resolved = resolveEffectiveBaseCategory({ sourceTitle: catalog.catalogCode ?? catalog.channelTitle,
      legacySourceTitle: catalog.channelTitle,
      sourceCategory: source.product_type, manualCategory: overridesForProduct.base_category,
      runtimeMappings, categoryIndex });
    baseProduct.category_id = resolved.categoryId;
    baseProduct.base_category_path = resolved.path;
    baseProduct.base_category_origin = resolved.origin;
    const preflight = normalizationError
      ? { marketplace: 'base', status: 'BLOCKING_ERROR', canSend: false,
          counts: { PASS: 0, WARNING: 0, BLOCKING: 1 }, checks: [{ code: 'normalization', field: 'product', marketplace: 'base',
            status: 'BLOCKING', severity: 'error', blocking: true, message: normalizationError,
            currentValue: null, suggestedAction: 'Correggere il feed supplier o il campo indicato.' }] }
      : baseLocalPreflight(baseProduct);
    return toCatalogProductDto(globalProduct, { source, canonical, manual, base, storedOverrides: overridesForProduct, basePreflight: preflight,
      supplier: supplier?.id ?? catalog.channelTitle ?? null,
      baseCategory: resolved });
  });
  const unique = new Set(rows.map(row => row.id).filter(Boolean));
  const counts = {
    total: rows.length, unique: unique.size,
    categories: new Set(rows.map(row => row.sourceCategory).filter(Boolean)).size,
    mappedCategories: new Set(rows.filter(row => row.basePreflight?.checks?.some(check => check.code === 'category' && check.status === 'PASS'))
      .map(row => row.sourceCategory).filter(Boolean)).size,
    unmappedCategories: new Set(rows.filter(row => row.basePreflight?.checks?.some(check => check.code === 'category' && check.status === 'WARNING'))
      .map(row => row.sourceCategory).filter(Boolean)).size,
    missingSourceCategory: rows.filter(row => !row.sourceCategory?.trim()).length,
    importable: rows.filter(row => row.basePreflight?.canSend).length,
    eanPresent: rows.filter(row => row.ean).length,
    eanMissing: rows.filter(row => !row.ean && !row.provenance?.ean?.source).length,
    eanInvalid: rows.filter(row => row.basePreflight?.checks?.some(check => check.code === 'ean' && check.status !== 'PASS')).length,
    imageMissing: rows.filter(row => !row.imageLink).length,
    duplicateIds: rows.length - unique.size,
    missingRequired: rows.filter(row => row.basePreflight?.status === 'MISSING_REQUIRED_DATA').length,
    blocking: rows.filter(row => !row.basePreflight?.canSend).length,
    warnings: rows.reduce((count, row) => count + (row.basePreflight?.counts?.WARNING ?? 0), 0),
  };
  return { rows, quality: counts };
}
