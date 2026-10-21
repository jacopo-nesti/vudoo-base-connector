const shippingFields = [
  ['delivery_fullname', 'Destinatario'], ['delivery_company', 'Azienda'],
  ['delivery_address', 'Via e numero'], ['delivery_postcode', 'CAP'],
  ['delivery_city', 'Città'], ['delivery_state', 'Provincia / regione'],
  ['delivery_country', 'Paese'], ['delivery_country_code', 'Codice Paese'],
  ['delivery_method', 'Metodo di spedizione'], ['delivery_point_id', 'ID punto di ritiro'],
  ['delivery_point_name', 'Punto di ritiro'], ['delivery_point_address', 'Indirizzo punto di ritiro'],
  ['delivery_point_postcode', 'CAP punto di ritiro'], ['delivery_point_city', 'Città punto di ritiro'],
];
const billingFields = [
  ['invoice_fullname', 'Intestatario'], ['invoice_company', 'Azienda'],
  ['invoice_nip', 'Partita IVA / codice fiscale'], ['invoice_address', 'Via e numero'],
  ['invoice_postcode', 'CAP'], ['invoice_city', 'Città'],
  ['invoice_state', 'Provincia / regione'], ['invoice_country', 'Paese'],
  ['invoice_country_code', 'Codice Paese'], ['want_invoice', 'Fattura richiesta'],
];
export const shown = value => value === null || value === undefined || value === '' ? 'Non disponibile' : String(value);
export const orderDate = value => Number.isFinite(Number(value)) && Number(value) > 0
  ? new Date(Number(value) * 1000).toLocaleString('it-IT') : 'Non disponibile';
const confirmed = value => value === true || value === 1 || value === '1'
  ? 'Sì' : value === false || value === 0 || value === '0' ? 'No' : 'Non disponibile';
const amount = value => value != null && Number.isFinite(Number(value)) ? Number(value).toFixed(2) : 'Non disponibile';
function DataCard({ title, data, fields }) {
  return <section className="card order-card"><h2>{title}</h2><dl className="order-fields">{fields.map(([key, label]) =>
    <div key={key}><dt>{label}</dt><dd>{shown(data?.[key])}</dd></div>
  )}</dl></section>;
}

