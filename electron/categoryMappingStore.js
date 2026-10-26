import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { nameIdentity } from '../src/names.js';

export const CATEGORY_MAPPINGS_FILE_NAME = 'category-mappings.json';
export const categoryMappingKey = (sourceTitle, sourceCategory) =>
  JSON.stringify([nameIdentity(sourceTitle), nameIdentity(sourceCategory)]);

function validCategory(value) {
  return value && Number.isSafeInteger(value.categoryId) && value.categoryId > 0 &&
    Array.isArray(value.path) && value.path.length > 0 &&
    value.path.every(part => typeof part === 'string' && part.trim() && part.length <= 200);
}

export async function loadRuntimeCategoryMappings(filePath) {
  let text;
  try { text = await readFile(filePath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Mapping categorie locali non validi.'); }
  if (parsed?.version !== 1 || !parsed.mappings || typeof parsed.mappings !== 'object' || Array.isArray(parsed.mappings))
    throw new Error('Struttura mapping categorie locali non valida.');
  for (const [key, value] of Object.entries(parsed.mappings)) {
    let parts;
    try { parts = JSON.parse(key); } catch { throw new Error('Chiave mapping categoria non valida.'); }
    if (!Array.isArray(parts) || parts.length !== 2 || parts.some(part => typeof part !== 'string' || !part.trim()) ||
      !validCategory(value) || typeof value.sourceTitle !== 'string' ||
      typeof value.sourceCategory !== 'string' ||
      key !== categoryMappingKey(value.sourceTitle, value.sourceCategory))
      throw new Error('Mapping categoria locale non valido.');
  }
  return parsed.mappings;
}

async function writeMappings(filePath, mappings) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify({ version: 1, mappings }, null, 2)}\n`, 'utf8');
    await rename(temporary, filePath);
  } finally { await unlink(temporary).catch(() => {}); }
}

export async function saveRuntimeCategoryMapping(filePath, mappings, sourceTitle, sourceCategory, category) {
  if (!sourceTitle?.trim() || !sourceCategory?.trim() || !validCategory(category))
    throw new Error('Mapping categoria incompleto.');
  const next = { ...mappings, [categoryMappingKey(sourceTitle, sourceCategory)]: {
    sourceTitle, sourceCategory, categoryId: category.categoryId, path: [...category.path],
  } };
  await writeMappings(filePath, next);
  return next;
}

export async function removeRuntimeCategoryMapping(filePath, mappings, sourceTitle, sourceCategory) {
  const next = { ...mappings };
  delete next[categoryMappingKey(sourceTitle, sourceCategory)];
  await writeMappings(filePath, next);
  return next;
}
