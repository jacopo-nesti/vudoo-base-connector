import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { saveLocalProductImage, removeLocalProductImage, readLocalImage, imageForBase,
  validateLocalImage, markLocalImagesUploaded, pendingLocalImages } from '../electron/manualProductImages.js';
import { loadProductOverrides, writeProductOverrides } from '../electron/productOverrides.js';
import { effectiveProduct, productKey } from '../electron/effectiveProduct.js';
import { buildBasePayload, buildBaseUpdatePayload, planManualImageData } from '../src/products.js';
import { baseLocalPreflight } from '../src/marketplaces/base/localPreview.js';

const jpegBytes = Uint8Array.from([255, 216, 255, 1, 2, 3, 255, 217]);
const file = { name: 'foto.jpg', mimeType: 'image/jpeg', bytes: jpegBytes };
const config = { inventory: { inventory_id: 12 }, priceGroup: { currency: 'EUR', price_group_id: 4 },
  warehouse: { id: 'bl_5' } };
const product = { id: 'P-1', sku: 'P-1', title: 'Test', price: 10,
  image_link: 'https://vudoo.test/main.jpg', additional_image_link: ['https://vudoo.test/extra.jpg'] };

async function withStore(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vudoo-manual-images-'));
  const root = path.join(directory, 'images');
  const filePath = path.join(directory, 'overrides.json');
  try { await run({ root, filePath }); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('immagine locale su prodotto assente da Base persiste dopo reload senza mutare Vudoo', async () => {
  await withStore(async ({ root, filePath }) => {
    const original = structuredClone(product);
    const overrides = await saveLocalProductImage({ root, filePath, overrides: {}, companyCode: 'C',
      productId: product.id, file, writeOverrides: writeProductOverrides });
    const reloaded = await loadProductOverrides(filePath);
    const meta = reloaded[productKey('C', product.id)].manual_images[0];
    assert.equal(meta.name, 'foto.jpg');
    assert.deepEqual(await readLocalImage(root, meta), Buffer.from(jpegBytes));
    const effective = effectiveProduct(product, reloaded[productKey('C', product.id)], 'base');
    assert.equal(effective.manual_images.length, 1);
    assert.deepEqual(product, original);
    assert.deepEqual(overrides, reloaded);
  });
});

test('rimozione elimina solo il file e override locale, non tocca Base', async () => {
  await withStore(async ({ root, filePath }) => {
    const saved = await saveLocalProductImage({ root, filePath, overrides: {}, companyCode: 'C',
      productId: product.id, file, writeOverrides: writeProductOverrides });
    const id = saved[productKey('C', product.id)].manual_images[0].id;
    const removed = await removeLocalProductImage({ root, filePath, overrides: saved, companyCode: 'C',
      productId: product.id, imageId: id, writeOverrides: writeProductOverrides });
    assert.deepEqual(removed, {});
    assert.deepEqual(await loadProductOverrides(filePath), {});
    await assert.rejects(readFile(path.join(root, id)));
  });
});

test('create compone Vudoo e manuali nell’ordine corretto, con una sola gallery', () => {
  const pending = [{ id: 'img-1', data: 'data:AAAA' }];
  const assigned = planManualImageData(product, null, pending);
  assert.equal(assigned[0].position, 3);
  const payload = buildBasePayload({ ...product, manual_images: [pending[0]], manual_image_data: assigned }, config);
  assert.deepEqual(payload.images, {
    0: 'url:https://vudoo.test/main.jpg', 1: 'url:https://vudoo.test/extra.jpg', 2: 'data:AAAA',
  });
  assert.equal(planManualImageData({ ...product, image_link: null, additional_image_link: [] }, null, pending)[0].position, 1);
});

test('update aggiunge alla prima posizione dopo Base e preserva gli slot occupati', () => {
  const existing = { sku: 'P-1', images: { 1: 'https://base.test/main.jpg',
    2: 'https://base.test/extra.jpg', 4: 'https://base.test/other.jpg' } };
  const assigned = planManualImageData(product, existing, [{ id: 'img-1', data: 'data:AAAA' }]);
  assert.equal(assigned[0].position, 3);
  const changes = buildBaseUpdatePayload({ ...product, manual_images: [{ id: 'img-1' }],
    manual_image_data: assigned }, existing, config);
  assert.deepEqual(changes.images, { 2: 'data:AAAA' });
  assert.equal(Object.hasOwn(changes.images, '0'), false);
  assert.equal(Object.hasOwn(changes.images, '1'), false);
  assert.deepEqual(existing.images, { 1: 'https://base.test/main.jpg',
    2: 'https://base.test/extra.jpg', 4: 'https://base.test/other.jpg' });
});

test('limite 16 non sovrascrive lo slot finale', () => {
  const existing = { images: Object.fromEntries(Array.from({ length: 16 }, (_, index) =>
    [index + 1, `https://base.test/${index + 1}.jpg`])) };
  assert.throws(() => planManualImageData(product, existing, [{ id: 'x', data: 'data:AAAA' }]), /16 immagini/);
  const manual = Array.from({ length: 15 }, (_, index) => ({ id: `image-${index}` }));
  assert.throws(() => buildBasePayload({ ...product, manual_images: manual }, config), /16 immagini/);
  assert.equal(baseLocalPreflight({ ...product, manual_images: manual }).checks
    .find(check => check.code === 'image_count').status, 'BLOCKING');
});

test('JPG/PNG validi fino a 4 MB; MIME e file oltre 4 MB rifiutati', () => {
  assert.equal(validateLocalImage(file).mimeType, 'image/jpeg');
  assert.throws(() => validateLocalImage({ ...file, mimeType: 'image/png' }), /JPG o PNG/);
  assert.throws(() => validateLocalImage({ ...file, bytes: new Uint8Array(4_000_001) }), /4 MB/);
  assert.throws(() => validateLocalImage({ ...file, bytes: new Uint8Array() }), /vuoto/);
});

test('file piccolo resta invariato; 2-4 MB viene ottimizzato solo per Base', async () => {
  await withStore(async ({ root, filePath }) => {
    const largeBytes = Buffer.alloc(2_500_000, 7);
    largeBytes.set([255, 216, 255], 0); largeBytes.set([255, 217], largeBytes.length - 2);
    const saved = await saveLocalProductImage({ root, filePath, overrides: {}, companyCode: 'C',
      productId: 'P-1', file: { ...file, bytes: largeBytes }, writeOverrides: writeProductOverrides });
    const meta = saved[productKey('C', 'P-1')].manual_images[0];
    let called = 0;
    const optimized = await imageForBase(root, meta, async () => { called++; return Buffer.from(jpegBytes); });
    assert.equal(called, 1);
    assert.equal(optimized, `data:${Buffer.from(jpegBytes).toString('base64')}`);
    assert.deepEqual(await readLocalImage(root, meta), largeBytes);
    await assert.rejects(imageForBase(root, meta, async () => largeBytes), /ottimizzare/);
    const smallSaved = await saveLocalProductImage({ root, filePath, overrides: saved, companyCode: 'C',
      productId: 'P-1', file, writeOverrides: writeProductOverrides });
    const smallMeta = smallSaved[productKey('C', 'P-1')].manual_images[1];
    assert.equal(await imageForBase(root, smallMeta, async () => { throw new Error('unexpected'); }),
      `data:${Buffer.from(jpegBytes).toString('base64')}`);
  });
});

test('registrazione Base dopo successo consente update idempotente e ricarica', async () => {
  await withStore(async ({ root, filePath }) => {
    const saved = await saveLocalProductImage({ root, filePath, overrides: {}, companyCode: 'C',
      productId: 'P-1', file, writeOverrides: writeProductOverrides });
    const id = saved[productKey('C', 'P-1')].manual_images[0].id;
    await markLocalImagesUploaded({ filePath, overrides: saved, companyCode: 'C', productId: 'P-1',
      baseProductId: 23, assignments: [{ id, position: 3 }], writeOverrides: writeProductOverrides });
    const reloaded = await loadProductOverrides(filePath);
    assert.deepEqual(reloaded[productKey('C', 'P-1')].manual_images[0].base, { productId: 23, position: 3 });
    assert.deepEqual(pendingLocalImages(reloaded[productKey('C', 'P-1')].manual_images,
      { images: { 3: 'https://base.test/uploaded.jpg' } }, 23), []);
    assert.equal(pendingLocalImages(reloaded[productKey('C', 'P-1')].manual_images,
      { images: {} }, 23).length, 1);
  });
});
