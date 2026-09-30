import { readFile } from 'node:fs/promises';

const configRoot = new URL('../../config/', import.meta.url);
const statuses = new Set(['mapped', 'pending', 'not_applicable']);

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} deve essere un oggetto.`);
  }
  return value;
}

function onlyKeys(value, allowed, label) {
  const unexpected = Object.keys(value).find(key => !allowed.includes(key));
  if (unexpected) throw new Error(`${label}: campo non previsto "${unexpected}".`);
}

async function readJson(url, label, missingMessage) {
  let text;
  try {
    text = await readFile(url, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error(missingMessage);
    throw new Error(`${label}: lettura non riuscita: ${error.message}`);
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${label}: JSON non valido: ${error.message}`);
  }
}

export function validateEtsyCategoryMappings(config, canonicalDefinitions, taxonomy) {
  const root = objectValue(config, 'Mapping Etsy');
  onlyKeys(root, ['marketplace', 'mapping_count', 'mappings'], 'Mapping Etsy');
  if (root.marketplace !== 'etsy') throw new Error('Mapping Etsy: marketplace deve essere "etsy".');
  const canonical = objectValue(canonicalDefinitions, 'Categorie canoniche');
  const mappings = objectValue(root.mappings, 'Mapping Etsy: mappings');
  const mappingIds = Object.keys(mappings);
  if (!Number.isSafeInteger(root.mapping_count) || root.mapping_count !== mappingIds.length) {
    throw new Error('Mapping Etsy: mapping_count non coincide con il numero di mapping.');
  }
  const dataset = objectValue(taxonomy, 'Tassonomia Etsy');
  if (dataset.marketplace !== 'etsy') throw new Error('Tassonomia Etsy: marketplace deve essere "etsy".');
  if (!Array.isArray(dataset.categories) || !Number.isSafeInteger(dataset.category_count) ||
      dataset.category_count !== dataset.categories.length) {
    throw new Error('Tassonomia Etsy: category_count non coincide con le categorie disponibili.');
  }

  const categoriesById = new Map();
  const categoryPaths = new Set();
  for (const category of dataset.categories) {
    if (!category || !Number.isSafeInteger(category.id) || category.id <= 0 ||
        typeof category.path !== 'string' || !category.path.trim()) {
      throw new Error('Tassonomia Etsy: categoria con ID o path non valido.');
    }
    if (categoriesById.has(category.id) || categoryPaths.has(category.path)) {
      throw new Error(`Tassonomia Etsy: ID o path duplicato (${category.id}).`);
    }
    categoriesById.set(category.id, category.path);
    categoryPaths.add(category.path);
  }

  const seenCanonicalIds = new Set();
  const validated = new Map();
  const counts = { total: 0, mapped: 0, pending: 0, notApplicable: 0 };
  for (const canonicalId of mappingIds) {
    const identity = canonicalId.trim().toUpperCase();
    if (seenCanonicalIds.has(identity)) throw new Error(`Mapping Etsy: canonical duplicata o ambigua "${canonicalId}".`);
    seenCanonicalIds.add(identity);
    if (!Object.hasOwn(canonical, canonicalId)) throw new Error(`Mapping Etsy: canonical inesistente "${canonicalId}".`);
    const mapping = objectValue(mappings[canonicalId], `Mapping Etsy: ${canonicalId}`);
    if (!statuses.has(mapping.status)) throw new Error(`Mapping Etsy: ${canonicalId} ha status non valido.`);
    const label = `Mapping Etsy: ${canonicalId}`;
    if (mapping.status === 'mapped') {
      onlyKeys(mapping, ['status', 'etsy_category_id', 'etsy_path'], label);
      const id = mapping.etsy_category_id;
      const path = mapping.etsy_path;
      if (!Number.isSafeInteger(id) || id <= 0 || typeof path !== 'string' || !path.trim()) {
        throw new Error(`${label}: mapped richiede ID numerico e path Etsy non vuoto.`);
      }
      if (!categoriesById.has(id)) throw new Error(`${label}: ID Etsy ${id} inesistente nella tassonomia.`);
      if (categoriesById.get(id) !== path) throw new Error(`${label}: path Etsy non corrisponde all'ID ${id}.`);
      validated.set(canonicalId, { status: 'mapped', id, path });
      counts.mapped++;
    } else {
      onlyKeys(mapping, ['status'], label);
      validated.set(canonicalId, { status: mapping.status, id: null, path: null });
      if (mapping.status === 'pending') counts.pending++;
      else counts.notApplicable++;
    }
    counts.total++;
  }
  const missing = Object.keys(canonical).find(id => !validated.has(id));
  if (missing) throw new Error(`Mapping Etsy: canonical "${missing}" senza status; aggiungere pending, mapped o not_applicable.`);
  return { canonicalIds: new Set(Object.keys(canonical)), mappings: validated, counts };
}

export async function loadEtsyCategoryMappings(rootUrl = configRoot) {
  const [config, canonical, taxonomy] = await Promise.all([
    readJson(new URL('marketplaces/etsy/canonical-mapping.json', rootUrl),
      'Mapping Etsy', 'Configurazione mapping Etsy non disponibile: canonical-mapping.json mancante.'),
    readJson(new URL('canonical-categories.json', rootUrl),
      'Categorie canoniche', 'Configurazione categorie canoniche non disponibile.'),
    readJson(new URL('marketplaces/etsy/categories.json', rootUrl),
      'Tassonomia Etsy', 'Configurazione mapping Etsy non disponibile: tassonomia categories.json mancante.'),
  ]);
  return validateEtsyCategoryMappings(config, canonical, taxonomy);
}

export function getEtsyCategoryMapping(canonicalCategory, registry) {
  if (typeof canonicalCategory !== 'string' || !registry?.canonicalIds?.has(canonicalCategory)) {
    throw new Error(`Categoria canonica Etsy sconosciuta: "${canonicalCategory}".`);
  }
  const mapping = registry.mappings.get(canonicalCategory);
  if (!mapping) throw new Error(`Mapping Etsy non configurato per "${canonicalCategory}".`);
  return { ...mapping };
}
