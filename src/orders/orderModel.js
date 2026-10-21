import { reviewOrder } from './orderReview.js';

const value = input => input === '' || input === undefined || input === null ? null : input;
const readableName = input => typeof input === 'string' && input.trim() && input.trim() !== '-'
  ? input.trim() : null;
const fields = (source, names) => Object.fromEntries(names.map(name => [name, value(source[name])]));

export function parseOrderId(input) {
  const raw = typeof input === 'number' ? String(input) : input;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw.trim())) return null;
  const id = Number(raw.trim());
  return Number.isSafeInteger(id) ? id : null;
}

export function normalizeOrder(raw, expectedId, statuses = [], sources = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || parseOrderId(raw.order_id) !== expectedId) {
    throw Object.assign(new Error('Invalid order response'), { code: 'invalidResponse' });
  }
  const shipping = fields(raw, [
    'delivery_fullname', 'delivery_company', 'delivery_address', 'delivery_postcode',
    'delivery_city', 'delivery_state', 'delivery_country', 'delivery_country_code',
    'delivery_method', 'delivery_price', 'delivery_point_id', 'delivery_point_name',
    'delivery_point_address', 'delivery_point_postcode', 'delivery_point_city',
  ]);
  const billing = fields(raw, [
    'invoice_fullname', 'invoice_company', 'invoice_nip', 'invoice_address',
    'invoice_postcode', 'invoice_city', 'invoice_state', 'invoice_country',
    'invoice_country_code', 'want_invoice',
  ]);
  const products = Array.isArray(raw.products) ? raw.products.map(product => fields(product || {}, [
    'order_product_id', 'product_id', 'variant_id', 'transaction_id', 'transaction2_id',
    'name', 'sku', 'ean', 'quantity', 'price_brutto', 'tax_rate', 'attributes',
  ])) : [];
  const status = Array.isArray(statuses)
    ? statuses.find(item => String(item.id) === String(raw.order_status_id)) : null;
  const sourceName = readableName(sources?.[raw.order_source]?.[raw.order_source_id])
    ?? readableName(raw.order_source_info);
  const order = {
    identity: fields(raw, ['order_id', 'shop_order_id', 'external_order_id', 'order_source',
      'order_source_id', 'order_source_info', 'date_add', 'date_confirmed',
      'order_status_id', 'confirmed']),
    statusName: readableName(status?.name),
    sourceName, customer: { ...fields(raw, ['email', 'phone']),
      displayName: value(raw.delivery_fullname) ?? value(raw.invoice_fullname) },
    shipping, billing, products,
    economics: fields(raw, ['currency', 'payment_method', 'payment_method_cod',
      'payment_done', 'delivery_price']),
    extras: {
      ...fields(raw, ['user_comments', 'admin_comments', 'extra_field_1', 'extra_field_2']),
      custom_extra_fields: raw.custom_extra_fields && typeof raw.custom_extra_fields === 'object'
        ? raw.custom_extra_fields : null,
      discounts: Array.isArray(raw.discounts) ? raw.discounts.map(discount => fields(discount, [
        'type', 'discount_amount', 'discount_currency', 'order_product_id',
      ])) : null,
    },
  };
  order.quality = reviewOrder(order);
  return order;
}
