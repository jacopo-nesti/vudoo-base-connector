import { readFile, readdir, mkdir, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { cleanName, nameIdentity } from './names.js';
import { resolveEffectiveBaseCategory } from './categoryResolution.js';

const configRoot = process.env.VUDOO_CONFIG_ROOT
  ? pathToFileURL(`${path.resolve(process.env.VUDOO_CONFIG_ROOT)}${path.sep}`)
  : new URL('../config/', import.meta.url);

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} deve essere un oggetto.`);
  return value;
}

function nonEmptyText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} deve essere una stringa non vuota.`);
  return cleanName(value);
}

function parseJson(text, filename) {
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`${filename} non è JSON valido: ${error.message}`);
  }
}

export function parseCategoryMappings(text) {
  return validateCategoryMappings(parseJson(text, 'configurazione categorie'));
}

export function validateCategoryMappings(value) {
  const root = objectValue(value, 'configurazione categorie');
  if (!Object.hasOwn(root, 'canonical')) throw new Error('Configurazione categorie: canonical mancante.');
  if (!Object.hasOwn(root, 'suppliers')) throw new Error('Configurazione categorie: suppliers mancante.');
  const canonicalInput = objectValue(root.canonical, 'canonical');
  const suppliersInput = objectValue(root.suppliers, 'suppliers');
  const canonical = new Map();
  const canonicalIdentities = new Map();

  for (const [rawId, definition] of Object.entries(canonicalInput)) {
    const id = nonEmptyText(rawId, 'ID canonical');
    if (id !== rawId) throw new Error(`Canonical "${rawId}" contiene spazi superflui.`);
    const identity = nameIdentity(id);
    if (canonicalIdentities.has(identity)) {
      throw new Error(`Canonical ambigua: "${rawId}" e "${canonicalIdentities.get(identity)}".`);
    }
    const item = objectValue(definition, `Canonical ${id}`);
    if (!Array.isArray(item.base_path) || item.base_path.length === 0) {
      throw new Error(`Canonical ${id}: base_path deve essere un array non vuoto.`);
    }
    const basePath = item.base_path.map((part, index) =>
      nonEmptyText(part, `Canonical ${id}: base_path[${index}]`));
    canonical.set(id, { id, basePath });
    canonicalIdentities.set(identity, id);
  }

  const suppliers = new Map();
  const supplierByTitle = new Map();
  const supplierIdentities = new Map();
  for (const [key, definition] of Object.entries(suppliersInput)) {
    const item = objectValue(definition, `Supplier ${key}`);
    const id = nonEmptyText(item.supplier_id ?? key, `Supplier ${key}: supplier_id`);
    const identity = nameIdentity(id);
    if (supplierIdentities.has(identity)) {
      throw new Error(`Supplier ID duplicato: "${id}" e "${supplierIdentities.get(identity)}".`);
    }
    supplierIdentities.set(identity, id);
    if (!Array.isArray(item.source_titles) || item.source_titles.length === 0) {
      throw new Error(`Supplier ${id}: source_titles deve essere un array non vuoto.`);
    }
    const sourceTitles = item.source_titles.map((title, index) =>
      nonEmptyText(title, `Supplier ${id}: source_titles[${index}]`));
    for (const title of sourceTitles) {
      const titleKey = nameIdentity(title);
      if (supplierByTitle.has(titleKey)) {
        throw new Error(`Source title ambiguo "${title}" tra ${supplierByTitle.get(titleKey)} e ${id}.`);
      }
      supplierByTitle.set(titleKey, id);
    }
    const categoryInput = objectValue(item.categories, `Supplier ${id}: categories`);
    const categories = new Map();
    for (const [sourceCategory, canonicalIdValue] of Object.entries(categoryInput)) {
      const source = nonEmptyText(sourceCategory, `Supplier ${id}: categoria sorgente`);
      if (isMissingSourceCategory(source)) throw new Error(`Supplier ${id}: categoria sorgente mancante non configurabile: "${source}".`);
      const sourceKey = nameIdentity(source);
      if (categories.has(sourceKey)) throw new Error(`Supplier ${id}: categoria sorgente ambigua "${sourceCategory}".`);
      if (canonicalIdValue === null) {
        categories.set(sourceKey, null);
        continue;
      }
      const canonicalId = nonEmptyText(canonicalIdValue, `Supplier ${id}: canonical di ${source}`);
      if (!canonical.has(canonicalId)) throw new Error(`Supplier ${id}: canonical "${canonicalId}" non definita per "${source}".`);
      categories.set(sourceKey, canonicalId);
    }
    suppliers.set(id, { id, sourceTitles, categories, file: item.file ?? `config/suppliers/${key}.json` });
  }
  return { canonical, suppliers, supplierByTitle };
}

