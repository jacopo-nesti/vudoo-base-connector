import { prepareFullVudooCatalog, prepareSelectedVudooCatalog } from '../src/vudooImport.js';
import { applyProductOverrides } from './effectiveProduct.js';

export function prepareEffectiveFullCatalog(activeCatalog, overrides = {}, companyCode, options, runtimeMappings = {}) {
  return { ...applyProductOverrides(prepareFullVudooCatalog(activeCatalog, options), overrides, companyCode),
    catalogCode: companyCode, runtimeCategoryMappings: runtimeMappings };
}

export function prepareEffectiveSelectedCatalog(activeCatalog, selectedIds, overrides = {}, companyCode, runtimeMappings = {}) {
  return { ...applyProductOverrides(prepareSelectedVudooCatalog(activeCatalog, selectedIds), overrides, companyCode),
    catalogCode: companyCode, runtimeCategoryMappings: runtimeMappings };
}
