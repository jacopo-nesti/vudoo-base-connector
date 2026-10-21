import { useEffect, useState } from 'react';
import OrderDetail, { orderDate, shown } from './OrderDetail.jsx';
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
  alreadySyncing: 'Aggiornamento ordini già in corso.',
  storageError: 'Archivio ordini locale non disponibile.',
  apiError: 'Operazione Base.com non riuscita. Riprova.',
};
const PAGE_SIZE = 50;
const emptyFilters = { query: '', dateFrom: '', dateTo: '', source: '', statusId: '', payment: '', quality: '' };
function unixDay(value, next = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (next) date.setDate(date.getDate() + 1);
  return Math.floor(date.getTime() / 1000);
}
function lastUpdated(value, now) {
  if (!value) return 'Mai';
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 1 ? 'Adesso' : minutes < 60 ? `${minutes} minuti fa` : new Date(value).toLocaleString('it-IT');
}
function paidLabel(value) {
  if (value === null || value === undefined) return 'Non disponibile';
  return Number(value) > 0 ? `${Number(value).toFixed(2)} registrati` : '0 registrato';
}

export default function OrdersBetaPage() {
  const [id, setId] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [facets, setFacets] = useState({ sources: [], statuses: [] });
  const [syncState, setSyncState] = useState(null);
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    let cancelled = false;
    setListBusy(true);
    window.electronAPI.listBaseOrders({ ...filters, dateFrom: unixDay(filters.dateFrom),
      dateTo: unixDay(filters.dateTo, true), limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then(response => {
        if (cancelled) return;
        if (!response?.ok) { setError(errorText[response?.code] || errorText.storageError); return; }
        setRows(response.rows); setTotal(response.total); setFacets(response.facets);
        setSyncState(response.syncState);
      })
      .catch(() => { if (!cancelled) setError(errorText.storageError); })
      .finally(() => { if (!cancelled) setListBusy(false); });
    return () => { cancelled = true; };
  }, [filters, page, revision]);

  function changeFilter(name, value) {
    setFilters(current => ({ ...current, [name]: value })); setPage(0);
  }
  async function fetchId(event) {
    event?.preventDefault();
    if (busy) return;
    const requested = event ? id.trim() : String(order?.identity?.order_id || '');
    setBusy(true); setError(''); setSuccess('');
    try {
      const response = await window.electronAPI.getBaseOrder(requested);
      if (!response?.ok) { setError(errorText[response?.code] || errorText.apiError); return; }
      setOrder({ ...response.order, fetchedAt: new Date().toISOString() });
      setId(String(response.order.identity.order_id));
      setRevision(value => value + 1);
      setSuccess('Ordine aggiornato da Base.com e salvato localmente.');
    } catch { setError(errorText.apiError); }
    finally { setBusy(false); }
  }
  async function openStored(orderId) {
    setError(''); setSuccess('');
    try {
      const response = await window.electronAPI.getStoredBaseOrder(orderId);
      if (!response?.ok || !response.order) { setError(errorText.storageError); return; }
      setOrder(response.order); setId(String(orderId));
    } catch { setError(errorText.storageError); }
  }
  async function sync() {
    if (busy) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      const response = await window.electronAPI.syncBaseOrders();
      setRevision(value => value + 1);
      if (!response?.ok) { setError(`Aggiornamento non riuscito. ${errorText[response?.code] || errorText.apiError}`); return; }
      if (order) {
        try {
          const refreshed = await window.electronAPI.getStoredBaseOrder(order.identity.order_id);
          if (refreshed?.ok && refreshed.order) setOrder(refreshed.order);
        } catch { /* The successful sync remains visible; the detail can be reopened. */ }
      }
      setSuccess(`Aggiornamento completato: ${response.result.created} nuovi, ${response.result.updated} aggiornati.`);
      setNow(Date.now());
    } catch { setError('Aggiornamento non riuscito. ' + errorText.apiError); }
    finally { setBusy(false); }
  }

  return <div className="page-stack orders-beta">
    <div className="page-heading"><div><h1>Ordini</h1><p>Ordini Base.com salvati localmente. Lettura e aggiornamento manuale, senza modifiche su Base.com.</p></div></div>
    <div className="order-actions"><form onSubmit={fetchId}><label className="form-field"><span>ID ordine Base.com</span><input className="input" type="text" inputMode="numeric" autoComplete="off" value={id} onChange={event => setId(event.target.value)} placeholder="Inserisci ID ordine" /></label><button className="btn btn-secondary" type="submit" disabled={busy}>Apri / aggiorna ID</button></form><div><button className="btn btn-primary" type="button" onClick={sync} disabled={busy}>{busy ? 'Aggiornamento ordini…' : 'Aggiorna ordini'}</button><small>Ultimo aggiornamento: {lastUpdated(syncState?.lastSuccessAt, now)}</small></div></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {success && <div className="alert alert-info" role="status">{success}</div>}
    {order ? <OrderDetail order={order} onBack={() => { setOrder(null); setSuccess(''); }} onRefresh={() => fetchId()} refreshing={busy} /> : <>
      <section className="card order-filters" aria-label="Filtri ordini">
        <label className="form-field order-search-field"><span>Cerca ID, marketplace, cliente, email, SKU, EAN, prodotto</span><input className="input" type="search" value={filters.query} onChange={event => changeFilter('query', event.target.value)} /></label>
        <label className="form-field"><span>Dal</span><input className="input" type="date" value={filters.dateFrom} onChange={event => changeFilter('dateFrom', event.target.value)} /></label>
        <label className="form-field"><span>Al</span><input className="input" type="date" value={filters.dateTo} onChange={event => changeFilter('dateTo', event.target.value)} /></label>
        <label className="form-field"><span>Marketplace</span><select className="select" value={filters.source} onChange={event => changeFilter('source', event.target.value)}><option value="">Tutti</option>{facets.sources.map(item => <option value={item.value} key={item.value}>{item.value}</option>)}</select></label>
        <label className="form-field"><span>Stato ordine</span><select className="select" value={filters.statusId} onChange={event => changeFilter('statusId', event.target.value)}><option value="">Tutti</option>{facets.statuses.map(item => <option value={item.value} key={item.value}>{item.name || `ID ${item.value}`}</option>)}</select></label>
        <label className="form-field"><span>Importo pagato</span><select className="select" value={filters.payment} onChange={event => changeFilter('payment', event.target.value)}><option value="">Tutti</option><option value="recorded">Importo registrato</option><option value="zero">Zero</option><option value="unknown">Non disponibile</option></select></label>
        <label className="form-field"><span>Completezza</span><select className="select" value={filters.quality} onChange={event => changeFilter('quality', event.target.value)}><option value="">Tutti</option><option value="Completo">Completo</option><option value="Da verificare">Da verificare</option></select></label>
        <button type="button" className="btn btn-secondary" onClick={() => { setFilters(emptyFilters); setPage(0); }}>Reset filtri</button>
      </section>
      <section className="card order-list"><div className="order-list-heading"><h2>Ordini <span>{total}</span></h2>{listBusy && <small role="status">Caricamento lista…</small>}</div>
        {rows.length ? <div className="table-scroll"><table className="table"><thead><tr><th>ID Base</th><th>Ordine marketplace</th><th>Data</th><th>Marketplace / negozio</th><th>Cliente</th><th>Paese spedizione</th><th>Stato pagamento</th><th>Importo pagato</th><th>Valuta</th><th>Stato ordine</th><th>Verifica</th></tr></thead><tbody>{rows.map(row => <tr key={row.baseOrderId} className="order-clickable-row" onClick={() => openStored(row.baseOrderId)}><td><button className="order-row-link" type="button" onClick={event => { event.stopPropagation(); openStored(row.baseOrderId); }} aria-label={`Apri ordine ${row.baseOrderId}`}>{row.baseOrderId}</button></td><td>{shown(row.externalOrderId)}</td><td>{orderDate(row.dateAdd)}</td><td>{shown(row.source)}<small>{shown(row.sourceName || row.sourceId)}</small></td><td>{shown(row.displayName)}</td><td>{shown(row.deliveryCountry)}</td><td>Non disponibile</td><td>{paidLabel(row.paymentDone)}</td><td>{shown(row.currency)}</td><td>{shown(row.statusName || row.statusId)}</td><td><span className={row.qualityStatus === 'Completo' ? 'order-quality-good' : 'order-tax-warning'}>{row.qualityStatus}</span></td></tr>)}</tbody></table></div>
          : <p>{syncState?.lastSuccessAt ? 'Nessun ordine corrisponde ai filtri.' : 'Nessun ordine sincronizzato. Premi “Aggiorna ordini” per recuperarli da Base.com.'}</p>}
        {total > PAGE_SIZE && <div className="order-pagination"><button className="btn btn-secondary" type="button" disabled={page === 0 || listBusy} onClick={() => setPage(value => value - 1)}>Precedenti</button><span>Pagina {page + 1} di {Math.ceil(total / PAGE_SIZE)}</span><button className="btn btn-secondary" type="button" disabled={(page + 1) * PAGE_SIZE >= total || listBusy} onClick={() => setPage(value => value + 1)}>Successivi</button></div>}
      </section>
    </>}
  </div>;
}
