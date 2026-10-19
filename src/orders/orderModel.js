const value = input => input === '' || input === undefined || input === null ? null : input;
const fields = (source, names) => Object.fromEntries(names.map(name => [name, value(source[name])]));

export function parseOrderId(input) {
  const raw = typeof input === 'number' ? String(input) : input;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw.trim())) return null;
  const id = Number(raw.trim());
  return Number.isSafeInteger(id) ? id : null;
}

export function normalizeOrder(raw, expectedId, statuses = []) {
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
  const requiredShipping = [
    'delivery_fullname', 'delivery_address', 'delivery_postcode', 'delivery_city',
    'delivery_country', 'delivery_country_code',
  ];
  const missingShipping = requiredShipping.filter(name => shipping[name] === null);
  const products = Array.isArray(raw.products) ? raw.products.map(product => fields(product || {}, [
    'order_product_id', 'name', 'sku', 'ean', 'quantity', 'price_brutto',
  ])) : [];
  const status = Array.isArray(statuses)
    ? statuses.find(item => String(item.id) === String(raw.order_status_id)) : null;
  return {
    identity: fields(raw, ['order_id', 'shop_order_id', 'external_order_id', 'order_source',
      'order_source_id', 'order_source_info', 'date_add', 'order_status_id', 'confirmed']),
    statusName: value(status?.name),
    customer: fields(raw, ['email', 'phone']),
    shipping, billing, products,
    economics: fields(raw, ['currency', 'payment_method', 'payment_method_cod',
      'payment_done', 'delivery_price']),
    quality: {
      missingShipping,
      presentShipping: requiredShipping.filter(name => shipping[name] !== null),
      reviewWithEtsy: String(raw.order_source || '').toLowerCase() === 'etsy',
      unconfirmed: raw.confirmed === false || raw.confirmed === 0 || raw.confirmed === '0',
    },
  };
}
