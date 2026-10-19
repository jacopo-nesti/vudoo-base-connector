import { useState } from 'react';
import '../ordersBeta.css';

const errorText = {
  invalidId: 'Inserisci un ID ordine Base.com numerico e positivo.',
  missingToken: 'Token Base.com non configurato. Controlla le impostazioni locali.',
  authentication: 'Autenticazione Base.com non valida. Verifica il token.',
  permission: 'Il token non dispone dei permessi per leggere gli ordini.',
  notFound: 'Ordine non trovato con questo ID.',
  timeout: 'Base.com non ha risposto in tempo. Riprova.',
  network: 'Connessione a Base.com non disponibile. Riprova.',
  invalidResponse: 'La risposta Base.com non è nel formato atteso.',
  apiError: 'Impossibile recuperare l’ordine da Base.com. Riprova.',
};
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
const shown = value => value === null || value === undefined || value === '' ? 'Non disponibile' : String(value);
const confirmed = value => value === true || value === 1 || value === '1'
  ? 'Sì' : value === false || value === 0 || value === '0' ? 'No' : 'Non disponibile';
const date = value => Number.isFinite(Number(value)) && Number(value) > 0
  ? new Date(Number(value) * 1000).toLocaleString('it-IT') : 'Non disponibile';
function DataCard({ title, data, fields }) {
  return <section className="card order-card"><h2>{title}</h2><dl className="order-fields">{fields.map(([key, label]) =>
    <div key={key}><dt>{label}</dt><dd>{shown(data?.[key])}</dd></div>
  )}</dl></section>;
}

