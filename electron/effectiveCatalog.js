import { prepareFullVudooCatalog, prepareSelectedVudooCatalog } from '../src/vudooImport.js';
import { applyProductOverrides } from './effectiveProduct.js';

export function prepareEffectiveFullCatalog(activeCatalog, overrides = {}, companyCode, options) {
  return applyProductOverrides(prepareFullVudooCatalog(activeCatalog, options), overrides, companyCode);
}

export function prepareEffectiveSelectedCatalog(activeCatalog, selectedIds, overrides = {}, companyCode) {
  return applyProductOverrides(prepareSelectedVudooCatalog(activeCatalog, selectedIds), overrides, companyCode);
}
