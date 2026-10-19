import { useEffect, useMemo, useState } from 'react';
import CatalogLookup from '../components/CatalogLookup.jsx';
import { recentManufacturers } from '../manufacturersView.js';

const dateFormat = new Intl.DateTimeFormat('it-IT', { dateStyle: 'short', timeStyle: 'short' });

export default function DashboardPage({ catalog, dryRunMode, baseConfigured, onNavigate, onLoadCatalog, catalogBusy, catalogError }) {
  const [manufacturers, setManufacturers] = useState([]);
  const [recentError, setRecentError] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);
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
  const inventoryId = catalog?.inventoryStatus?.inventoryId ?? catalog?.baseInventoryId;
  async function loadRecent(code) {
    if (await onLoadCatalog(code)) onNavigate('base-catalog');
  }

  return <div className="page-stack dashboard-home">
    <section className="card dashboard-hero" aria-labelledby="dashboard-hero-title">
      <span className="dashboard-eyebrow">VUDOO PRODUCT MANAGER</span>
      <h1 id="dashboard-hero-title">Cerca il tuo catalogo</h1>
      <p>Cerca un produttore per nome o codice catalogo Vudoo e carica i suoi prodotti nel Product Manager.</p>
      <CatalogLookup onLoad={onLoadCatalog} onLoaded={() => onNavigate('base-catalog')}
        busy={catalogBusy} loadError={catalogError} placeholder="Cerca produttore o codice catalogo..." />
    </section>
    <details className="card dashboard-guide"><summary>Come si usa Vudoo Product Manager?</summary>
      <ol><li>Cerca e carica il catalogo del produttore.</li><li>Controlla e modifica i prodotti nella sezione Prodotti.</li>
        <li>Risolvi eventuali problemi segnalati.</li><li>Esegui i controlli preliminari.</li><li>Importa i prodotti su Base.com.</li></ol>
      <p>I dati originali Vudoo restano invariati. Le modifiche vengono salvate come override destinati a Base.com.</p>
    </details>
    <section className="card dashboard-recents" aria-labelledby="dashboard-recents-title">
      <div className="card-heading"><div><h2 id="dashboard-recents-title">Produttori recenti</h2><p>Riapri rapidamente un catalogo già caricato.</p></div>
        <button className="btn btn-quiet btn-sm" type="button" onClick={() => onNavigate('base-manufacturers')}>Vedi tutti i produttori →</button></div>
      {recentLoading ? <p className="muted" role="status">Caricamento produttori recenti…</p>
        : recentError ? <p className="muted">Produttori recenti non disponibili. Apri Produttori per riprovare.</p>
          : recent.length === 0 ? <p className="muted">Nessun produttore recente.</p>
            : <div className="dashboard-recent-list">{recent.map(item => <button className="dashboard-recent-item" type="button"
              key={item.id} disabled={catalogBusy} onClick={() => loadRecent(item.catalogCode)}>
              <span><strong>{item.name}</strong><small>Catalogo {item.catalogCode}</small></span>
              <span><strong>{item.lastProductCount == null ? '—' : `${item.lastProductCount} prodotti`}</strong>
                <small>{dateFormat.format(new Date(item.lastLoadedAt))}</small></span><span aria-hidden="true">→</span>
            </button>)}</div>}
    </section>
    <section className="card dashboard-system" aria-labelledby="dashboard-system-title"><h2 id="dashboard-system-title">Stato sistema</h2>
      <dl className="detail-list"><div><dt>Modalità</dt><dd>{dryRunMode === true ? 'Simulazione' : dryRunMode === false ? 'Reale' : 'Da verificare'}</dd></div>
        <div><dt>Base.com</dt><dd>{baseConfigured === true ? 'Configurato · connessione non verificata' : baseConfigured === false ? 'Non configurato' : 'Da verificare'}</dd></div>
        <div><dt>Catalogo attivo</dt><dd>{catalog?.manufacturerName || catalog?.channelTitle || 'Nessun catalogo'}</dd></div>
        <div><dt>Inventory Base.com</dt><dd>{inventoryId == null ? 'Non associato' : `ID ${inventoryId}`}</dd></div></dl>
    </section>
  </div>;
}
