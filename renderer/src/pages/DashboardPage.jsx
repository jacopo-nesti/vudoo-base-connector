import { useEffect, useMemo, useState } from 'react';
import CatalogLookup from '../components/CatalogLookup.jsx';
import CatalogLoadProgress from '../components/CatalogLoadProgress.jsx';
import { recentManufacturers } from '../manufacturersView.js';

const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

export default function DashboardPage({ onNavigate, onLoadCatalog, catalogBusy, catalogError }) {
  const [manufacturers, setManufacturers] = useState([]);
  const [recentError, setRecentError] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentCatalog, setRecentCatalog] = useState(null);
  const [recentLoadStatus, setRecentLoadStatus] = useState('idle');
  useEffect(() => {
    let active = true;
    window.electronAPI.getManufacturers().then(response => {
      if (!active) return;
      if (!response?.ok || !Array.isArray(response.manufacturers)) throw new Error('Anagrafica non disponibile');
      setManufacturers(response.manufacturers);
      setRecentError(false);
    }).catch(() => { if (active) setRecentError(true); })
      .finally(() => { if (active) setRecentLoading(false); });
    return () => { active = false; };
  }, []);
  const recent = useMemo(() => recentManufacturers(manufacturers), [manufacturers]);
  async function loadRecent(item) {
    setRecentCatalog(item.catalogCode);
    setRecentLoadStatus('loading');
    try {
      if (await onLoadCatalog(item.catalogCode)) {
        setRecentLoadStatus('success');
        await new Promise(resolve => setTimeout(resolve, 450));
        onNavigate('base-catalog');
      } else setRecentLoadStatus('idle');
    } catch {
      setRecentLoadStatus('idle');
    }
  }

  return <div className="page-stack dashboard-home">
    <section className="card dashboard-hero" aria-labelledby="dashboard-hero-title">
      <span className="dashboard-eyebrow">VUDOO PRODUCT MANAGER</span>
      <h1 id="dashboard-hero-title">Cerca il tuo catalogo</h1>
      <p>Cerca un produttore per nome o codice catalogo Vudoo e carica i suoi prodotti nel Product Manager.</p>
      <CatalogLookup onLoad={onLoadCatalog} onLoaded={() => onNavigate('base-catalog')}
        busy={catalogBusy} loadError={catalogError} placeholder="Cerca produttore o codice catalogo..." />
    </section>
    <section className="card dashboard-recents" aria-labelledby="dashboard-recents-title">
      <div className="card-heading"><div><h2 id="dashboard-recents-title">Produttori recenti</h2><p>Riapri rapidamente un catalogo già caricato.</p></div>
        <button className="btn btn-quiet btn-sm" type="button" onClick={() => onNavigate('base-manufacturers')}>Vedi tutti i produttori →</button></div>
      {recentLoading ? <p className="muted" role="status">Caricamento produttori recenti…</p>
        : recentError ? <p className="muted">Produttori recenti non disponibili. Apri Produttori per riprovare.</p>
          : recent.length === 0 ? <p className="muted">Nessun produttore recente.</p>
            : <div className="dashboard-recent-list">{recent.map(item => <div className="dashboard-recent-entry" key={item.id}><button className="dashboard-recent-item" type="button"
              disabled={catalogBusy || recentLoadStatus !== 'idle'} onClick={() => loadRecent(item)}>
              <span><strong>{item.name}</strong><small>Catalogo {item.catalogCode}</small></span>
              <span><strong>{item.lastProductCount == null ? '—' : `${item.lastProductCount} prodotti`}</strong>
                <small>{dateFormat.format(new Date(item.lastLoadedAt))}</small></span><span aria-hidden="true">→</span>
            </button>{recentCatalog === item.catalogCode && <CatalogLoadProgress status={recentLoadStatus} name={item.name} />}
              {recentCatalog === item.catalogCode && recentLoadStatus === 'idle' && catalogError && <p className="alert alert-danger" role="alert">{catalogError}</p>}</div>)}</div>}
    </section>
  </div>;
}
