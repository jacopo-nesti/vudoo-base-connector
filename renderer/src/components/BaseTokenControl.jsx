import { useEffect, useRef, useState } from 'react';

export default function BaseTokenControl({ onConnectionChanged }) {
  const [configured, setConfigured] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);
  const removeDialog = useRef(null);

  useEffect(() => {
    let active = true;
    setConfigured(null);
    window.electronAPI?.getBaseTokenStatus?.().then(response => {
      if (active && typeof response?.configured === 'boolean') setConfigured(response.configured);
      else if (active) setError('Impossibile leggere lo stato del token.');
    }).catch(() => { if (active) setError('Impossibile leggere lo stato del token.'); });
    return () => { active = false; };
  }, [retry]);

  async function saveToken() {
    if (!draft.trim()) { setError('Inserisci un token Base.com.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await window.electronAPI.setBaseToken(draft);
      if (!response?.ok) {
        setError(response?.code === 'invalidToken' ? 'Inserisci un token valido, senza interruzioni di riga.'
          : response?.code === 'importInProgress' ? 'Attendi la fine dell’operazione in corso.'
            : 'Impossibile salvare il token nella configurazione locale. Riprova.');
        return;
      }
      setDraft(''); setEditing(false); setConfigured(true);
      setMessage('Token salvato. Connessione da verificare.');
      onConnectionChanged?.({ configured: true, verification: 'unverified', lastConnectedAt: null });
    } catch { setError('Impossibile salvare il token. Riprova.'); }
    finally { setBusy(false); }
  }

  async function removeToken() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await window.electronAPI.deleteBaseToken();
      if (!response?.ok) {
        setError(response?.code === 'importInProgress' ? 'Attendi la fine dell’operazione in corso.'
          : 'Impossibile rimuovere il token dalla configurazione locale. Riprova.');
        return;
      }
      setDraft(''); setEditing(false); setConfigured(false);
      setMessage('Token rimosso.');
      onConnectionChanged?.({ configured: false, verification: 'unconfigured', lastConnectedAt: null });
    } catch { setError('Impossibile rimuovere il token. Riprova.'); }
    finally { removeDialog.current?.close(); setBusy(false); }
  }

  return <section className="card settings-section settings-field-card settings-token-card">
    <div className="settings-card-heading"><span className="settings-card-icon" aria-hidden="true">●</span><div>
      <h2>Connessione API</h2><p>Gestisci il token Base.com salvato nella configurazione locale dell’app.</p>
    </div></div>
    {configured === null ? <div role="status">Stato token in caricamento…</div> : <strong role="status">Token {configured ? 'configurato' : 'non configurato'}</strong>}
    {configured === null && error && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setError(''); setRetry(value => value + 1); }}>Riprova</button>}
    {configured === true && !editing && <div className="settings-token-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setEditing(true); setError(''); setMessage(''); }}>Sostituisci token</button>
      <button type="button" className="btn btn-danger-quiet btn-sm" disabled={busy} onClick={() => removeDialog.current?.showModal()}>Rimuovi</button></div>}
    {configured !== null && (!configured || editing) && <div className="settings-token-entry"><label htmlFor="base-token-input">{configured ? 'Nuovo token Base.com' : 'Token Base.com'}</label>
      <input id="base-token-input" className="input" type="password" autoComplete="new-password" spellCheck="false"
        placeholder="Inserisci il token API" value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} disabled={busy} />
      <div className="settings-token-actions"><button type="button" className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={saveToken}>{busy ? 'Salvataggio…' : 'Salva token'}</button>
        {editing && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { setDraft(''); setEditing(false); setError(''); }}>Annulla</button>}</div></div>}
    {message && <p className="alert alert-success" role="status">{message}</p>}
    {error && <p className="alert alert-danger" role="alert">{error}</p>}
    <dialog ref={removeDialog} className="settings-reset-dialog" aria-labelledby="remove-base-token-title">
      <h2 id="remove-base-token-title">Rimuovere il token Base.com?</h2>
      <p>L’app non potrà comunicare con Base.com finché non verrà configurato un nuovo token.</p>
      <div className="settings-preview-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => removeDialog.current?.close()}>Annulla</button>
        <button type="button" className="btn btn-danger-quiet" disabled={busy} onClick={removeToken}>Rimuovi token</button></div>
    </dialog>
  </section>;
}
