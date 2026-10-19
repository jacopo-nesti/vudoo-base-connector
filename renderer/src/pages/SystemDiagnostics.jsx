import { notifyOperation } from '../operationNotifications.js';
import { useState } from 'react';

export default function SystemDiagnostics() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  async function verify() {
    setBusy(true);
    try { const ok = (await window.electronAPI.ping()) === 'pong'; setStatus(ok ? 'ok' : 'error'); notifyOperation(ok ? 'diagnosticsDone' : 'diagnosticsFailed'); }
    catch { setStatus('error'); notifyOperation('diagnosticsFailed'); }
    finally { setBusy(false); }
  }
  return <div className="page-stack"><div className="page-heading"><div><h1>Diagnostica sistema</h1><p>Controlli del gestionale locale.</p></div></div><section className="card connection-card"><div><h2>Motore locale dell’applicazione</h2><p>Verifica che l'interfaccia comunichi correttamente con il processo locale del gestionale.</p><small>Electron / preload bridge / IPC</small><p role="status">{status === 'ok' ? 'Collegamento riuscito' : status === 'error' ? 'Collegamento non riuscito' : 'Non verificato'}</p></div><button type="button" className="btn btn-primary" disabled={busy} onClick={verify}>{busy ? 'Verifica in corso…' : 'Verifica'}</button></section></div>;
}