export default function OrderDetail({ order, onBack, onRefresh, refreshing }) {
  const identity = order.identity;
  const products = order.products || [];
  const productSubtotal = products.length && products.every(item => item.price_brutto != null && item.quantity != null &&
    Number.isFinite(Number(item.price_brutto)) && Number.isFinite(Number(item.quantity)))
    ? products.reduce((sum, item) => sum + Number(item.price_brutto) * Number(item.quantity), 0) : null;
  return <div className="page-stack">
    <div className="order-result-heading"><button className="btn btn-secondary" type="button" onClick={onBack}>← Torna alla lista</button><div><strong>Ordine {shown(identity.order_id)}</strong><small>Letto il {order.fetchedAt ? new Date(order.fetchedAt).toLocaleString('it-IT') : 'adesso'}</small></div><button className="btn btn-primary" type="button" disabled={refreshing} onClick={onRefresh}>{refreshing ? 'Aggiornamento…' : 'Aggiorna questo ordine'}</button></div>
    {order.quality.unconfirmed && <div className="alert alert-warning" role="alert"><strong>Ordine non confermato.</strong> I dati e i prodotti potrebbero essere provvisori o incompleti.</div>}
    <div className="order-grid">
      <section className="card order-card"><h2>Identificativi</h2><dl className="order-fields">
        <div><dt>ID Base.com</dt><dd>{shown(identity.order_id)}</dd></div>
        <div><dt>Numero marketplace</dt><dd>{shown(identity.external_order_id)}</dd></div>
        <div><dt>ID negozio</dt><dd>{shown(identity.shop_order_id)}</dd></div>
        <div><dt>Marketplace</dt><dd>{shown(identity.order_source)}</dd></div>
        <div><dt>Sorgente / negozio</dt><dd>{shown(order.sourceName)}</dd></div>
        <div><dt>ID sorgente</dt><dd>{shown(identity.order_source_id)}</dd></div>
        <div><dt>Data ordine</dt><dd>{orderDate(identity.date_add)}</dd></div>
        <div><dt>Stato ordine</dt><dd>{shown(order.statusName)} · ID {shown(identity.order_status_id)}</dd></div>
        <div><dt>confirmed</dt><dd>{confirmed(identity.confirmed)}</dd></div>
      </dl></section>
      <DataCard title="Cliente" data={order.customer} fields={[
        ['displayName', 'Nome e cognome (spedizione, poi fatturazione)'], ['email', 'Email'], ['phone', 'Telefono'],
      ]} />
      <DataCard title="Spedizione" data={order.shipping} fields={shippingFields} />
      <DataCard title="Fatturazione" data={order.billing} fields={billingFields} />
    </div>
    <section className="card order-card"><h2>Prodotti</h2>{products.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Nome / identificativi</th><th>SKU</th><th>EAN</th><th>Quantità</th><th>Prezzo unitario lordo</th><th>IVA Base.com</th><th>Sconto riga da Base</th><th>Valore riga calcolato</th></tr></thead><tbody>{products.map((item, index) => { const lineDiscounts = order.extras?.discounts?.filter(discount => item.order_product_id != null && String(discount.order_product_id) === String(item.order_product_id)) || []; return <tr key={`${item.order_product_id ?? 'item'}-${index}`}><td>{shown(item.name)}<small>ID Base: {shown(item.product_id)} · ID riga: {shown(item.order_product_id)} · Marketplace: {shown(item.transaction_id)}</small></td><td>{shown(item.sku)}</td><td>{shown(item.ean)}</td><td>{shown(item.quantity)}</td><td>{amount(item.price_brutto)}</td><td>{item.tax_rate == null ? 'Non disponibile' : `${item.tax_rate}%`}{item.tax_rate != null && Number(item.tax_rate) !== 22 ? <span className="order-tax-warning"> · da verificare</span> : null}</td><td>{lineDiscounts.length ? lineDiscounts.map(discount => `${amount(discount.discount_amount)} ${shown(discount.discount_currency)}`).join(', ') : 'Non disponibile'}</td><td>{item.quantity != null && item.price_brutto != null ? amount(Number(item.quantity) * Number(item.price_brutto)) : 'Non disponibile'}</td></tr>; })}</tbody></table></div> : <p>Non disponibile</p>}</section>
    <section className="card order-card"><h2>Informazioni economiche e pagamento</h2><dl className="order-fields">
      <div><dt>Valore prodotti calcolato</dt><dd>{productSubtotal === null ? 'Non disponibile' : amount(productSubtotal)}</dd></div>
      <div><dt>Costo spedizione da Base</dt><dd>{amount(order.economics.delivery_price)}</dd></div>
      <div><dt>Totale ordine certo</dt><dd>Non disponibile</dd></div>
      <div><dt>Valuta</dt><dd>{shown(order.economics.currency)}</dd></div>
      <div><dt>Metodo pagamento</dt><dd>{shown(order.economics.payment_method)}</dd></div>
      <div><dt>Contrassegno</dt><dd>{shown(order.economics.payment_method_cod)}</dd></div>
      <div><dt>Importo pagato registrato</dt><dd>{amount(order.economics.payment_done)}</dd></div>
      <div><dt>Stato pagamento certo</dt><dd>Non disponibile</dd></div>
    </dl><p>Il valore prodotti è calcolato dalle righe; Base.com non restituisce qui un totale ordine certo. L’importo pagato non determina da solo lo stato del pagamento.</p>
    {order.extras?.discounts?.length ? <div className="order-discounts"><h3>Sconti restituiti da Base.com</h3><ul>{order.extras.discounts.map((discount, index) => <li key={index}>{shown(discount.type)} · {amount(discount.discount_amount)} {shown(discount.discount_currency)} · riga {shown(discount.order_product_id)}</li>)}</ul></div> : null}</section>
    <section className="card order-card"><h2>Verifica dati ordine</h2><strong className={order.quality.status === 'Completo' ? 'order-quality-good' : 'order-tax-warning'}>{order.quality.status}</strong>
      {order.quality.issues.length ? <ul className="order-issues">{order.quality.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : <p>Nessuna anomalia rilevata dai controlli disponibili.</p>}
      <p><strong>Codice Paese restituito dall’API:</strong> {shown(order.shipping.delivery_country_code)}</p>
      {order.quality.reviewWithEtsy && <p><strong>Da verificare con Etsy:</strong> confronta indirizzo e Paese con l’ordine originale prima dell’uso.</p>}
      <p>“Completo” indica solo che i controlli locali non hanno rilevato mancanze; non certifica l’esattezza dei dati.</p>
    </section>
    {(order.extras?.user_comments || order.extras?.admin_comments || order.extras?.extra_field_1 || order.extras?.extra_field_2 || order.extras?.custom_extra_fields) && <section className="card order-card"><h2>Altri dati Base.com</h2><dl className="order-fields">
      <div><dt>Commenti cliente</dt><dd>{shown(order.extras.user_comments)}</dd></div><div><dt>Note interne</dt><dd>{shown(order.extras.admin_comments)}</dd></div>
      <div><dt>Campo extra 1</dt><dd>{shown(order.extras.extra_field_1)}</dd></div><div><dt>Campo extra 2</dt><dd>{shown(order.extras.extra_field_2)}</dd></div>
      {Object.entries(order.extras.custom_extra_fields || {}).map(([key, value]) => <div key={key}><dt>Campo aggiuntivo {key}</dt><dd>{typeof value === 'string' || typeof value === 'number' ? shown(value) : 'File o dato strutturato disponibile su Base.com'}</dd></div>)}
    </dl></section>}
  </div>;
}
