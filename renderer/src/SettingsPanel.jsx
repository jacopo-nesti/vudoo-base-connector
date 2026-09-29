import { useEffect, useState } from 'react';

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

  if (loading) return <p>Caricamento impostazioni...</p>;
  if (!snapshot) return <p role="alert">{error}</p>;

  return (
    <section aria-label="Impostazioni dell’applicazione">
      <h3>Impostazioni dell’applicazione</h3>
      <p>Puoi continuare con i valori predefiniti oppure personalizzarli. Le modifiche salvate si applicano dopo il riavvio.</p>
      {snapshot.warning === 'invalidFile' && (
        <p role="alert">Il file delle impostazioni non è valido. Sono stati usati i valori predefiniti; puoi salvare nuove impostazioni o ripristinarle.</p>
      )}
      {snapshot.warning === 'readError' && (
        <p role="alert">Non è stato possibile leggere il file delle impostazioni. Sono stati usati i valori predefiniti.</p>
      )}
      {snapshot.environmentWarnings.length > 0 && (
        <p role="alert">Alcuni valori di .env non sono validi: {snapshot.environmentWarnings.join(', ')}. Correggili oppure salva impostazioni valide e riavvia.</p>
      )}
      <p>Richieste Base.com al minuto: <strong>{snapshot.settings.baseApiRequestsPerMinute}</strong></p>
      <p>Modalità attiva: <strong>{snapshot.activeSettings.dryRun === null
        ? 'Configurazione non valida' : snapshot.activeSettings.dryRun ? 'Simulazione' : 'Reale'}</strong></p>
      {snapshot.restartRequired && <p role="status"><strong>Riavvio necessario per applicare le impostazioni salvate.</strong></p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}

      {!editing && (
        <div>
          <button type="button" onClick={handleReset} disabled={busy}>
            {snapshot.hasOverrides ? 'Ripristina impostazioni predefinite' : 'Usa impostazioni predefinite'}
          </button>{' '}
          <button type="button" onClick={() => setEditing(true)} disabled={busy}>Personalizza impostazioni</button>
        </div>
      )}

      {editing && draft && (
        <form onSubmit={handleSave}>
          <fieldset disabled={busy}>
            <legend>Modalità operative</legend>
            <label>
              <input type="checkbox" checked={draft.testMode} onChange={event => updateDraft('testMode', event.target.checked)} />
              Modalità test
            </label>
            <p>Se attiva, viene elaborato un solo prodotto tra quelli selezionati.</p>
            <label>
              <input type="checkbox" checked={draft.dryRun} onChange={event => updateDraft('dryRun', event.target.checked)} />
              Modalità simulazione
            </label>
            <p>{draft.dryRun
              ? 'Modalità simulazione: nessuna modifica verrà scritta su Base.com.'
              : 'ATTENZIONE: modalità reale. Le operazioni possono modificare Base.com.'}</p>
            <label>
              Gestione categorie non mappate{' '}
              <select value={draft.unmappedCategoryPolicy} onChange={event => updateDraft('unmappedCategoryPolicy', event.target.value)}>
                <option value="block">Blocca l’importazione</option>
                <option value="skip">Escludi i prodotti non mappati</option>
              </select>
            </label>
          </fieldset>

          <fieldset disabled={busy}>
            <legend>Impostazioni avanzate</legend>
            {numberFields.map(({ key, label, min, max }) => (
              <div key={key}>
                <label>
                  {label}{' '}
                  <input type="number" min={min} max={max} step="1" value={draft[key]}
                    onChange={event => updateDraft(key, event.target.value)} required />
                </label>
              </div>
            ))}
          </fieldset>
          <button type="submit" disabled={busy}>Salva impostazioni</button>{' '}
          <button type="button" disabled={busy} onClick={() => { setDraft(snapshot.settings); setEditing(false); setError(''); }}>Annulla modifiche</button>
        </form>
      )}

      {snapshot.restartRequired && (
        <p><button type="button" onClick={handleRestart} disabled={busy}>Riavvia e applica</button></p>
      )}
    </section>
  );
}

export default SettingsPanel;
