export default function DashboardPage({ catalog, selectedCount, dryRunMode, environment, onNavigate }) {
  return <div className="page-stack">
    <div className="page-heading"><div><h1>Panoramica</h1><p>Stato della sessione corrente e accesso alle operazioni.</p></div></div>
    <div className="stat-grid">
      <div className="stat-card"><span>Catalogo Vudoo</span><strong>{catalog ? 'Caricato' : 'Non caricato'}</strong><small>{catalog?.channelTitle || 'Nessun fornitore attivo'}</small></div>
      <div className="stat-card"><span>Prodotti nel catalogo</span><strong className="mono">{catalog?.totalProducts ?? '—'}</strong><small>{catalog ? 'Catalogo della sessione' : 'Carica un catalogo per iniziare'}</small></div>
      <div className="stat-card"><span>Prodotti selezionati</span><strong className="mono">{catalog ? selectedCount : '—'}</strong><small>Selezione corrente</small></div>
      <div className="stat-card"><span>Modalità import</span><strong>{dryRunMode === true ? 'Simulazione' : dryRunMode === false ? 'Reale' : 'Da verificare'}</strong><small>{dryRunMode === true ? 'Nessuna scrittura su Base.com' : dryRunMode === false ? 'Può modificare Base.com' : 'Verifica le impostazioni attive'}</small></div>
    </div>
    <div className="dashboard-grid"><section className="card"><div className="card-heading"><div><h2>Sessione</h2><p>Informazioni disponibili nell’app aperta.</p></div></div><dl className="detail-list"><div><dt>Fornitore attivo</dt><dd>{catalog?.channelTitle || 'Nessuno'}</dd></div><div><dt>Catalogo</dt><dd>{catalog ? `${catalog.totalProducts} prodotti` : 'Non caricato'}</dd></div><div><dt>Verifica ambiente</dt><dd>{environment ? (environment.ok ? 'Controlli superati' : 'Richiede attenzione') : 'Non eseguita'}</dd></div></dl></section>
      <section className="card"><div className="card-heading"><div><h2>Azioni rapide</h2><p>Continua con il lavoro sul catalogo.</p></div></div><div className="quick-actions"><button className="btn btn-primary" type="button" onClick={() => onNavigate('catalog')}>Gestisci catalogo <span aria-hidden="true">→</span></button><button className="btn btn-secondary" type="button" onClick={() => onNavigate('operations')}>Apri operazioni <span aria-hidden="true">→</span></button><button className="btn btn-secondary" type="button" onClick={() => onNavigate('diagnostics')}>Esegui diagnostica <span aria-hidden="true">→</span></button></div></section></div>
  </div>;
}
