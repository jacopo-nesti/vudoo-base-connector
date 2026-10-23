import { PRODUCT_FIELDS, getField, hasValue, validateFieldInput } from '../../productSchema.js';
import { diagnostic, summarizeDiagnostics } from '../diagnostics.js';
import { normalizeInventoryTagNames } from '../../inventoryTags.js';

export function baseFieldMatrix(product) {
  return PRODUCT_FIELDS.map(field => {
    const value = getField(product, field.key);
    let valid = true;
    if (field.base && field.editable && hasValue(value)) {
      try { validateFieldInput(field.key, value); } catch { valid = false; }
    }
    return { key: field.key, label: field.label, baseField: field.base ?? null,
      status: !field.base ? 'NOT_SUPPORTED' : !valid ? 'INVALID' : hasValue(value) ? 'POPULATED' : 'SUPPORTED_EMPTY',
      value: value ?? null };
  });
}

function webUrl(value) { return !value || (URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol)); }

/** Local checks only. Remote inventory, category and profile checks remain in the existing Base preflight. */
export function baseLocalPreflight(product) {
  const checks = [];
  const add = values => checks.push(diagnostic({ marketplace: 'base', ...values }));
  const sku = product?.id;
  add({ code: 'sku', field: 'id', status: typeof sku === 'string' && sku.trim() ? 'PASS' : 'BLOCKING',
    message: sku ? 'Identità Vudoo disponibile.' : 'ID Vudoo mancante: impossibile identificare il prodotto su Base.com.',
    currentValue: sku ?? null, suggestedAction: sku ? null : 'Correggere il feed supplier.' });
  const title = product?.title;
  add({ code: 'title', field: 'title', status: typeof title === 'string' && title.trim() ? 'PASS' : 'BLOCKING',
    message: title ? 'Titolo presente.' : 'Titolo mancante.', currentValue: title ?? null,
    suggestedAction: title ? null : 'Aprire Contenuto e compilare il titolo.' });
  const price = product?.price;
  const priceOk = typeof price === 'number' && Number.isFinite(price) && price >= 0;
  add({ code: 'price', field: 'price', status: priceOk ? 'PASS' : 'BLOCKING',
    message: priceOk ? 'Prezzo EUR valido.' : 'Prezzo EUR mancante o non valido.', currentValue: price ?? null,
    suggestedAction: priceOk ? null : 'Aprire Commerciale e inserire un prezzo EUR valido.' });
  const category = product?.canonical_category;
  const mapped = typeof category === 'string' && category.trim() && Array.isArray(product?.base_category_path) && product.base_category_path.length;
  add({ code: 'category', field: 'canonical_category', status: mapped ? 'PASS' : 'WARNING',
    message: mapped ? 'Categoria canonica e percorso Base disponibili.' : 'Categoria Base.com non assegnata. Il prodotto verrà importato senza categoria.',
    currentValue: category ?? product?.product_type ?? null,
    suggestedAction: mapped ? null : 'Assegnare la categoria su Base.com o completare il mapping in seguito.' });
  const sourceEan = product?.source?.ean;
  const ean = product?.ean;
  const eanValid = !ean || typeof ean === 'string' && /^\d{8,14}$/.test(ean);
  const rawInvalid = sourceEan != null && String(sourceEan).trim() && !/^\d{8,14}$/.test(String(sourceEan));
  add({ code: 'ean', field: 'ean', status: !eanValid ? 'BLOCKING' : rawInvalid ? 'WARNING' : 'PASS',
    message: !eanValid ? 'EAN effettivo non valido.' : rawInvalid ? 'EAN supplier non valido: omesso finché non viene corretto.' : ean ? 'EAN valido.' : 'EAN assente: campo opzionale.',
    currentValue: !eanValid ? ean : rawInvalid ? sourceEan : ean ?? null,
    suggestedAction: !eanValid || rawInvalid ? 'Aprire Identità e correggere o svuotare esplicitamente l’EAN.' : null });
  const image = product?.image_link;
  const hasManualImage = (product?.manual_images?.length ?? 0) > 0;
  add({ code: 'image', field: 'image_link', status: image && !webUrl(image) ? 'BLOCKING' : image || hasManualImage ? 'PASS' : 'WARNING',
    message: image && !webUrl(image) ? 'URL immagine principale non valido.' : image ? 'Immagine principale presente.' : hasManualImage ? 'Immagine manuale locale disponibile.' : 'Immagine principale mancante: Base.com la accetta come campo opzionale.',
    currentValue: image ?? null, suggestedAction: image && !webUrl(image) ? 'Correggere l’URL nella sezione Media.' : image ? null : 'Aggiungere un’immagine in Media se disponibile.' });
  const additionalCount = Array.isArray(product?.additional_image_link) ? product.additional_image_link.length
    : product?.additional_image_link ? 1 : 0;
  const imageCount = (image ? 1 : 0) + additionalCount + (product?.manual_images?.length ?? 0);
  add({ code: 'image_count', field: 'manual_images', status: imageCount > 16 ? 'BLOCKING' : 'PASS',
    message: imageCount > 16 ? 'La gallery effettiva supera il limite Base.com di 16 immagini.' : 'Numero immagini entro il limite Base.com.',
    currentValue: imageCount, suggestedAction: imageCount > 16 ? 'Rimuovi immagini manuali non necessarie.' : null });
  const weight = product?.weight;
  add({ code: 'weight', field: 'weight', status: weight == null ? 'WARNING' : Number.isFinite(weight) && weight >= 0 ? 'PASS' : 'BLOCKING',
    message: weight == null ? 'Peso mancante: campo opzionale.' : Number.isFinite(weight) && weight >= 0 ? 'Peso valido.' : 'Peso non valido.',
    currentValue: weight ?? null, suggestedAction: weight == null ? 'Compilare il peso nella sezione Fisico se noto.' : null });
  const result = summarizeDiagnostics(checks);
  const blockers = checks.filter(item => item.blocking);
  const status = blockers.some(item => item.code === 'ean') ? 'INVALID_EAN'
      : blockers.some(item => ['sku', 'title', 'price'].includes(item.code)) ? 'MISSING_REQUIRED_DATA'
        : blockers.length ? 'INVALID_VALUE' : 'BASE_READY';
  return { marketplace: 'base', status, checks, ...result, remoteCheckRequired: true };
}

