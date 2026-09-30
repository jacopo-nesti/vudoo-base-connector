import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  validateEtsyCategoryMappings, loadEtsyCategoryMappings, getEtsyCategoryMapping,
} from '../src/marketplaces/etsyCategories.js';

const canonical = { FRAGRANCE: { base_path: ['Bellezza', 'Profumi'] } };
const taxonomy = { marketplace: 'etsy', category_count: 1, categories: [
  { id: 7, path: 'Example/Scents' },
] };
const mapped = { marketplace: 'etsy', mapping_count: 1, mappings: {
  FRAGRANCE: { status: 'mapped', etsy_category_id: 7, etsy_path: 'Example/Scents' },
} };

function withMapping(mapping, changes = {}) {
  return { ...mapped, ...changes, mappings: { FRAGRANCE: mapping } };
}

async function fixtureRoot(t, { mapping = mapped, dataset = taxonomy, includeMapping = true, includeTaxonomy = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'etsy-category-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const etsyDirectory = join(directory, 'marketplaces', 'etsy');
  await mkdir(etsyDirectory, { recursive: true });
  await writeFile(join(directory, 'canonical-categories.json'), JSON.stringify(canonical));
  if (includeMapping) await writeFile(join(etsyDirectory, 'canonical-mapping.json'), JSON.stringify(mapping));
  if (includeTaxonomy) await writeFile(join(etsyDirectory, 'categories.json'), JSON.stringify(dataset));
  return pathToFileURL(directory + sep);
}

test('Etsy: mapping valido risolve ID e path senza chiamate remote', () => {
  const registry = validateEtsyCategoryMappings(mapped, canonical, taxonomy);
  assert.deepEqual(registry.counts, { total: 1, mapped: 1, pending: 0, notApplicable: 0 });
  assert.deepEqual(getEtsyCategoryMapping('FRAGRANCE', registry), {
    status: 'mapped', id: 7, path: 'Example/Scents',
  });
});

test('Etsy: canonical inesistente o duplicata dopo normalizzazione viene respinta', () => {
  assert.throws(() => validateEtsyCategoryMappings({
    ...mapped, mappings: { UNKNOWN: mapped.mappings.FRAGRANCE },
  }, canonical, taxonomy), /canonical inesistente/);
  assert.throws(() => validateEtsyCategoryMappings({
    ...mapped, mapping_count: 2,
    mappings: { FRAGRANCE: mapped.mappings.FRAGRANCE, fragrance: mapped.mappings.FRAGRANCE },
  }, canonical, taxonomy), /duplicata o ambigua/);
});

test('Etsy: ID assente dalla tassonomia viene respinto', () => {
  assert.throws(() => validateEtsyCategoryMappings(withMapping({
    status: 'mapped', etsy_category_id: 999, etsy_path: 'Example/Scents',
  }), canonical, taxonomy), /ID Etsy 999 inesistente/);
});

test('Etsy: path diverso da quello dell’ID viene respinto', () => {
  assert.throws(() => validateEtsyCategoryMappings(withMapping({
    status: 'mapped', etsy_category_id: 7, etsy_path: 'Example/Other',
  }), canonical, taxonomy), /path Etsy non corrisponde/);
});

test('Etsy: mapped richiede ID numerico e path presente', () => {
  for (const mapping of [
    { status: 'mapped', etsy_category_id: '7', etsy_path: 'Example/Scents' },
    { status: 'mapped', etsy_category_id: 7, etsy_path: '' },
  ]) {
    assert.throws(() => validateEtsyCategoryMappings(withMapping(mapping), canonical, taxonomy), /richiede ID numerico e path/);
  }
});

test('Etsy: pending e not_applicable restano espliciti e senza ID', () => {
  for (const [status, countKey] of [['pending', 'pending'], ['not_applicable', 'notApplicable']]) {
    const registry = validateEtsyCategoryMappings(withMapping({ status }), canonical, taxonomy);
    assert.deepEqual(getEtsyCategoryMapping('FRAGRANCE', registry), { status, id: null, path: null });
    assert.equal(registry.counts[countKey], 1);
  }
});

test('Etsy: pending non accetta campi Etsy e status sconosciuto blocca', () => {
  assert.throws(() => validateEtsyCategoryMappings(withMapping({
    status: 'pending', etsy_category_id: 7,
  }), canonical, taxonomy), /campo non previsto/);
  assert.throws(() => validateEtsyCategoryMappings(withMapping({ status: 'guessed' }), canonical, taxonomy), /status non valido/);
});

test('Etsy: mapping_count e copertura canoniche devono essere coerenti', () => {
  assert.throws(() => validateEtsyCategoryMappings({ ...mapped, mapping_count: 2 }, canonical, taxonomy), /mapping_count/);
  assert.throws(() => validateEtsyCategoryMappings({ ...mapped, mapping_count: 0, mappings: {} }, canonical, taxonomy), /senza status/);
});

test('Etsy: tassonomia con ID o path duplicati viene respinta', () => {
  const duplicate = { marketplace: 'etsy', category_count: 2, categories: [taxonomy.categories[0], { id: 7, path: 'Example/Other' }] };
  assert.throws(() => validateEtsyCategoryMappings(mapped, canonical, duplicate), /duplicato/);
});

test('Etsy: file mapping assente produce un errore comprensibile', async t => {
  const root = await fixtureRoot(t, { includeMapping: false });
  await assert.rejects(loadEtsyCategoryMappings(root), /Configurazione mapping Etsy non disponibile: canonical-mapping.json mancante/);
});

test('Etsy: tassonomia privata assente produce un errore comprensibile', async t => {
  const root = await fixtureRoot(t, { includeTaxonomy: false });
  await assert.rejects(loadEtsyCategoryMappings(root), /Configurazione mapping Etsy non disponibile: tassonomia categories.json mancante/);
});

test('Etsy: loader locale valida file JSON e restituisce un resolver utilizzabile', async t => {
  const root = await fixtureRoot(t);
  const registry = await loadEtsyCategoryMappings(root);
  assert.equal(getEtsyCategoryMapping('FRAGRANCE', registry).id, 7);
  assert.throws(() => getEtsyCategoryMapping('UNKNOWN', registry), /Categoria canonica Etsy sconosciuta/);
});
