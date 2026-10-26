import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { defaultProductTitle, effectiveProduct, productKey } from './effectiveProduct.js';
import { FIELD_BY_KEY, BASE_FIELD_BY_KEY, getField, validateFieldInput } from '../src/productSchema.js';
import { applyInventoryTagOperation, normalizeInventoryTagNames } from '../src/inventoryTags.js';

export const PRODUCT_OVERRIDES_FILE_NAME = 'product-overrides.json';

export async function loadProductOverrides(filePath) {
  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Il file degli override prodotto non è un JSON valido.');
  }
  if (!parsed || parsed.version !== 1 || !parsed.products ||
      typeof parsed.products !== 'object' || Array.isArray(parsed.products)) {
    throw new Error('Il file degli override prodotto ha una struttura non valida.');
  }
  for (const [key, fields] of Object.entries(parsed.products)) {
    let identity;
    try { identity = JSON.parse(key); } catch { /* Invalid identity below. */ }
    if (!Array.isArray(identity) || identity.length !== 2 ||
        identity.some(value => typeof value !== 'string' || !value.trim()) ||
        key !== productKey(identity[0], identity[1]) ||
        !fields || typeof fields !== 'object' || Array.isArray(fields) ||
        Object.keys(fields).length === 0 ||
        Object.entries(fields).some(([field, value]) => {
          if (field === 'manual_images') return !Array.isArray(value) || !value.length || value.length > 16 ||
            !value.every(image => image && typeof image === 'object' && !Array.isArray(image) &&
              /^[0-9a-f-]{36}$/i.test(image.id) && typeof image.name === 'string' &&
              typeof image.mimeType === 'string' && Number.isSafeInteger(image.size) &&
              image.size > 0 && image.size <= 4_000_000 &&
              (image.base == null || (Number.isSafeInteger(image.base.productId) && image.base.productId > 0 &&
                Number.isInteger(image.base.position) && image.base.position >= 1 && image.base.position <= 16)));
          if (field === 'base_category') return !validBaseCategory(value);
          if (field === 'base') return !value || typeof value !== 'object' || Array.isArray(value) ||
            !Object.entries(value).every(([name, item]) => validStored(name, item, 'base'));
          return !validStored(field, value, 'manual');
        })) {
      throw new Error('Il file degli override prodotto contiene dati non validi.');
    }
  }
  return parsed.products;
}

function validBaseCategory(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Number.isSafeInteger(value.categoryId) && value.categoryId > 0 &&
    Array.isArray(value.path) && value.path.length > 0 && value.path.length <= 20 &&
    value.path.every(part => typeof part === 'string' && part.trim() && part.length <= 200) &&
    Object.keys(value).every(key => ['categoryId', 'path'].includes(key));
}

export async function saveProductCategoryOverrides(filePath, overrides, companyCode, sources,
  { category, expectedRevisions }) {
  if (!Array.isArray(sources) || !sources.length || sources.length > 5000 ||
      !expectedRevisions || typeof expectedRevisions !== 'object' ||
      (category !== null && !validBaseCategory(category))) throw new Error('Categoria Base.com non valida.');
  const next = { ...overrides };
  for (const source of sources) {
    const key = productKey(companyCode, source?.id);
    if (productOverrideRevision(overrides[key] ?? {}) !== expectedRevisions[source.id])
      throw new Error(`Il prodotto ${source.id} è stato modificato: ricaricare la selezione.`);
    const fields = { ...(overrides[key] ?? {}) };
    if (category) fields.base_category = { categoryId: category.categoryId, path: [...category.path] };
    else delete fields.base_category;
    if (Object.keys(fields).length) next[key] = fields;
    else delete next[key];
  }
  await writeProductOverrides(filePath, next);
  return next;
}

function validStored(field, value, scope) {
  const schema = scope === 'base' ? BASE_FIELD_BY_KEY : FIELD_BY_KEY;
  if (!schema.get(field) || (scope === 'manual' && !schema.get(field).editable)) return false;
  try { return JSON.stringify(validateFieldInput(field, value, scope)) === JSON.stringify(value); }
  catch { return false; }
}

export async function writeProductOverrides(filePath, products) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, products }, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

export function productOverrideRevision(fields = {}) {
  return JSON.stringify(fields);
}