export async function loadCategoryMappings(rootUrl = configRoot, { channelTitle } = {}) {
  const canonicalUrl = new URL('canonical-categories.json', rootUrl);
  const suppliersUrl = new URL('suppliers/', rootUrl);
  let canonicalText;
  let filenames;
  try {
    canonicalText = await readFile(canonicalUrl, 'utf8');
    filenames = await readdir(suppliersUrl);
  } catch (error) {
    throw new Error(`Impossibile leggere la configurazione categorie: ${error.message}`);
  }
  const canonical = parseJson(canonicalText, 'config/canonical-categories.json');
  const suppliers = {};
  for (const filename of filenames.filter(name => name.endsWith('.json')).sort()) {
    const file = `config/suppliers/${filename}`;
    let item;
    try { item = objectValue(parseJson(await readFile(new URL(filename, suppliersUrl), 'utf8'), file), file); }
    catch (error) { if (channelTitle) continue; throw error; }
    if (channelTitle && !(Array.isArray(item.source_titles) && item.source_titles.some(title =>
      typeof title === 'string' && nameIdentity(title) === nameIdentity(channelTitle)))) continue;
    const id = nonEmptyText(item.supplier_id, `${file}: supplier_id`);
    if (Object.hasOwn(suppliers, id)) throw new Error(`Supplier ID duplicato: "${id}" (${file}).`);
    suppliers[id] = { ...item, file };
  }
  if (!channelTitle) return validateCategoryMappings({ canonical, suppliers });
  // Operational preflight validates only the active supplier's references. The
  // unscoped loader remains available for global diagnostics/config checks.
  const needed = new Set(Object.values(suppliers).flatMap(item => Object.values(item.categories ?? {}))
    .filter(value => typeof value === 'string'));
  const scopedCanonical = Object.fromEntries(Object.entries(canonical).filter(([id, value]) =>
    needed.has(id) || (value && Array.isArray(value.base_path) && value.base_path.length &&
      value.base_path.every(part => typeof part === 'string' && part.trim()))));
  return validateCategoryMappings({ canonical: scopedCanonical, suppliers });
}

export function resolveSupplierProfile(channelTitle, mappings) {
  const title = nonEmptyText(channelTitle, 'channel.title');
  const supplierId = mappings.supplierByTitle.get(nameIdentity(title));
  if (!supplierId) throw new Error(`Supplier profile non configurato: "${title}".`);
  return mappings.suppliers.get(supplierId);
}

export function isMissingSourceCategory(value) {
  if (typeof value !== 'string' || !value.trim()) return true;
  const path = value.split('>').map(part => nameIdentity(part)).join(' > ');
  return path === 'no name > no name';
}

export function normalizeCategory({ supplier, sourceCategory, mappings }) {
  if (isMissingSourceCategory(sourceCategory)) return { sourceCategory: sourceCategory ?? '', status: 'missing', mapped: false };
  const canonicalId = supplier?.categories.get(nameIdentity(sourceCategory));
  if (!canonicalId) return { sourceCategory, status: 'unmapped', mapped: false };
  return {
    sourceCategory,
    canonicalCategory: canonicalId,
    basePath: [...mappings.canonical.get(canonicalId).basePath],
    status: 'mapped',
    mapped: true,
  };
}

