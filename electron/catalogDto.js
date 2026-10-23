import { PRODUCT_FIELDS, BULK_BASE_FIELDS } from '../src/productSchema.js';
import { resolveProductValue } from './effectiveProduct.js';
import { productOverrideRevision } from './productOverrides.js';

export function toCatalogProductDto(product, { source = product.source ?? product,
  canonical = product, manual = {}, base = {}, storedOverrides = null,
  basePreflight = null, supplier = null } = {}) {
  const provenance = Object.fromEntries(PRODUCT_FIELDS.map(field => [field.key,
    resolveProductValue({ source, canonical, manual, marketplace: base, key: field.key })]));
  provenance.tags = resolveProductValue({ source, canonical, manual, marketplace: base, key: 'tags' });
  const operational = Object.fromEntries(BULK_BASE_FIELDS.map(field => [field.key, provenance[field.key].value]));
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    brand: product.brand,
    price: operational.price,
    category: product.product_type,
    mpn: product.mpn,
    size: product.size,
    color: product.color,
    itemGroupId: product.item_group_id,
    ean: product.ean,
    description: product.description,
    tags: provenance.tags.value,
    availability: product.availability,
    quantity: operational.quantity,
    tax_rate: operational.tax_rate,
    weight: operational.weight,
    height: operational.height,
    width: operational.width,
    length: operational.length,
    condition: product.condition,
    supplier,
    sourceCategory: source?.product_type ?? null,
    canonicalCategory: product?.canonical_category ?? null,
    imageLink: product.image_link ?? null,
    additionalImages: product.additional_image_link ?? [],
    manualImages: product.manual_images ?? [],
    provenance,
    manualOverrides: { ...manual },
    baseOverrides: { ...base },
    overrideRevision: productOverrideRevision(storedOverrides ?? { ...manual, ...(Object.keys(base).length ? { base } : {}) }),
    basePreflight,
  };
}
