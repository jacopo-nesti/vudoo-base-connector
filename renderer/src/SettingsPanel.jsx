import { useEffect, useState } from 'react';
import { rateLimitGuidance } from './rateLimitGuidance.js';

const numberFields = [
  { key: 'vudooResultsLimit', label: 'Limite risultati Vudoo', min: 1 },
  { key: 'vudooTimeoutMs', label: 'Timeout Vudoo (millisecondi)', min: 1 },
  { key: 'baseApiRequestsPerMinute', label: 'Richieste Base.com al minuto', min: 1 },
  { key: 'baseApiReadAttempts', label: 'Tentativi di lettura Base.com', min: 1, max: 10 },
  { key: 'baseApiRetryDelayMs', label: 'Ritardo tra i tentativi (millisecondi)', min: 1, max: 3600000 },
  { key: 'baseApiRateLimitDelayMs', label: 'Pausa dopo limite API (millisecondi)', min: 1, max: 3600000 },
];

const fieldLabels = {
  testMode: 'Modalità test',
  dryRun: 'Modalità simulazione',
  unmappedCategoryPolicy: 'Gestione categorie non mappate',
  ...Object.fromEntries(numberFields.map(({ key, label }) => [key, label])),
};

function errorMessage(response) {
  if (response?.code === 'invalidValue') {
    return `Valore non valido per ${fieldLabels[response.field] ?? 'un’impostazione'}.`;
  }
  if (response?.code === 'unsupportedSetting' || response?.code === 'invalidSettings') {
    return 'Le impostazioni inviate non sono valide.';
  }
  if (response?.code === 'importInProgress') {
    return 'Attendi la fine dell’importazione prima di riavviare.';
  }
  return 'Impossibile completare l’operazione sulle impostazioni. Riprova.';
}

