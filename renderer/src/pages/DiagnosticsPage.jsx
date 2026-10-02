const labels = {
  BASE_API_TOKEN: 'Credenziali Base.com', TEST_MODE: 'Modalità di test', DRY_RUN: 'Modalità simulazione',
  'Rate limiter Base.com': 'Limite richieste Base.com', 'Categorie non mappate': 'Gestione categorie non mappate',
  'Connessione Base.com & Inventory': 'Connessione e inventario Base.com',
  'Price Group Base.com': 'Gruppo prezzi Base.com', 'Warehouse Base.com': 'Magazzino Base.com',
};

export default function DiagnosticsPage({ environment, loading, error, response, onEnvironmentCheck, onPing,
  amazonDiagnostic, amazonLoading, amazonError, onAmazonDiagnostic }) {
  return <div className="page-stack"><div className="page-heading"><div><h1>Diagnostica</h1><p>Verifica la configurazione e i servizi tramite i controlli dell’applicazione.</p></div><button className="btn btn-primary" onClick={onEnvironmentCheck} disabled={loading} type="button">{loading ? 'Verifica in corso…' : 'Verifica ambiente'}</button></div>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {loading && <div className="card working" role="status"><span className="spinner" /> Controlli in corso…</div>}
    {!environment && !loading && <div className="card empty-state"><span className="empty-glyph" aria-hidden="true">◇</span><h2>Nessuna diagnostica eseguita</h2><p>Premi “Verifica ambiente” per visualizzare i controlli effettivi.</p></div>}
    {environment && <><div className={`alert ${environment.ok ? 'alert-success' : 'alert-warning'}`} role="status">{environment.ok ? 'Configurazione verificata.' : 'Alcuni controlli richiedono attenzione.'}</div><section className="check-list" aria-label="Esiti diagnostici">{environment.checks?.map((check, index) => <div className="check-item" key={`${check.title}-${index}`}><span className={`check-symbol ${check.ok ? 'check-symbol--ok' : 'check-symbol--issue'}`} aria-hidden="true">{check.ok ? '✓' : '!'}</span><div className="check-body"><strong>{labels[check.title] ?? check.title}</strong>{check.details && <small>{check.details}</small>}</div><span className={`tag ${check.ok ? 'tag-green' : 'tag-orange'}`}>{check.ok ? 'Riuscito' : 'Da correggere'}</span></div>)}</section></>}
    <section className="card connection-card"><div><h2>Amazon SP-API</h2><p>Verifica la configurazione sandbox EU e l’autenticazione LWA, senza modificare dati Amazon.</p>
      {amazonError && <div className="alert alert-danger" role="alert">{amazonError}</div>}
      {amazonDiagnostic && <div className={`alert ${amazonDiagnostic.ok ? 'alert-success' : 'alert-warning'}`} role="status">
        {amazonDiagnostic.ok ? 'Configurazione presente e autenticazione Amazon riuscita.' : amazonDiagnostic.error}
        {amazonDiagnostic.configured && <div>Ambiente: {amazonDiagnostic.environment} · Regione: {amazonDiagnostic.region}</div>}
      </div>}
    </div><button className="btn btn-secondary" type="button" onClick={onAmazonDiagnostic} disabled={amazonLoading}>{amazonLoading ? 'Verifica Amazon in corso…' : 'Verifica Amazon'}</button></section>
    <section className="card connection-card"><div><h2>Collegamento con l’applicazione</h2><p>Verifica la comunicazione con il processo Electron.</p>{response && <div className={`alert ${response === 'pong' ? 'alert-success' : 'alert-warning'}`} role="status">{response === 'pong' ? 'Collegamento riuscito.' : 'Risposta inattesa dal processo principale.'}</div>}</div><button className="btn btn-secondary" type="button" onClick={onPing}>Verifica collegamento</button></section>
  </div>;
}