export default function OrdersBetaPage() {
  const [id, setId] = useState('');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(null);
  async function fetchOrder(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setOrder(null); setFetchedAt(null);
    try {
      const response = await window.electronAPI.getBaseOrder(id.trim());
      if (!response?.ok) { setError(errorText[response?.code] || errorText.apiError); return; }
      setOrder(response.order);
      setFetchedAt(new Date().toLocaleString('it-IT'));
    } catch { setError(errorText.apiError); }
    finally { setBusy(false); }
  }
  const identity = order?.identity;
  const products = order?.products || [];
  const productSubtotal = products.length && products.every(item => item.price_brutto != null && item.quantity != null && Number.isFinite(Number(item.price_brutto)) && Number.isFinite(Number(item.quantity)))
    ? products.reduce((sum, item) => sum + Number(item.price_brutto) * Number(item.quantity), 0) : null;
  return <div className="page-stack orders-beta">
    <div className="page-heading"><div><h1>Ordini (Beta)</h1><p>Consultazione sperimentale di un singolo ordine Base.com. Solo lettura, nessun salvataggio o aggiornamento automatico.</p></div></div>
    <section className="card order-search"><form onSubmit={fetchOrder}><label className="form-field"><span>ID ordine Base.com</span><input className="input" type="text" inputMode="numeric" autoComplete="off" value={id} onChange={event => { setId(event.target.value); setOrder(null); setError(''); }} placeholder="Inserisci ID ordine" /></label><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Recupero in corso…' : 'Recupera ordine'}</button></form><p>Per verificare una correzione fatta su Base.com, premi di nuovo “Recupera ordine”.</p></section>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {busy && <div className="alert alert-info" role="status">Lettura dell’ordine in corso…</div>}
    {order && <>
      <div className="order-result-heading"><strong>Ordine {shown(identity.order_id)}</strong><span>Letto il {fetchedAt}</span></div>
      {order.quality.unconfirmed && <div className="alert alert-warning" role="alert"><strong>Ordine non confermato.</strong> I dati e i prodotti potrebbero essere provvisori o incompleti.</div>}
      <div className="order-grid">
        <section className="card order-card"><h2>Identificativi</h2><dl className="order-fields">
          <div><dt>ID Base.com</dt><dd>{shown(identity.order_id)}</dd></div>
          <div><dt>Numero marketplace</dt><dd>{shown(identity.external_order_id)}</dd></div>
          <div><dt>ID negozio</dt><dd>{shown(identity.shop_order_id)}</dd></div>
          <div><dt>Marketplace</dt><dd>{shown(identity.order_source)}</dd></div>
          <div><dt>Sorgente / negozio</dt><dd>{shown(identity.order_source_info)}{identity.order_source_id != null ? ` (ID ${identity.order_source_id})` : ''}</dd></div>
          <div><dt>Data ordine</dt><dd>{date(identity.date_add)}</dd></div>
          <div><dt>Stato ordine</dt><dd>{shown(order.statusName)} · ID {shown(identity.order_status_id)}</dd></div>
          <div><dt>confirmed</dt><dd>{confirmed(identity.confirmed)}</dd></div>
        </dl></section>
        <section className="card order-card"><h2>Cliente</h2><dl className="order-fields"><div><dt>Nome e cognome</dt><dd>Non disponibile</dd></div><div><dt>Email</dt><dd>{shown(order.customer.email)}</dd></div><div><dt>Telefono</dt><dd>{shown(order.customer.phone)}</dd></div></dl><p>getOrders restituisce i nominativi di spedizione e fatturazione nelle rispettive sezioni.</p></section>
        <DataCard title="Spedizione" data={order.shipping} fields={shippingFields} />
        <DataCard title="Fatturazione" data={order.billing} fields={billingFields} />
      </div>
      <section className="card order-card"><h2>Prodotti</h2>{products.length ? <div className="table-scroll"><table className="table"><thead><tr><th>Nome</th><th>SKU</th><th>EAN</th><th>Quantità</th><th>Prezzo unitario lordo</th><th>Valore riga calcolato</th></tr></thead><tbody>{products.map((item, index) => <tr key={`${item.order_product_id ?? 'item'}-${index}`}><td>{shown(item.name)}</td><td>{shown(item.sku)}</td><td>{shown(item.ean)}</td><td>{shown(item.quantity)}</td><td>{shown(item.price_brutto)}</td><td>{item.quantity != null && item.price_brutto != null ? (Number(item.quantity) * Number(item.price_brutto)).toFixed(2) : 'Non disponibile'}</td></tr>)}</tbody></table></div> : <p>Non disponibile</p>}</section>
      <section className="card order-card"><h2>Informazioni economiche</h2><dl className="order-fields">
        <div><dt>Valore prodotti calcolato</dt><dd>{productSubtotal === null ? 'Non disponibile' : productSubtotal.toFixed(2)}</dd></div>
        <div><dt>Costo spedizione</dt><dd>{shown(order.economics.delivery_price)}</dd></div>
        <div><dt>Totale ordine</dt><dd>Non disponibile</dd></div>
        <div><dt>Valuta</dt><dd>{shown(order.economics.currency)}</dd></div>
        <div><dt>Metodo pagamento</dt><dd>{shown(order.economics.payment_method)}</dd></div>
        <div><dt>Contrassegno</dt><dd>{shown(order.economics.payment_method_cod)}</dd></div>
        <div><dt>Importo pagato</dt><dd>{shown(order.economics.payment_done)}</dd></div>
      </dl><p>Il totale non è fornito direttamente da getOrders; i valori calcolati non includono eventuali sconti.</p></section>
      <section className="card order-card"><h2>Verifica dati ordine</h2>
        <p><strong>Dati spedizione presenti:</strong> {order.quality.presentShipping.length ? order.quality.presentShipping.map(key => shippingFields.find(([field]) => field === key)?.[1] || key).join(', ') : 'Nessuno'}</p>
        <p><strong>Dati spedizione mancanti:</strong> {order.quality.missingShipping.length ? order.quality.missingShipping.map(key => shippingFields.find(([field]) => field === key)?.[1] || key).join(', ') : 'Nessuno fra i campi controllati'}</p>
        <p><strong>Codice Paese restituito dall’API:</strong> {shown(order.shipping.delivery_country_code)}</p>
        <p><strong>Da verificare con Etsy:</strong> {order.quality.reviewWithEtsy ? 'Sì. Confronta indirizzo e Paese con l’ordine originale prima di usarli.' : 'Non applicabile alla sorgente indicata.'}</p>
        <p>La presenza di un indirizzo completo non ne conferma l’esattezza.</p>
      </section>
    </>}
  </div>;
}
