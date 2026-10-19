import { cleanName, nameIdentity } from './names.js';

export const BASE_TAG_NAME_MAX_LENGTH = 25;

function tagError(code, message, details = {}) {
  return Object.assign(new Error(`${code}: ${message}`), { code, ...details });
}

export function normalizeInventoryTagNames(tagNames) {
  if (tagNames == null) return undefined;
  if (!Array.isArray(tagNames)) throw tagError('TAG_INVALID', 'i Product Tags devono essere un elenco di nomi.');
  const names = new Map();
  for (const raw of tagNames) {
    if (typeof raw !== 'string') throw tagError('TAG_INVALID', 'un Product Tag non è testuale.');
    const name = cleanName(raw);
    if (!name) continue;
    if (name.length > BASE_TAG_NAME_MAX_LENGTH) {
      throw tagError('TAG_TOO_LONG', `"${name}" ha ${name.length} caratteri; massimo ${BASE_TAG_NAME_MAX_LENGTH}.`,
        { tagName: name, length: name.length, maximum: BASE_TAG_NAME_MAX_LENGTH });
    }
    const key = nameIdentity(name);
    if (!names.has(key)) names.set(key, name);
  }
  return [...names.values()];
}

/** Local list edit only. Remote validation and creation remain in ensureInventoryTags. */
export function applyInventoryTagOperation(currentTags, requestedTags, operation) {
  if (!['add', 'remove', 'replace'].includes(operation)) throw tagError('TAG_OPERATION_INVALID', 'operazione Product Tags non valida.');
  const requested = normalizeInventoryTagNames(requestedTags);
  if (requested === undefined) throw tagError('TAG_INVALID', 'specificare un elenco di Product Tags.');
  if (operation === 'replace') return requested;
  const current = normalizeInventoryTagNames(currentTags);
  if (current === undefined) return operation === 'add' && requested.length ? requested : undefined;
  const selected = new Set(requested.map(nameIdentity));
  const present = new Set(current.map(nameIdentity));
  return operation === 'add'
    ? [...current, ...requested.filter(name => !present.has(nameIdentity(name)))]
    : current.filter(name => !selected.has(nameIdentity(name)));
}

function readTagList(data) {
  if (!Array.isArray(data?.tags)) throw tagError('TAG_READ_ERROR', 'getInventoryTags ha restituito un elenco non valido.');
  const tags = new Map();
  for (const tag of data.tags) {
    const id = Number(tag?.tag_id);
    if (typeof tag?.name !== 'string' || !tag.name.trim() || !Number.isSafeInteger(id) || id <= 0) {
      throw tagError('TAG_READ_ERROR', 'getInventoryTags ha restituito un tag non valido.');
    }
    const name = cleanName(tag.name);
    const key = nameIdentity(name);
    if (!tags.has(key)) tags.set(key, { name, id });
  }
  return tags;
}

function alreadyExists(error) {
  return /tag.{0,100}(?:already exists?|name (?:already )?exists?|già esistente|esiste già)/i.test(error?.message ?? '') &&
    !/does not exist|not exist/i.test(error?.message ?? '');
}

/** A short-lived service: one remote read per preflight/import, one in-flight create per name. */
export function createInventoryTagService({ request, isSimulation, initialTags = null }) {
  if (typeof request !== 'function' || typeof isSimulation !== 'function') throw new Error('Servizio Product Tags non configurato.');
  let tags = initialTags == null ? null : readTagList({ tags: initialTags });
  let loading = null;
  const inFlight = new Map();
  let createQueue = Promise.resolve();

  async function refresh() {
    let data;
    try { data = await request('getInventoryTags'); }
    catch (error) { throw tagError('TAG_READ_ERROR', `impossibile leggere i Product Tags Base.com: ${error.message}`, { cause: error }); }
    tags = readTagList(data);
    return tags;
  }

  async function current() {
    if (tags) return tags;
    loading ??= refresh().finally(() => { loading = null; });
    return loading;
  }

  async function create(name) {
    const key = nameIdentity(name);
    if (tags.has(key)) return tags.get(key).name;
    if (inFlight.has(key)) return inFlight.get(key);
    const task = createQueue.then(async () => {
      if (tags.has(key)) return tags.get(key).name;
      try {
        const result = await request('addInventoryTag', { name });
        const id = Number(result?.tag_id);
        if (!Number.isSafeInteger(id) || id <= 0) throw new Error('addInventoryTag senza tag_id valido.');
        tags.set(key, { name, id });
        return name;
      } catch (error) {
        if (alreadyExists(error) || error.uncertain) {
          try {
            const refreshed = await refresh();
            if (refreshed.has(key)) return refreshed.get(key).name;
          } catch (readError) {
            throw tagError('TAG_CREATE_ERROR', `"${name}": riconciliazione non riuscita: ${readError.message}`, { tagName: name, cause: error });
          }
        }
        throw tagError('TAG_CREATE_ERROR', `"${name}" non creato: ${error.message}`, { tagName: name, cause: error });
      }
    });
    createQueue = task.catch(() => {});
    inFlight.set(key, task);
    try { return await task; }
    finally { if (inFlight.get(key) === task) inFlight.delete(key); }
  }

  return {
    async ensureInventoryTags(tagNames, { allowCreate = false } = {}) {
      const requested = normalizeInventoryTagNames(tagNames);
      if (requested === undefined) return { names: undefined, existing: [], wouldCreate: [], simulated: isSimulation() };
      if (requested.length === 0) return { names: [], existing: [], wouldCreate: [], simulated: isSimulation() };
      const available = await current();
      const existing = requested.filter(name => available.has(nameIdentity(name))).map(name => available.get(nameIdentity(name)).name);
      const missing = requested.filter(name => !available.has(nameIdentity(name)));
      const wouldCreate = allowCreate && !isSimulation() ? [] : missing;
      if (allowCreate && !isSimulation()) await Promise.all(missing.map(create));
      return { names: requested.map(name => tags.get(nameIdentity(name))?.name ?? name),
        existing, wouldCreate, simulated: isSimulation() };
    },
    snapshot() { return tags ? [...tags.values()].map(tag => ({ tag_id: tag.id, name: tag.name })) : null; },
  };
}