export async function saveProductFieldPatch(filePath, overrides, companyCode, source, { scope, changes = {}, reset = [], expectedRevision }) {
  const key = productKey(companyCode, source?.id);
  if (!['manual', 'base'].includes(scope) || !changes || typeof changes !== 'object' || Array.isArray(changes) ||
      !Array.isArray(reset) || Object.keys(changes).length + reset.length === 0 ||
      Object.keys(changes).length + reset.length > 40 || reset.some(field => typeof field !== 'string') ||
      typeof expectedRevision !== 'string' || productOverrideRevision(overrides[key] ?? {}) !== expectedRevision) {
    throw new Error('Modifiche prodotto non valide o superate: riaprire il prodotto.');
  }
  const fields = { ...(overrides[key] ?? {}) };
  const target = scope === 'base' ? { ...(fields.base ?? {}) } : fields;
  for (const field of reset) {
    if (!(scope === 'base' ? BASE_FIELD_BY_KEY : FIELD_BY_KEY).has(field)) throw new Error(`Campo sconosciuto: ${field}.`);
    delete target[field];
  }
  for (const [field, value] of Object.entries(changes)) {
    const normalized = validateFieldInput(field, value, scope);
    const canonical = field === 'title' ? defaultProductTitle(source) : getField(source, field);
    if (scope === 'manual' && JSON.stringify(normalized) === JSON.stringify(canonical)) delete target[field];
    else target[field] = normalized;
  }
  if (scope === 'base') {
    if (Object.keys(target).length) fields.base = target;
    else delete fields.base;
  }
  const next = { ...overrides };
  if (Object.keys(fields).length) next[key] = fields;
  else delete next[key];
  await writeProductOverrides(filePath, next);
  return next;
}

export async function saveBulkProductField(filePath, overrides, companyCode, sources, { scope, field, value, expectedRevisions }) {
  if (!['manual', 'base'].includes(scope) || !Array.isArray(sources) || !sources.length || sources.length > 5000 ||
      typeof field !== 'string' || !expectedRevisions || typeof expectedRevisions !== 'object') {
    throw new Error('Modifica massiva non valida.');
  }
  const normalized = validateFieldInput(field, value, scope);
  const next = { ...overrides };
  for (const source of sources) {
    const key = productKey(companyCode, source?.id);
    if (productOverrideRevision(overrides[key] ?? {}) !== expectedRevisions[source.id]) {
      throw new Error(`Il prodotto ${source.id} è stato modificato: ricaricare la selezione.`);
    }
    const fields = { ...(next[key] ?? {}) };
    if (scope === 'base') fields.base = { ...(fields.base ?? {}), [field]: normalized };
    else fields[field] = normalized;
    next[key] = fields;
  }
  await writeProductOverrides(filePath, next);
  return next;
}

export async function saveBulkProductTags(filePath, overrides, companyCode, sources,
  { operation, value, expectedRevisions, confirmedEmptyReplace = false }) {
  if (!Array.isArray(sources) || !sources.length || sources.length > 5000 ||
      !expectedRevisions || typeof expectedRevisions !== 'object') {
    throw new Error('Modifica massiva Product Tags non valida.');
  }
  const requested = normalizeInventoryTagNames(value);
  if (requested === undefined || (operation !== 'replace' && requested.length === 0)) {
    throw new Error('Indica almeno un Product Tag per aggiungere o rimuovere.');
  }
  if (operation === 'replace' && requested.length === 0 && confirmedEmptyReplace !== true) {
    throw new Error('Conferma esplicitamente la rimozione di tutti i Product Tags.');
  }
  const next = { ...overrides };
  let changedCount = 0;
  for (const source of sources) {
    const key = productKey(companyCode, source?.id);
    const fields = overrides[key] ?? {};
    if (productOverrideRevision(fields) !== expectedRevisions[source.id]) {
      throw new Error(`Il prodotto ${source.id} è stato modificato: ricaricare la selezione.`);
    }
    const before = effectiveProduct(source, fields, 'base').tags;
    const after = applyInventoryTagOperation(before, requested, operation);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const base = { ...(fields.base ?? {}), tags: validateFieldInput('tags', after, 'base') };
    next[key] = { ...fields, base };
    changedCount++;
  }
  if (changedCount) await writeProductOverrides(filePath, next);
  return { overrides: next, changedCount };
}

export async function saveProductOverride(filePath, overrides, companyCode, source, input) {
  const key = productKey(companyCode, source?.id);
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(field => !['title', 'description'].includes(field)) ||
      typeof input.title !== 'string' || !input.title.trim() ||
      typeof input.description !== 'string') {
    throw new Error('Titolo o descrizione non validi.');
  }
  const fields = { ...(overrides[key] ?? {}) };
  if (input.title !== defaultProductTitle(source)) fields.title = input.title;
  else delete fields.title;
  if (input.description !== (source.description ?? '')) fields.description = input.description;
  else delete fields.description;
  const next = { ...overrides };
  if (Object.keys(fields).length) next[key] = fields;
  else delete next[key];

  await writeProductOverrides(filePath, next);
  return next;
}

