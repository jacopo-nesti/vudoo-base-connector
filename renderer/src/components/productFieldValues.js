import { BULK_BASE_FIELDS } from '../../../src/productSchema.js';

const operationalBaseKeys = new Set(BULK_BASE_FIELDS.map(field => field.key));

export function editorFieldScope(section, key) {
  return section === 'Base.com' || operationalBaseKeys.has(key) ? 'base' : 'manual';
}

export function editorFieldValue(product, section, key, draft = {}, resets = []) {
  if (Object.hasOwn(draft, key)) return draft[key];
  const scope = editorFieldScope(section, key);
  const layer = product.provenance?.[key];
  if (resets.includes(key)) return scope === 'base' ? layer?.globalValue : layer?.canonical ?? layer?.source;
  if (scope === 'base' && key === 'tags') return layer?.value ?? [];
  return scope === 'base' ? layer?.value : layer?.globalValue;
}