export function analyzeCatalogCategories(catalog, mappings, runtimeMappings = {}) {
  const counts = new Map();
  let missingSourceCategoryProducts = 0;
  for (const product of catalog.products) {
    const sourceCategory = product.product_type;
    if (isMissingSourceCategory(sourceCategory)) {
      missingSourceCategoryProducts++;
      continue;
    }
    const key = nameIdentity(sourceCategory);
    const entry = counts.get(key) ?? { sourceCategory, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  let supplier;
  let supplierError;
  try {
    supplier = resolveSupplierProfile(catalog.channelTitle, mappings);
  } catch (error) {
    supplierError = error.message;
  }
  const mapProduct = product => {
    const sourceCategory = product.product_type;
    const resolved = resolveEffectiveBaseCategory({ sourceTitle: catalog.channelTitle,
      sourceCategory, canonicalCategory: product.canonical_category,
      manualCategory: product.base_category_override, runtimeMappings, supplier, mappings });
    return { ...product, source_category: sourceCategory,
      canonical_category: resolved.canonicalCategory,
      base_category_path: resolved.path,
      category_id: resolved.categoryId,
      base_category_origin: resolved.origin };
  };
  const products = catalog.products.map(mapProduct);
  const uniqueProducts = catalog.uniqueProducts.map(mapProduct);
  const resolvedBySource = new Map();
  for (const product of products) {
    if (isMissingSourceCategory(product.source_category)) continue;
    const key = nameIdentity(product.source_category);
    const group = resolvedBySource.get(key) ?? [];
    group.push(product); resolvedBySource.set(key, group);
  }
  const entries = [...counts.values()].map(entry => {
    const group = resolvedBySource.get(nameIdentity(entry.sourceCategory)) ?? [];
    const paths = new Map(group.filter(product => product.base_category_path?.length)
      .map(product => [JSON.stringify(product.base_category_path), product.base_category_path]));
    const allMapped = group.length > 0 && group.every(product => product.base_category_path?.length);
    const status = allMapped ? paths.size === 1 ? 'mapped' : 'mixed'
      : paths.size ? 'partial' : 'unmapped';
    const canonicalIds = new Set(group.map(product => product.canonical_category).filter(Boolean));
    return { ...entry, status, mapped: allMapped,
      canonicalCategory: canonicalIds.size === 1 ? [...canonicalIds][0] : null,
      basePath: paths.size === 1 ? [...paths.values()][0] : null };
  }).sort((left, right) => left.sourceCategory.localeCompare(right.sourceCategory, 'it', { sensitivity: 'base' }));
  const isMapped = product => Array.isArray(product.base_category_path) && product.base_category_path.length > 0;
  const isMissing = product => isMissingSourceCategory(product.source_category);
  const mappedProducts = products.filter(isMapped);
  const unmappedProducts = products.filter(product => !isMapped(product) && !isMissing(product));
  const missingProducts = products.filter(isMissing);
  const withoutBaseCategoryProducts = products.filter(product => !isMapped(product) &&
    typeof product.id === 'string' && product.id.trim() && !product.categoryPlaceholder).length;
  const missingSourceCategoryUnrecordableProducts = missingProducts.filter(product =>
    typeof product.id !== 'string' || !product.id.trim()).length;
  return {
    channelTitle: catalog.channelTitle,
    supplier,
    supplierError,
    totalProducts: products.length,
    entries,
    mappedCount: entries.filter(entry => entry.mapped).length,
    unmappedCount: entries.filter(entry => !entry.mapped).length,
    missingSourceCategoryProducts,
    missingSourceCategoryUnrecordableProducts,
    importableProducts: products.filter(product =>
      typeof product.id === 'string' && product.id.trim() && !product.categoryPlaceholder).length,
    unmappedValidCategoryProducts: unmappedProducts.length,
    withoutBaseCategoryProducts,
    products,
    uniqueProducts,
    mappedProducts,
    mappedUniqueProducts: uniqueProducts.filter(isMapped),
    unmappedProducts,
    missingProducts,
  };
}

export function formatCategoryReport(analysis) {
  const lines = [
    '[CATEGORIE VUDOO]',
    '',
    `Supplier: ${analysis.supplier?.id ?? 'NON CONFIGURATO'}`,
    `Source title: ${analysis.channelTitle?.trim() || '(channel.title assente)'}`,
    `Configurazione: ${analysis.supplier?.file ?? '(non presente)'}`,
    '',
    `Prodotti totali feed: ${analysis.totalProducts}`,
    `Prodotti importabili: ${analysis.importableProducts}`,
    `Prodotti con categoria sorgente mancante: ${analysis.missingSourceCategoryProducts}`,
    `Prodotti senza categoria non registrabili (g:id mancante): ${analysis.missingSourceCategoryUnrecordableProducts}`,
    `Categorie sorgente reali trovate: ${analysis.entries.length}`,
    `Categorie reali mappate: ${analysis.mappedCount}`,
    `Categorie reali non mappate: ${analysis.unmappedCount}`,
    '',
  ];
  for (const entry of analysis.entries) {
    if (entry.mapped) lines.push(`MAPPATA: ${entry.sourceCategory} → ${entry.canonicalCategory ?? 'override/mapping utente'} → ${entry.basePath?.join(' > ') ?? 'più categorie Base'} (${entry.count} prodotti)`);
    else lines.push(`NON MAPPATA: ${entry.sourceCategory} (${entry.count} prodotti)`);
  }
  lines.push('', `Risultato: ${analysis.mappedCount} categorie mappate, ${analysis.unmappedCount} categorie non mappate`);
  if (analysis.supplierError) lines.push(analysis.supplierError);
  return lines.join('\n');
}

export function formatUnmappedCategoryError(analysis, policy) {
  const categories = analysis.entries.filter(entry => !entry.mapped)
    .map(entry => `- ${entry.sourceCategory}: ${entry.count} prodotti`).join('\n');
  return `IMPORT BLOCCATO\nSupplier: ${analysis.supplier.id}\nSource title: ${analysis.channelTitle}\nCategorie sorgente non mappate:\n${categories}\nMotivo: il feed contiene categorie reali senza mapping.\nConfigurazione da aggiornare: ${analysis.supplier.file}\nPolicy attuale: UNMAPPED_CATEGORY_POLICY=${policy}\nAzione: aggiungere i mapping e ripetere il preflight/import.`;
}

export function buildCategoryAutoMapIndex(mappings) {
  const approved = new Map();
  const canonicalPaths = new Map();
  for (const supplier of mappings.suppliers.values()) {
    for (const [sourceCategory, canonicalId] of supplier.categories) {
      if (canonicalId == null) continue;
      const key = nameIdentity(sourceCategory);
      if (!approved.has(key)) approved.set(key, new Set());
      approved.get(key).add(canonicalId);
    }
  }
  for (const canonical of mappings.canonical.values()) {
    const key = nameIdentity(canonical.basePath.join(' > '));
    if (!canonicalPaths.has(key)) canonicalPaths.set(key, new Set());
    canonicalPaths.get(key).add(canonical.id);
  }
  return { approved, canonicalPaths };
}

export function suggestCategoryMapping(sourceCategory, index) {
  if (isMissingSourceCategory(sourceCategory)) return { canonicalId: null, origin: null };
  const key = nameIdentity(sourceCategory);
  const approved = index.approved.get(key);
  const canonical = index.canonicalPaths.get(key);
  if (approved?.size > 1) return { canonicalId: null, origin: null };
  if (approved?.size === 1) {
    const canonicalId = approved.values().next().value;
    if (canonical && (canonical.size !== 1 || !canonical.has(canonicalId))) {
      return { canonicalId: null, origin: null };
    }
    return { canonicalId, origin: 'supplier' };
  }
  if (canonical?.size === 1) {
    return { canonicalId: canonical.values().next().value, origin: 'canonical' };
  }
  return { canonicalId: null, origin: null };
}

function supplierSlug(title) {
  const slug = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/[\s-]+/g, '-');
  if (!slug) throw new Error('channel.title non permette un nome file supplier sicuro.');
  return slug;
}

export async function createSupplierDraft(analysis, rootUrl = configRoot, mappings) {
  const availableMappings = mappings ?? await loadCategoryMappings(rootUrl);
  const title = nonEmptyText(analysis.channelTitle, 'channel.title');
  const slug = supplierSlug(title);
  const directory = new URL('suppliers/', rootUrl);
  const filename = `${slug}.json`;
  const file = `config/suppliers/${filename}`;
  const supplierId = slug.toUpperCase().replace(/-/g, '_');
  const existingSupplier = [...availableMappings.suppliers.values()]
    .find(supplier => nameIdentity(supplier.id) === nameIdentity(supplierId));
  if (existingSupplier && (existingSupplier.file !== file ||
      !existingSupplier.sourceTitles.some(sourceTitle => nameIdentity(sourceTitle) === nameIdentity(title)))) {
    throw new Error(`Nuovo supplier "${title}": supplier_id ${supplierId} già in uso. Verificare i profili in config/suppliers/.`);
  }
  const index = buildCategoryAutoMapIndex(availableMappings);
  const stats = { supplier: 0, canonical: 0, manual: 0 };
  const categories = Object.fromEntries(analysis.entries
    .filter(entry => !isMissingSourceCategory(entry.sourceCategory))
    .map(entry => {
      const { canonicalId, origin } = suggestCategoryMapping(entry.sourceCategory, index);
      stats[origin ?? 'manual']++;
      return [entry.sourceCategory, canonicalId];
    }));
  const draft = {
    supplier_id: supplierId,
    source_titles: [title],
    categories,
  };
  await mkdir(directory, { recursive: true });
  let handle;
  try {
    handle = await open(new URL(filename, directory), 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      const existing = parseJson(await readFile(new URL(filename, directory), 'utf8'), file);
      if (!Array.isArray(existing?.source_titles) ||
          !existing.source_titles.some(sourceTitle => typeof sourceTitle === 'string' && nameIdentity(sourceTitle) === nameIdentity(title))) {
        throw new Error(`Nuovo supplier "${title}": ${file} esiste già per un altro titolo. Il file non è stato modificato.`);
      }
      return { file, draft, created: false, stats };
    }
    throw new Error(`Impossibile creare la bozza supplier ${file}: ${error.message}`);
  }
  try {
    await handle.writeFile(`${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  } catch (error) {
    await handle.close();
    await unlink(new URL(filename, directory)).catch(() => {});
    throw new Error(`Impossibile completare la bozza supplier ${file}: ${error.message}`);
  }
  await handle.close();
  return { file, draft, created: true, stats };
}
