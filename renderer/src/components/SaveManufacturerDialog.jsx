import { useEffect, useRef, useState } from 'react';

export default function SaveManufacturerDialog({ catalogCode, onSave, onClose }) {
  const dialog = useRef(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!catalogCode) return undefined;
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, [catalogCode]);
  if (!catalogCode) return null;
  return <dialog ref={dialog} className="catalog-switcher" aria-labelledby="save-manufacturer-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (!name.trim()) { setError('Inserisci il nome del produttore.'); return; }
      setBusy(true); setError('');
      try { await onSave(catalogCode, name.trim()); }
      catch (saveError) { setError(saveError?.message || 'Impossibile salvare il produttore. Riprova.'); }
      finally { setBusy(false); }
    }}>
      <h2 id="save-manufacturer-title">Salva questo catalogo</h2>
      <p>Il catalogo Vudoo è stato caricato. Il nome del produttore non è identificabile con certezza.</p>
      <dl className="detail-list"><div><dt>Codice catalogo</dt><dd className="mono">{catalogCode}</dd></div></dl>
      <label className="form-field"><span>Nome produttore</span><input className="input" autoFocus value={name}
        onChange={event => setName(event.target.value)} maxLength={160} required /></label>
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" type="submit" disabled={busy}>Salva</button></div>
    </form>
  </dialog>;
}
