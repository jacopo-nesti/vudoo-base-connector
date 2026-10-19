import { useEffect, useRef, useState } from 'react';

export default function OperatingModeControl({ dryRunMode, onSetOperatingMode, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function choose(mode) {
    setOpen(false);
    if (mode === (dryRunMode ? 'simulation' : 'real')) return;
    if (mode === 'real') {
      dialogRef.current?.showModal();
      return;
    }
    await applyMode(mode);
  }

  async function applyMode(mode) {
    setBusy(true);
    setError('');
    const response = await onSetOperatingMode(mode);
    setBusy(false);
    if (!response?.ok) {
      setError(response?.code === 'importInProgress'
        ? 'Attendi la fine dell’importazione prima di cambiare modalità.'
        : 'Impossibile salvare la modalità operativa. Riprova.');
      return;
    }
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }

  if (typeof dryRunMode !== 'boolean') return null;
  return <div className="operating-mode-control" ref={containerRef}>
    <button ref={triggerRef} type="button" className="sidebar-mode" aria-label={`Modalità operativa: ${dryRunMode ? 'simulazione' : 'reale'}. Cambia modalità`}
      aria-haspopup="true" aria-expanded={open} disabled={disabled || busy} onClick={() => { setOpen(current => !current); setError(''); }}>
      <span className={`status-dot ${dryRunMode ? 'status-dot--simulation' : 'status-dot--real'}`} />
      Modalità {dryRunMode ? 'simulazione' : 'reale'} <span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="operating-mode-menu" aria-label="Modalità operativa">
      <strong>Modalità operativa</strong>
      <button type="button" aria-current={!dryRunMode ? 'true' : undefined} onClick={() => choose('real')}>
        <b>{!dryRunMode ? '●' : '○'} Reale</b><small>Le importazioni possono modificare Base.com.</small>
      </button>
      <button type="button" aria-current={dryRunMode ? 'true' : undefined} onClick={() => choose('simulation')}>
        <b>{dryRunMode ? '●' : '○'} Simulazione</b><small>Genera e verifica l’import senza modificare Base.com.</small>
      </button>
    </div>}
    {error && <p className="operating-mode-error" role="alert">{error}</p>}
    <dialog ref={dialogRef} className="operating-mode-dialog" aria-labelledby="operating-mode-dialog-title">
      <h2 id="operating-mode-dialog-title">Attivare la modalità reale?</h2>
      <p>Le operazioni di import potranno modificare Base.com.</p>
      <div className="dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { dialogRef.current?.close(); triggerRef.current?.focus(); }}>Annulla</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => applyMode('real')}>Attiva modalità reale</button></div>
    </dialog>
  </div>;
}
