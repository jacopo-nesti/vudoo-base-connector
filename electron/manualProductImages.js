import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { productKey } from './effectiveProduct.js';

export const MAX_LOCAL_IMAGE_BYTES = 4_000_000;
export const MAX_BASE_IMAGE_DATA_LENGTH = 2_000_000;

function imageError(code, message) { throw Object.assign(new Error(message), { code }); }

export function validateLocalImage(file) {
  const bytes = file?.bytes instanceof ArrayBuffer ? new Uint8Array(file.bytes) :
    file?.bytes instanceof Uint8Array ? file.bytes : null;
  if (!bytes?.length) imageError('INVALID_IMAGE', 'Il file è vuoto o non leggibile.');
  if (bytes.length > MAX_LOCAL_IMAGE_BYTES) imageError('IMAGE_TOO_LARGE', 'Immagine troppo grande: massimo 4 MB.');
  const name = file?.name;
  const mimeType = file?.mimeType;
  if (typeof name !== 'string' || name.length > 255) imageError('INVALID_IMAGE', 'Nome file non valido.');
  const jpeg = /\.jpe?g$/i.test(name) && mimeType === 'image/jpeg' && bytes.length > 4 &&
    bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const png = /\.png$/i.test(name) && mimeType === 'image/png' && bytes.length > 32 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) &&
    [73, 69, 78, 68].every((value, index) => bytes[bytes.length - 8 + index] === value);
  if (!jpeg && !png) imageError('INVALID_IMAGE', 'Seleziona un file JPG o PNG valido.');
  return { bytes, mimeType, name };
}

export function managedImagePath(root, id) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) imageError('INVALID_IMAGE', 'Identità immagine non valida.');
  return path.join(root, id);
}

export async function saveLocalProductImage({ root, filePath, overrides, companyCode, productId, file,
  writeOverrides }) {
  const { bytes, name, mimeType } = validateLocalImage(file);
  const key = productKey(companyCode, productId);
  const previous = overrides[key] ?? {};
  if ((previous.manual_images?.length ?? 0) >= 16) imageError('IMAGE_LIMIT', 'Sono già presenti 16 immagini manuali.');
  const id = randomUUID();
  const metadata = { id, name, mimeType, size: bytes.length };
  const next = { ...overrides, [key]: { ...previous,
    manual_images: [...(previous.manual_images ?? []), metadata] } };
  await mkdir(root, { recursive: true });
  const storedPath = managedImagePath(root, id);
  await writeFile(storedPath, bytes, { flag: 'wx' });
  try { await writeOverrides(filePath, next); }
  catch (error) { await unlink(storedPath).catch(() => {}); throw error; }
  return next;
}

export async function removeLocalProductImage({ root, filePath, overrides, companyCode, productId, imageId,
  writeOverrides }) {
  const key = productKey(companyCode, productId);
  const previous = overrides[key] ?? {};
  if (!previous.manual_images?.some(image => image.id === imageId)) imageError('IMAGE_NOT_FOUND', 'Immagine manuale non trovata.');
  const manualImages = previous.manual_images.filter(image => image.id !== imageId);
  const fields = { ...previous };
  if (manualImages.length) fields.manual_images = manualImages;
  else delete fields.manual_images;
  const next = { ...overrides };
  if (Object.keys(fields).length) next[key] = fields;
  else delete next[key];
  await writeOverrides(filePath, next);
  await unlink(managedImagePath(root, imageId)).catch(() => {});
  return next;
}

export async function readLocalImage(root, metadata) {
  let bytes;
  try { bytes = await readFile(managedImagePath(root, metadata.id)); }
  catch { imageError('IMAGE_FILE_MISSING', 'File immagine locale non disponibile: rimuovilo e aggiungilo di nuovo.'); }
  validateLocalImage({ name: metadata.name, mimeType: metadata.mimeType, bytes });
  if (bytes.length !== metadata.size) imageError('INVALID_IMAGE', 'L’immagine locale è cambiata: rimuovila e aggiungila di nuovo.');
  return bytes;
}

export async function markLocalImagesUploaded({ filePath, overrides, companyCode, productId,
  baseProductId, assignments, writeOverrides }) {
  const key = productKey(companyCode, productId);
  const previous = overrides[key];
  if (!previous?.manual_images?.length) return overrides;
  const positions = new Map(assignments.map(item => [item.id, item.position]));
  const manualImages = previous.manual_images.map(image => positions.has(image.id)
    ? { ...image, base: { productId: Number(baseProductId), position: positions.get(image.id) } }
    : image);
  const next = { ...overrides, [key]: { ...previous, manual_images: manualImages } };
  await writeOverrides(filePath, next);
  return next;
}

export function pendingLocalImages(images, existing, baseProductId) {
  return (images ?? []).filter(image =>
    !(baseProductId && image.base?.productId === baseProductId &&
      existing?.images?.[String(image.base.position)]));
}

export async function imageForBase(root, metadata, optimize) {
  const bytes = await readLocalImage(root, metadata);
  const encoded = `data:${bytes.toString('base64')}`;
  if (encoded.length <= MAX_BASE_IMAGE_DATA_LENGTH) return encoded;
  const optimized = await optimize(bytes, metadata.mimeType);
  if (!Buffer.isBuffer(optimized) || !optimized.length ||
      `data:${optimized.toString('base64')}`.length > MAX_BASE_IMAGE_DATA_LENGTH) {
    imageError('OPTIMIZATION_FAILED', 'Non è stato possibile ottimizzare l’immagine entro il limite Base.com di 2 MB.');
  }
  return `data:${optimized.toString('base64')}`;
}

export function optimizeWithNativeImage(nativeImage, bytes, mimeType) {
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) imageError('INVALID_IMAGE', 'Immagine locale non decodificabile.');
  const size = image.getSize();
  for (const edge of [Math.max(size.width, size.height), 2400, 1800, 1400, 1100, 800]) {
    const scale = Math.min(1, edge / Math.max(size.width, size.height));
    const resized = scale === 1 ? image : image.resize({ width: Math.max(1, Math.round(size.width * scale)),
      height: Math.max(1, Math.round(size.height * scale)) });
    const candidates = mimeType === 'image/png' ? [resized.toPNG()] : [resized.toJPEG(88), resized.toJPEG(78)];
    for (const candidate of candidates) {
      if (`data:${candidate.toString('base64')}`.length <= MAX_BASE_IMAGE_DATA_LENGTH) return candidate;
    }
  }
  imageError('OPTIMIZATION_FAILED', 'Non è stato possibile ottimizzare l’immagine entro il limite Base.com di 2 MB.');
}
