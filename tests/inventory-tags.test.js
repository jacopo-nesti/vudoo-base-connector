import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryTagService, normalizeInventoryTagNames } from '../src/inventoryTags.js';
import { buildBasePayload, buildBaseUpdatePayload } from '../src/products.js';
import { basePayloadPreview } from '../src/marketplaces/base/localPreview.js';

const config = { inventory: { inventory_id: 10 }, priceGroup: { price_group_id: 20, currency: 'EUR' } };
const product = { sku: 'SKU-A', title: 'Prodotto', price: 10 };
const remote = names => names.map((name, index) => ({ tag_id: index + 1, name }));
function fixture(names = [], simulation = false, createResponse = null) {
  const calls = [];
  const tags = remote(names);
  const request = async (method, parameters) => {
    calls.push({ method, parameters });
    if (method === 'getInventoryTags') return { status: 'SUCCESS', tags: [...tags] };
    if (method === 'addInventoryTag') {
      if (createResponse) return createResponse(parameters.name, tags);
      const tag_id = tags.length + 1;
      tags.push({ tag_id, name: parameters.name });
      return { status: 'SUCCESS', tag_id };
    }
    throw new Error(`Metodo inatteso: ${method}`);
  };
  return { calls, tags, service: createInventoryTagService({ request, isSimulation: () => simulation }) };
}

test('tag esistenti: lettura unica, nomi canonici Base e zero create', async () => {
  const { service, calls } = fixture(['Unisex', 'Profumo di nicchia']);
  const plan = await service.ensureInventoryTags(['unisex', 'Profumo di nicchia'], { allowCreate: true });
  assert.deepEqual(plan.names, ['Unisex', 'Profumo di nicchia']);
  assert.deepEqual(plan.wouldCreate, []);
  assert.deepEqual(calls.map(call => call.method), ['getInventoryTags']);
});

test('REALE: uno o più tag mancanti vengono creati prima di restituire i nomi finali', async () => {
  const { service, calls } = fixture(['Unisex']);
  const plan = await service.ensureInventoryTags(['unisex', 'Incenso', 'Oud'], { allowCreate: true });
  assert.deepEqual(plan.names, ['Unisex', 'Incenso', 'Oud']);
  assert.deepEqual(calls.map(call => call.method), ['getInventoryTags', 'addInventoryTag', 'addInventoryTag']);
  assert.deepEqual(calls.filter(call => call.method === 'addInventoryTag').map(call => call.parameters),
    [{ name: 'Incenso' }, { name: 'Oud' }]);
});

test('SIMULAZIONE: legge e pianifica, senza creare tag', async () => {
  const { service, calls } = fixture(['Unisex'], true);
  const plan = await service.ensureInventoryTags(['unisex', 'Incenso', 'Oud'], { allowCreate: true });
  assert.deepEqual(plan.existing, ['Unisex']);
  assert.deepEqual(plan.wouldCreate, ['Incenso', 'Oud']);
  assert.equal(plan.simulated, true);
  assert.deepEqual(calls.map(call => call.method), ['getInventoryTags']);
});

test('trim, vuoti e duplicati case-insensitive conservano la prima forma leggibile', () => {
  assert.deepEqual(normalizeInventoryTagNames(['Unisex', ' unisex ', 'INCENSO', '', '  ']), ['Unisex', 'INCENSO']);
  assert.deepEqual(normalizeInventoryTagNames([]), []);
  assert.equal(normalizeInventoryTagNames(undefined), undefined);
});

test('TAG_TOO_LONG non tronca e ferma prima di qualunque richiesta', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.ensureInventoryTags(['x'.repeat(26)], { allowCreate: true }), error =>
    error.code === 'TAG_TOO_LONG' && error.length === 26 && error.maximum === 25);
  assert.deepEqual(calls, []);
});

test('race remoto: un errore nome già esistente viene riconciliato tramite GET', async () => {
  const { service, calls } = fixture([], false, (name, tags) => {
    tags.push({ tag_id: 7, name });
    throw new Error('ERROR_INVALID_DATA - Tag with given name already exists.');
  });
  const plan = await service.ensureInventoryTags(['Incenso'], { allowCreate: true });
  assert.deepEqual(plan.names, ['Incenso']);
  assert.deepEqual(calls.map(call => call.method), ['getInventoryTags', 'addInventoryTag', 'getInventoryTags']);
});

test('20 richieste concorrenti allo stesso tag condividono una sola creazione', async () => {
  const { service, calls } = fixture();
  const plans = await Promise.all(Array.from({ length: 20 }, () =>
    service.ensureInventoryTags(['Incenso'], { allowCreate: true })));
  assert.equal(plans.every(plan => plan.names[0] === 'Incenso'), true);
  assert.equal(calls.filter(call => call.method === 'getInventoryTags').length, 1);
  assert.equal(calls.filter(call => call.method === 'addInventoryTag').length, 1);
});

test('GET fallita impedisce create; errore create non viene confuso con una race', async () => {
  const read = createInventoryTagService({ request: async () => { throw new Error('Base offline'); }, isSimulation: () => false });
  await assert.rejects(read.ensureInventoryTags(['Incenso'], { allowCreate: true }), { code: 'TAG_READ_ERROR' });
  const { service, calls } = fixture([], false, () => { throw new Error('Autorizzazione negata'); });
  await assert.rejects(service.ensureInventoryTags(['Incenso'], { allowCreate: true }), { code: 'TAG_CREATE_ERROR' });
  assert.deepEqual(calls.map(call => call.method), ['getInventoryTags', 'addInventoryTag']);
});

test('assenza tags mantiene il campo omesso anche in UPDATE; [] è cancellazione esplicita', () => {
  const desired = buildBasePayload(product, config);
  assert.equal(Object.hasOwn(desired, 'tags'), false);
  const existing = { sku: 'SKU-A', text_fields: { name: 'Prodotto' }, prices: { 20: 9 }, tags: ['Esistente'] };
  const update = buildBaseUpdatePayload(product, existing, config);
  assert.equal(Object.hasOwn(update, 'tags'), false);
  assert.deepEqual(buildBasePayload({ ...product, tags: [] }, config).tags, []);
  assert.deepEqual(buildBaseUpdatePayload({ ...product, tags: [] }, existing, config).tags, []);
  assert.equal(Object.hasOwn(basePayloadPreview(product).payload, 'tags'), false);
  assert.deepEqual(basePayloadPreview({ ...product, tags: [] }).payload.tags, []);
});
