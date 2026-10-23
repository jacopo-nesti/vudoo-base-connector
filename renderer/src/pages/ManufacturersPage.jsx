import { useEffect, useMemo, useState } from 'react';
import { filterManufacturers } from '../manufacturersView.js';
import CatalogLoadProgress from '../components/CatalogLoadProgress.jsx';

const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

function lastLoadedAt(value) {
  if (!value) return 'Mai caricato';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Data non disponibile' : dateFormat.format(date);
}

export default function ManufacturersPage({ onNavigate, onLoadCatalog, catalogBusy, catalogError }) {
  const [manufacturers, setManufacturers] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loadingCatalogCode, setLoadingCatalogCode] = useState(null);
  const [loadStatus, setLoadStatus] = useState('idle');
  useEffect(() => {
    let active = true;
    window.electronAPI.getManufacturers().then(response => {
      if (!active) return;
      if (!response?.ok || !Array.isArray(response.manufacturers)) throw new Error('Anagrafica locale non disponibile.');
      setManufacturers(response.manufacturers);
      setError('');
    }).catch(() => { if (active) setError('Impossibile leggere i produttori salvati. Riprova.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);
  const visible = useMemo(() => filterManufacturers(manufacturers, query), [manufacturers, query]);
  const refresh = () => { setLoading(true); setError(''); setRetry(value => value + 1); };
  async function loadCatalog(item) {
    setLoadingCatalogCode(item.catalogCode);
    setLoadStatus('loading');
    try {
      if (await onLoadCatalog(item.catalogCode)) {
        setLoadStatus('success');
        await new Promise(resolve => setTimeout(resolve, 450));
        onNavigate('base-catalog');
      } else setLoadStatus('idle');
    } catch {
      setLoadStatus('idle');
    }
  }

  return <div className="page-stack manufacturers-page">
    <div className="page-heading"><div><h1>Produttori</h1><p>Anagrafica locale dei cataloghi Vudoo e ultimo caricamento.</p></div></div>
    <section className="card manufacturers-toolbar"><label className="form-field"><span>Cerca produttore</span>
      <input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Cerca produttore o codice catalogo..." /></label><span className="muted">{visible.length} produttori</span></section>
    {loading && <section className="card empty-state" role="status"><p>Caricamento produttori…</p></section>}
    {!loading && error && <section className="card empty-state" role="alert"><h2>Produttori non disponibili</h2><p>{error}</p><button className="btn btn-secondary" type="button" onClick={refresh}>Riprova</button></section>}
    {!loading && !error && manufacturers.length === 0 && <section className="card empty-state"><h2>Nessun produttore salvato.</h2><p>Carica un catalogo Vudoo dalla Panoramica per iniziare.</p><button className="btn btn-primary" type="button" onClick={() => onNavigate('base-overview')}>Vai a Panoramica</button></section>}
    {!loading && !error && manufacturers.length > 0 && visible.length === 0 && <section className="card empty-state"><h2>Nessun produttore corrisponde alla ricerca.</h2><button className="btn btn-secondary" type="button" onClick={() => setQuery('')}>Cancella ricerca</button></section>}
    {!loading && !error && visible.length > 0 && <div className="manufacturers-grid">{visible.map(item => <article className="card manufacturer-card" key={item.id}>
      <div className="manufacturer-card-header"><h2>{item.name}</h2><span className={`tag ${item.baseInventoryId == null ? 'tag-gray' : 'tag-green'}`}>{item.baseInventoryId == null ? 'Inventory non associato' : 'Inventory associato'}</span></div>
      <button className="btn btn-primary btn-sm manufacturer-load-button" type="button" disabled={catalogBusy || loadStatus !== 'idle'} onClick={() => loadCatalog(item)}>Carica catalogo</button>
      {loadingCatalogCode === item.catalogCode && <CatalogLoadProgress status={loadStatus} name={item.name} />}
      {loadingCatalogCode === item.catalogCode && loadStatus === 'idle' && catalogError && <p className="alert alert-danger" role="alert">{catalogError}</p>}
      <dl className="detail-list"><div><dt>Catalogo Vudoo</dt><dd className="mono">{item.catalogCode}</dd></div>
        <div><dt>Inventory Base.com</dt><dd>{item.baseInventoryId == null ? 'Non associato' : `ID ${item.baseInventoryId}`}</dd></div>
        <div><dt>Ultimo catalogo</dt><dd>{item.lastProductCount == null ? 'Non disponibile' : `${item.lastProductCount} prodotti`}</dd></div>
        <div><dt>Ultimo caricamento</dt><dd>{lastLoadedAt(item.lastLoadedAt)}</dd></div></dl>
    </article>)}</div>}
  </div>;
}