/** Full field accounting; unresolved Base IDs are explicit, never fabricated. */
export function basePayloadPreview(product, { tagPlan = null } = {}) {
  const payload = {};
  for (const key of ['sku', 'ean', 'weight', 'tax_rate', 'height', 'width', 'length']) {
    payload[key] = product?.[key] ?? null;
  }
  payload.text_fields = Object.fromEntries([
    ['name', product?.title ?? null], ['description', product?.description ?? null],
    ...[1, 2, 3, 4].map(index => [`description_extra${index}`, product?.[`description_extra${index}`] ?? null]),
    ['features', product?.features ?? {}],
  ]);
  payload.images = { '0': product?.image_link ? `url:${product.image_link}` : null };
  const additional = Array.isArray(product?.additional_image_link) ? product.additional_image_link
    : product?.additional_image_link ? [product.additional_image_link] : [];
  additional.slice(0, 15).forEach((url, index) => { payload.images[String(index + 1)] = url ? `url:${url}` : null; });
  const manualImages = (product?.manual_images ?? []).map(image => ({ name: image.name,
    size: image.size, status: 'Da preparare per Base.com al momento dell’import' }));
  const tags = normalizeInventoryTagNames(product?.tags);
  if (tags !== undefined) payload.tags = tagPlan?.names ?? tags;
  return { payload, unresolved: {
    inventory_id: 'Risolto dal preflight remoto Base', category_id: product?.base_category_path?.length
      ? 'Risolto dal percorso canonico' : 'Ommesso: nessuna categoria Base verificata',
    manufacturer_id: 'Risolto dal brand', prices: product?.price ?? null, stock: product?.quantity ?? null,
    extra_fields: product?.additional_fields ?? {}, manual_images: manualImages,
  }, fields: baseFieldMatrix(product), tagPlan,
    note: 'I null indicano campi supportati ma vuoti nella vista locale; non vengono inviati come cancellazioni automatiche.' };
}

export function assertBaseLocalSendable(rows, selectedIds) {
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const id of selectedIds) {
    const row = byId.get(id);
    if (!row || !row.basePreflight?.canSend) {
      const issue = row?.basePreflight?.checks?.find(check => check.blocking);
      throw new Error(`Base.com: prodotto ${id || '(ID mancante)'} bloccato. ${issue?.message ?? 'Ripetere il preflight.'} ${issue?.suggestedAction ?? ''}`.trim());
    }
  }
}
