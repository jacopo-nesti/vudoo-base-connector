import { nameIdentity } from './names.js';

export const categoryMappingKey = (sourceTitle, sourceCategory) =>
  JSON.stringify([nameIdentity(sourceTitle), nameIdentity(sourceCategory)]);

// Legacy canonical category system — not used by category resolution V2.
export function resolveEffectiveBaseCategory({ sourceTitle, legacySourceTitle, sourceCategory,
  manualCategory, runtimeMappings = {}, categoryIndex }) {
  const verified = (candidate, origin) => {
    if (!Number.isSafeInteger(candidate?.categoryId) || candidate.categoryId <= 0) return null;
    if (!categoryIndex) return { categoryId: null, path: null,
      origin: 'unverified_category', invalidOrigin: origin, invalidCategoryId: candidate.categoryId };
    const entry = categoryIndex?.byId.get(candidate.categoryId);
    if (categoryIndex && !entry) return { categoryId: null, path: null,
      origin: 'deleted_category', invalidOrigin: origin, invalidCategoryId: candidate.categoryId };
    return { categoryId: candidate.categoryId, path: entry ? [...entry.path] : [...candidate.path], origin };
  };
  const manual = verified(manualCategory, 'product_override');
  if (manual) return manual;
  const runtime = runtimeMappings[categoryMappingKey(sourceTitle ?? '', sourceCategory ?? '')] ??
    (legacySourceTitle ? runtimeMappings[categoryMappingKey(legacySourceTitle, sourceCategory ?? '')] : null);
  return verified(runtime, 'runtime_mapping') ?? { categoryId: null, path: null, origin: 'unresolved' };
}
