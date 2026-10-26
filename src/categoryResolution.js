import { nameIdentity } from './names.js';

export const categoryMappingKey = (sourceTitle, sourceCategory) =>
  JSON.stringify([nameIdentity(sourceTitle), nameIdentity(sourceCategory)]);

export function resolveEffectiveBaseCategory({ sourceTitle, sourceCategory, canonicalCategory,
  manualCategory, runtimeMappings = {}, supplier, mappings }) {
  if (manualCategory?.categoryId > 0) return {
    categoryId: manualCategory.categoryId, path: [...manualCategory.path], origin: 'product_override',
    canonicalCategory: canonicalCategory ?? null,
  };
  const runtime = runtimeMappings[categoryMappingKey(sourceTitle ?? '', sourceCategory ?? '')];
  if (runtime?.categoryId > 0) return {
    categoryId: runtime.categoryId, path: [...runtime.path], origin: 'runtime_mapping',
    canonicalCategory: canonicalCategory ?? null,
  };
  const supplierCanonical = supplier?.categories.get(nameIdentity(sourceCategory ?? ''));
  const selectedCanonical = canonicalCategory && mappings.canonical.has(canonicalCategory)
    ? canonicalCategory : supplierCanonical;
  const staticCategory = selectedCanonical && mappings.canonical.get(selectedCanonical);
  if (staticCategory) return { categoryId: null, path: [...staticCategory.basePath],
    origin: selectedCanonical === supplierCanonical ? 'supplier_mapping' : 'canonical',
    canonicalCategory: selectedCanonical };
  return { categoryId: null, path: null, origin: 'unresolved', canonicalCategory: null };
}
