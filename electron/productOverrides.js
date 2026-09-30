import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { defaultProductTitle, productKey } from './effectiveProduct.js';

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
        Object.keys(fields).some(field => !['title', 'description'].includes(field)) ||
        (Object.hasOwn(fields, 'title') && (typeof fields.title !== 'string' || !fields.title.trim())) ||
        (Object.hasOwn(fields, 'description') && typeof fields.description !== 'string')) {
      throw new Error('Il file degli override prodotto contiene dati non validi.');
    }
  }
  return parsed.products;
}

export async function saveProductOverride(filePath, overrides, companyCode, source, input) {
  const key = productKey(companyCode, source?.id);
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(field => !['title', 'description'].includes(field)) ||
      typeof input.title !== 'string' || !input.title.trim() ||
      typeof input.description !== 'string') {
    throw new Error('Titolo o descrizione non validi.');
  }
  const fields = {};
  if (input.title !== defaultProductTitle(source)) fields.title = input.title;
  if (input.description !== (source.description ?? '')) fields.description = input.description;
  const next = { ...overrides };
  if (Object.keys(fields).length) next[key] = fields;
  else delete next[key];

  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, products: next }, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
  return next;
}

