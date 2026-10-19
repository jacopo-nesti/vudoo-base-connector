import { useState } from 'react';

const labels = {
  LINKED: 'Associato', RECONCILED: 'Riconciliato', CREATED: 'Creato',
  SIMULATED_CREATE: 'Simulazione: verrebbe creato', MISSING: 'Produttore da salvare',
  AMBIGUOUS: 'Riconciliazione richiesta', ERROR: 'Errore di verifica',
};

export default function InventoryStatus({ catalogCode, manufacturerName, status, onSelect, onRetry }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!catalogCode) return null;
  async function act(action) {
    setBusy(true); setError('');
    try { await action(); }
    catch (failure) { setError(failure?.message || 'Riconciliazione non riuscita. Riprova.'); }
    finally { setBusy(false); }
  }
  return <section className="card inventory-status" aria-label="Inventory Base.com del catalogo">
    <div className="card-heading"><div><h2>Inventory Base.com</h2><p>Catalogo Vudoo {catalogCode} · {manufacturerName || 'Produttore da salvare'}</p></div>
      <span className="tag tag-blue">{labels[status?.status] || 'Da verificare'}</span></div>
    {status?.inventoryId ? <p><strong>{status.inventory?.name || 'Inventory associato'}</strong> · ID {status.inventoryId}</p>
      : status?.planned ? <><p><strong>{status.planned.name}</strong></p><p className="muted">{status.planned.description}</p>
        <details><summary>Configurazione che verrebbe usata</summary><pre>{JSON.stringify(status.planned, null, 2)}</pre></details></>
        : <p className="muted">{status?.message || 'L’import userà l’Inventory globale configurato finché non esiste un’associazione verificata.'}</p>}
    {status?.status === 'AMBIGUOUS' && <div className="inventory-candidates"><p>Seleziona l’Inventory corretto:</p>
      {status.candidates?.map(item => <button key={item.inventory_id} type="button" className="btn btn-secondary btn-sm"
        disabled={busy} onClick={() => act(() => onSelect(item.inventory_id))}>{item.name} · ID {item.inventory_id}</button>)}</div>}
    {status?.status === 'ERROR' && onRetry && <button className="btn btn-secondary btn-sm" type="button" disabled={busy}
      onClick={() => act(onRetry)}>Riprova verifica Inventory</button>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
  </section>;
}
