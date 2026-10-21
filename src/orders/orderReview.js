const REQUIRED_SHIPPING = Object.freeze({
  delivery_fullname: 'Destinatario', delivery_address: 'Indirizzo di spedizione',
  delivery_postcode: 'CAP', delivery_city: 'Città', delivery_country: 'Paese',
  delivery_country_code: 'Codice Paese',
});
const COUNTRY_CODES = ['AT', 'BE', 'BG', 'CH', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR',
  'GB', 'GR', 'HR', 'HU', 'IE', 'IT', 'LU', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'US'];
const countryNames = new Map();
for (const locale of ['en', 'it']) {
  const display = new Intl.DisplayNames([locale], { type: 'region' });
  for (const code of COUNTRY_CODES) countryNames.set(display.of(code).toLocaleLowerCase(locale), code);
}
const present = value => value !== null && value !== undefined && String(value).trim() !== '';
const number = value => present(value) && Number.isFinite(Number(value)) ? Number(value) : null;

export function reviewOrder(order) {
  const missingShipping = Object.keys(REQUIRED_SHIPPING).filter(key => !present(order.shipping?.[key]));
  const presentShipping = Object.keys(REQUIRED_SHIPPING).filter(key => present(order.shipping?.[key]));
  const issues = missingShipping.map(key => `${REQUIRED_SHIPPING[key]} mancante`);
  if (!present(order.customer?.email)) issues.push('Email cliente mancante');
  const country = String(order.shipping?.delivery_country || '').trim().toLocaleLowerCase('it');
  const countryCode = String(order.shipping?.delivery_country_code || '').trim().toUpperCase();
  const recognizedCode = countryNames.get(country);
  if (recognizedCode && countryCode && recognizedCode !== countryCode) {
    issues.push(`Paese e codice Paese incoerenti: ${order.shipping.delivery_country} / ${countryCode}`);
  }
  const products = Array.isArray(order.products) ? order.products : [];
  if (!products.length) issues.push('Prodotti non disponibili');
  for (const [index, product] of products.entries()) {
    const label = product.sku || product.name || `riga ${index + 1}`;
    const rate = number(product.tax_rate);
    if (rate === null) issues.push(`IVA assente: ${label}`);
    else if (rate === 0) issues.push(`IVA da verificare: ${label} · Base.com: 0%`);
    else if (rate !== 22) issues.push(`IVA da verificare: ${label} · Base.com: ${rate}%`);
    if (number(product.price_brutto) === null || number(product.quantity) === null) {
      issues.push(`Dati economici insufficienti: ${label}`);
    }
  }
  if (!present(order.economics?.currency)) issues.push('Valuta mancante');
  if (number(order.economics?.delivery_price) === null) issues.push('Costo spedizione non disponibile');
  const paid = number(order.economics?.payment_done);
  const isCod = ['1', 'true'].includes(String(order.economics?.payment_method_cod).toLowerCase());
  if (paid === null) issues.push('Importo pagato non disponibile');
  else if (paid === 0 && !isCod && products.some(product => (number(product.price_brutto) ?? 0) > 0)) {
    issues.push('Pagamento da verificare: nessun importo registrato');
  }
  if (order.identity?.confirmed === false || order.identity?.confirmed === 0 || order.identity?.confirmed === '0') {
    issues.push('Ordine non confermato: dati provvisori');
  }
  return {
    status: issues.length ? 'Da verificare' : 'Completo', issues,
    missingShipping, presentShipping,
    reviewWithEtsy: String(order.identity?.order_source || '').toLowerCase() === 'etsy',
    unconfirmed: order.identity?.confirmed === false || order.identity?.confirmed === 0 || order.identity?.confirmed === '0',
  };
}