function SettingsPanel() {
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!window.electronAPI?.getSettings) {
      setError('Collegamento con l’applicazione non disponibile.');
      setLoading(false);
      return;
    }
    let active = true;
    window.electronAPI.getSettings()
      .then(response => {
        if (!active) return;
        if (!response?.ok) throw new Error('Impossibile leggere le impostazioni.');
        setSnapshot(response);
        setDraft(response.settings);
      })
      .catch(() => {
        if (active) setError('Impossibile leggere le impostazioni.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function updateDraft(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
    setError('');
    setMessage('');
  }

  async function handleSave(event) {
    event.preventDefault();
    const settings = { ...draft };
    for (const { key, label } of numberFields) {
      const raw = String(settings[key]).trim();
      if (!/^\d+$/.test(raw)) {
        setError(`Inserisci un numero intero valido per ${label}.`);
        return;
      }
      settings[key] = Number(raw);
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await window.electronAPI.saveSettings(settings);
      if (!response?.ok) {
        setError(errorMessage(response));
        return;
      }
      setSnapshot(response);
      setDraft(response.settings);
      setEditing(false);
      setMessage(response.restartRequired
        ? 'Impostazioni salvate. Riavvia l’applicazione per applicare le modifiche.'
        : 'Impostazioni salvate e già attive.');
    } catch {
      setError('Impossibile salvare le impostazioni. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await window.electronAPI.resetSettings();
      if (!response?.ok) {
        setError(errorMessage(response));
        return;
      }
      setSnapshot(response);
      setDraft(response.settings);
      setEditing(false);
      setMessage(response.restartRequired
        ? 'Impostazioni predefinite ripristinate. Riavvia l’applicazione per applicarle.'
        : 'Impostazioni predefinite già attive.');
    } catch {
      setError('Impossibile ripristinare le impostazioni. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  async function handleRestart() {
    setBusy(true);
    setError('');
    try {
      const response = await window.electronAPI.restartApp();
      if (!response?.ok) setError(errorMessage(response));
    } catch {
      setError('Impossibile riavviare l’applicazione. Riavviala manualmente.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card working" role="status"><span className="spinner" /> Caricamento impostazioni…</div>;
  if (!snapshot) return <div className="alert alert-danger" role="alert">{error}</div>;

  return (
    <section className="settings-panel page-stack" aria-label="Impostazioni dell’applicazione">
      <div className="card"><div className="card-heading"><div><h2>Impostazioni salvate</h2><p>Puoi usare i valori predefiniti o personalizzarli. Le modifiche salvate si applicano dopo il riavvio.</p></div></div>
      {snapshot.warning === 'invalidFile' && (
        <div className="alert alert-warning" role="alert">Il file delle impostazioni non è valido. Sono stati usati i valori predefiniti; puoi salvare nuove impostazioni o ripristinarle.</div>
      )}
      {snapshot.warning === 'readError' && (
        <div className="alert alert-warning" role="alert">Non è stato possibile leggere il file delle impostazioni. Sono stati usati i valori predefiniti.</div>
      )}
      {snapshot.environmentWarnings.length > 0 && (
        <div className="alert alert-warning" role="alert">Alcuni valori di .env non sono validi: {snapshot.environmentWarnings.join(', ')}. Correggili oppure salva impostazioni valide e riavvia.</div>
      )}
      <dl className="detail-list"><div><dt>Richieste Base.com al minuto</dt><dd>{snapshot.settings.baseApiRequestsPerMinute}</dd></div><div><dt>Modalità attiva</dt><dd>{snapshot.activeSettings.dryRun === null
        ? 'Configurazione non valida' : snapshot.activeSettings.dryRun ? 'Simulazione' : 'Reale'}</dd></div></dl>
      <p className="settings-guidance">{rateLimitGuidance(snapshot.settings.baseApiRequestsPerMinute)}</p>
      {!editing && <div className="settings-overview"><div><span>TEST_MODE</span><strong>{snapshot.settings.testMode ? 'Attivo' : 'Disattivo'}</strong></div><div><span>DRY_RUN</span><strong>{snapshot.settings.dryRun ? 'Simulazione' : 'Reale'}</strong></div><div><span>UNMAPPED_CATEGORY_POLICY</span><strong>{snapshot.settings.unmappedCategoryPolicy === 'skip' ? 'Escludi non mappati' : 'Blocca importazione'}</strong></div>{numberFields.map(({ key, label }) => <div key={key}><span>{label}</span><strong className="mono">{snapshot.settings[key]}</strong></div>)}</div>}
      {snapshot.restartRequired && <div className="alert alert-warning" role="status"><strong>Riavvio necessario per applicare le impostazioni salvate.</strong></div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {!editing && (
        <div className="settings-actions">
          <button className="btn btn-secondary" type="button" onClick={handleReset} disabled={busy}>
            {snapshot.hasOverrides ? 'Ripristina impostazioni predefinite' : 'Usa impostazioni predefinite'}
          </button>{' '}
          <button className="btn btn-primary" type="button" onClick={() => setEditing(true)} disabled={busy}>Personalizza impostazioni</button>
        </div>
      )}
      </div>

      {editing && draft && (
        <form className="settings-form page-stack" onSubmit={handleSave}>
          <fieldset className="card" disabled={busy}>
            <legend>Modalità operative</legend>
            <label className="settings-toggle"><span><strong>Modalità test</strong><small>Se attiva, viene elaborato un solo prodotto tra quelli selezionati.</small></span><input type="checkbox" checked={draft.testMode} onChange={event => updateDraft('testMode', event.target.checked)} /></label>
            <label className="settings-toggle"><span><strong>Modalità simulazione</strong><small>Nessuna scrittura su Base.com quando attiva.</small></span><input type="checkbox" checked={draft.dryRun} onChange={event => updateDraft('dryRun', event.target.checked)} /></label>
            <p className={`alert ${draft.dryRun ? 'alert-warning' : 'alert-danger'}`}>{draft.dryRun
              ? 'Modalità simulazione: nessuna modifica verrà scritta su Base.com.'
              : 'ATTENZIONE: modalità reale. Le operazioni possono modificare Base.com.'}</p>
            <label className="form-field">
              <span>Gestione categorie non mappate</span>
              <select className="select" value={draft.unmappedCategoryPolicy} onChange={event => updateDraft('unmappedCategoryPolicy', event.target.value)}>
                <option value="block">Blocca l’importazione</option>
                <option value="skip">Escludi i prodotti non mappati</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="card" disabled={busy}>
            <legend>Impostazioni avanzate</legend>
            <div className="settings-number-grid">
            {numberFields.map(({ key, label, min, max }) => (
              <div key={key} className="form-field">
                <label htmlFor={`setting-${key}`}>{label}</label>
                  <input className="input mono" id={`setting-${key}`} type="number" min={min} max={max} step="1" value={draft[key]}
                    onChange={event => updateDraft(key, event.target.value)} required />
                {key === 'baseApiRequestsPerMinute' && <p className="settings-guidance">{rateLimitGuidance(draft[key])}</p>}
              </div>
            ))}
            </div>
          </fieldset>
          <div className="settings-actions"><button className="btn btn-primary" type="submit" disabled={busy}>Salva impostazioni</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setDraft(snapshot.settings); setEditing(false); setError(''); }}>Annulla modifiche</button></div>
        </form>
      )}

      {snapshot.restartRequired && (
        <div className="card"><button className="btn btn-primary" type="button" onClick={handleRestart} disabled={busy}>Riavvia e applica</button></div>
      )}
    </section>
  );
}

export default SettingsPanel;
