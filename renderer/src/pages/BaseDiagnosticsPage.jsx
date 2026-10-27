import { useEffect, useState } from 'react';
import InventoryStatus from '../components/InventoryStatus.jsx';
import { baseConnectionView } from '../baseConnectionView.js';

const labels = {
  BASE_API_TOKEN: 'Credenziali Base.com', TEST_MODE: 'Modalità test', DRY_RUN: 'Modalità simulazione',
  'Connessione Base.com & Inventory': 'Connessione API e Inventory',
  'Price Group Base.com': 'Gruppo prezzi', 'Warehouse Base.com': 'Magazzino',
  'Rate limiter Base.com': 'Limite richieste',
};

export default function BaseDiagnosticsPage({ catalog, catalogCode, dryRunMode, baseConfigured,
  baseConnection, onConnectionChanged }) {
  const [checks, setChecks] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inventoryId = catalog?.inventoryStatus?.inventoryId ?? catalog?.baseInventoryId;
  const baseState = baseConnectionView(baseConnection?.configured ?? baseConfigured,
    baseConnection?.verification);
  useEffect(() => {
    let active = true;
    window.electronAPI.getRuntimeMode().then(mode => {
      if (active && mode?.baseConnection) onConnectionChanged?.(mode.baseConnection);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  async function verify() {
    setBusy(true); setError(''); setChecks(null);
    try {
      const response = await window.electronAPI.checkEnvironment();
      if (!Array.isArray(response?.checks)) throw new Error();
      if (response.baseConnection) onConnectionChanged?.(response.baseConnection);
      setChecks(response.checks.map(check => ({ label: labels[check.title] ?? check.title,
        status: check.ok ? 'pass' : 'issue', detail: check.details })));
    } catch { setError('Diagnostica Base.com non riuscita. Riprova.'); }
    finally { setBusy(false); }
  }
  return <div className="page-stack"><div className="page-heading"><div><h1>Diagnostica Base.com</h1><p>Controlla la configurazione e il collegamento Base.com.</p></div></div>
    <InventoryStatus catalogCode={catalogCode} manufacturerName={catalog?.manufacturerName} status={catalog?.inventoryStatus} />
    <section className="card diagnostics-system" aria-labelledby="diagnostics-system-title"><h2 id="diagnostics-system-title">Stato sistema</h2>
      <dl className="detail-list"><div><dt>Modalità</dt><dd>{dryRunMode === true ? 'Simulazione' : dryRunMode === false ? 'Reale' : 'Da verificare'}</dd></div>
        <div><dt>Base.com</dt><dd className={`base-connection-state base-connection-state--${baseState.tone}`}><span className="base-connection-dot" aria-hidden="true" />{baseState.text}</dd></div>
        <div><dt>Catalogo attivo</dt><dd>{catalog?.manufacturerName || catalog?.channelTitle || 'Nessun catalogo'}</dd></div>
        <div><dt>Inventory Base.com</dt><dd>{inventoryId == null ? 'Non associato' : `ID ${inventoryId}`}</dd></div></dl>
    </section>
    <section className="card connection-card"><div><h2>Base.com</h2><p>{checks ? 'Verifica completata' : busy ? 'Verifica in corso…' : 'Non verificato'}</p></div><button className="btn btn-primary" type="button" onClick={verify} disabled={busy}>{busy ? 'Verifica in corso…' : 'Verifica'}</button></section>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {checks && <section className="card diagnostics-results" aria-label="Esiti diagnostica Base.com"><h2>Risultati</h2><div className="check-list">{checks.map((check, index) => <div className="check-item" key={`${check.label}-${index}`}><span className={`check-symbol ${check.status === 'pass' ? 'check-symbol--ok' : 'check-symbol--issue'}`} aria-hidden="true">{check.status === 'pass' ? '✓' : '!'}</span><div className="check-body"><strong>{check.label}</strong>{check.detail && <small>{check.detail}</small>}</div><span className={`tag ${check.status === 'pass' ? 'tag-green' : 'tag-orange'}`}>{check.status === 'pass' ? 'Riuscito' : 'Da correggere'}</span></div>)}</div><button className="btn btn-secondary" type="button" onClick={() => setChecks(null)}>Chiudi</button></section>}
  </div>;
}
