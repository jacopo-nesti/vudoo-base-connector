import { notifyOperation } from './operationNotifications.js';
import { useEffect, useRef, useState } from 'react';
import { rateLimitGuidance } from './rateLimitGuidance.js';
import SettingHelp from './components/SettingHelp.jsx';
import { settingHelpContent } from './settingHelpContent.js';
import { parseNumericSettings } from './settingsValidation.js';

const numberFields = [
  { key: 'vudooResultsLimit', label: 'Limite risultati Vudoo', min: 1, description: 'Numero massimo di prodotti richiesti per catalogo.' },
  { key: 'vudooTimeoutMs', label: 'Timeout Vudoo (millisecondi)', min: 1 },
  { key: 'baseApiRequestsPerMinute', label: 'Richieste Base.com al minuto', min: 1 },
  { key: 'baseApiReadAttempts', label: 'Tentativi di lettura Base.com', min: 1, max: 10 },
  { key: 'baseApiRetryDelayMs', label: 'Ritardo tra i tentativi (millisecondi)', min: 1, max: 3600000 },
  { key: 'baseApiRateLimitDelayMs', label: 'Pausa dopo limite API (millisecondi)', min: 1, max: 3600000 },
];

const fieldLabels = {
  testMode: 'Limite di prova (un prodotto)',
  dryRun: 'Modalità simulazione',
  unmappedCategoryPolicy: 'Policy categorie legacy',
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
    return 'Attendi la fine dell’importazione prima di modificare le impostazioni.';
  }
  return 'Impossibile completare l’operazione sulle impostazioni. Riprova.';
}

const categoryPolicyOptions = [
  { value: 'block', label: 'block (legacy)' },
  { value: 'skip', label: 'skip (legacy)' },
];

function HelpLabel({ field, label }) {
  return <span className="setting-label-line">{label}<SettingHelp label={label}>{settingHelpContent[field]}</SettingHelp></span>;
}

function OverviewValue({ field, label, value }) {
  return <div><span className="setting-overview-label"><HelpLabel field={field} label={label} /></span><strong className={typeof value === 'number' ? 'mono' : undefined}>{value}</strong></div>;
}

function CategoryPolicySelect({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function closeOnOutsideClick(event) {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const selected = categoryPolicyOptions.find(option => option.value === value);
  return <div className="form-field">
    <span id="category-policy-label"><HelpLabel field="unmappedCategoryPolicy" label="Policy categorie legacy (non applicata a Base.com)" /></span>
    <div className="policy-picker" ref={pickerRef}>
      <button className="select policy-picker-trigger" type="button" ref={triggerRef}
        aria-labelledby="category-policy-label category-policy-value" aria-haspopup="listbox"
        aria-expanded={open} aria-controls="category-policy-options" disabled={disabled}
        onClick={() => setOpen(current => !current)}>
        <span id="category-policy-value">{selected?.label ?? value}</span><span aria-hidden="true">⌄</span>
      </button>
      {open && <div className="policy-picker-options" id="category-policy-options" role="listbox" aria-labelledby="category-policy-label">
        {categoryPolicyOptions.map(option => <button key={option.value} className="policy-picker-option" type="button"
          role="option" aria-selected={value === option.value} onClick={() => {
            onChange(option.value);
            setOpen(false);
            triggerRef.current?.focus();
          }}>{option.label}</button>)}
      </div>}
    </div>
  </div>;
}

function SettingsPanel({ scope = 'base', dryRunMode, onModeChanged }) {
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

  useEffect(() => {
    if (typeof dryRunMode !== 'boolean') return;
    setSnapshot(current => current ? {
      ...current,
      settings: { ...current.settings, dryRun: dryRunMode },
      activeSettings: { ...current.activeSettings, dryRun: dryRunMode },
      hasOverrides: current.hasOverrides || current.activeSettings.dryRun !== dryRunMode,
    } : current);
    setDraft(current => current ? { ...current, dryRun: dryRunMode } : current);
  }, [dryRunMode]);

  function updateDraft(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
    setError('');
    setMessage('');
  }

  async function handleSave(event) {
    event.preventDefault();
    const parsed = parseNumericSettings(draft, numberFields);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }
    if (snapshot?.activeSettings.dryRun === true && draft?.dryRun === false &&
      !window.confirm('Attivare la modalità reale?\nLe operazioni di import potranno modificare Base.com.')) return;
    const settings = parsed.settings;
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
      onModeChanged?.(response.activeSettings.dryRun);
      setEditing(false);
      notifyOperation('settingsSaved');
      if (response.restartRequired) {
        setMessage('Le modifiche richiedono il riavvio dell’applicazione. Riavvio in corso…');
        const restart = await window.electronAPI.restartApp();
        if (!restart?.ok) setError(errorMessage(restart));
      } else setMessage('Impostazioni salvate e già attive.');
    } catch {
      setError('Impossibile salvare le impostazioni. Riprova.');
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (snapshot?.activeSettings.dryRun === true && snapshot?.settings.dryRun === true &&
      !window.confirm('Ripristinare le impostazioni? La modalità reale potrebbe diventare attiva e le importazioni potrebbero modificare Base.com.')) return;
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
      onModeChanged?.(response.activeSettings.dryRun);
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
  const visibleNumberFields = numberFields.filter(field => scope === 'all' || (scope === 'system'
    ? field.key.startsWith('vudoo') : !field.key.startsWith('vudoo')));
  const vudooFields = visibleNumberFields.filter(field => field.key.startsWith('vudoo'));
  const baseFields = visibleNumberFields.filter(field => !field.key.startsWith('vudoo'));
  const hasUnsavedChanges = draft && Object.keys(draft).some(key => String(draft[key]) !== String(snapshot.settings[key]));
  const willRequireRestart = draft && Object.keys(snapshot.activeSettings).some(key => key !== 'dryRun' &&
    String(draft[key]) !== String(snapshot.activeSettings[key]));

  return (
    <section className="settings-panel page-stack" aria-label={scope === 'base' ? 'Impostazioni Base.com' : 'Impostazioni Vudoo e Base.com'}>
      <div className="card"><div className="card-heading"><div><h2>Impostazioni salvate</h2><p>La modalità operativa si applica subito. Le altre modifiche possono richiedere il riavvio.</p></div></div>
      {snapshot.warning === 'invalidFile' && (
        <div className="alert alert-warning" role="alert">Il file delle impostazioni non è valido. Sono stati usati i valori predefiniti; puoi salvare nuove impostazioni o ripristinarle.</div>
      )}
      {snapshot.warning === 'readError' && (
        <div className="alert alert-warning" role="alert">Non è stato possibile leggere il file delle impostazioni. Sono stati usati i valori predefiniti.</div>
      )}
      {snapshot.environmentWarnings.length > 0 && (
        <div className="alert alert-warning" role="alert">Alcuni valori di .env non sono validi: {snapshot.environmentWarnings.join(', ')}. Correggili oppure salva impostazioni valide e riavvia.</div>
      )}
      {scope !== 'system' && <dl className="detail-list"><div><dt>Richieste Base.com al minuto</dt><dd>{snapshot.settings.baseApiRequestsPerMinute}</dd></div><div><dt>Modalità attiva</dt><dd>{snapshot.activeSettings.dryRun === null
        ? 'Configurazione non valida' : snapshot.activeSettings.dryRun ? 'Simulazione' : 'Reale'}</dd></div></dl>}
      {scope !== 'system' && <p className="settings-guidance">{rateLimitGuidance(snapshot.settings.baseApiRequestsPerMinute)}</p>}
      {!editing && <div className="settings-overview">
        {vudooFields.length > 0 && <><h3 className="settings-overview-heading">Vudoo</h3>{vudooFields.map(({ key, label }) => <OverviewValue key={key} field={key} label={label} value={snapshot.settings[key]} />)}</>}
        {scope !== 'system' && <><h3 className="settings-overview-heading">Base.com</h3>
          <OverviewValue field="testMode" label="Limite di prova (un prodotto)" value={snapshot.settings.testMode ? 'Attivo' : 'Disattivo'} />
          <OverviewValue field="dryRun" label="Modalità operativa" value={snapshot.settings.dryRun ? 'Simulazione' : 'Reale'} />
          <OverviewValue field="unmappedCategoryPolicy" label="Policy categorie legacy" value="Non blocca Base.com" />
          {baseFields.map(({ key, label }) => <OverviewValue key={key} field={key} label={label} value={snapshot.settings[key]} />)}
        </>}
      </div>}
      {snapshot.restartRequired && <div className="alert alert-warning" role="status"><strong>Le modifiche richiedono il riavvio dell’applicazione.</strong></div>}
      {message && <div className="alert alert-success" role="status">{message}</div>}
      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      {!editing && (
        <div className="settings-actions">
          {scope !== 'base' && <><button className="btn btn-secondary" type="button" onClick={handleReset} disabled={busy}>
            {snapshot.hasOverrides ? 'Ripristina tutte le impostazioni predefinite' : 'Usa impostazioni predefinite'}
          </button>{' '}</>}
          <button className="btn btn-primary" type="button" onClick={() => { setEditing(true); setMessage(''); setError(''); }} disabled={busy}>Personalizza impostazioni</button>
        </div>
      )}
      </div>

      {editing && draft && (
        <form className="settings-form page-stack" onSubmit={handleSave} noValidate>
          {scope !== 'system' && <fieldset className="card" disabled={busy}>
            <legend>Import Base.com</legend>
            <div className="settings-toggle"><div><div className="setting-label-row"><label htmlFor="setting-testMode"><strong>Limite di prova (un prodotto)</strong></label><SettingHelp label="Limite di prova (un prodotto)">{settingHelpContent.testMode}</SettingHelp></div><small>Elabora un solo prodotto. Non cambia la modalità operativa.</small></div><input id="setting-testMode" type="checkbox" checked={draft.testMode} onChange={event => updateDraft('testMode', event.target.checked)} /></div>
            <div className="settings-toggle"><div><div className="setting-label-row"><label htmlFor="setting-dryRun"><strong>Modalità simulazione</strong></label><SettingHelp label="Modalità operativa">{settingHelpContent.dryRun}</SettingHelp></div><small>Nessuna scrittura su Base.com quando attiva.</small></div><input id="setting-dryRun" type="checkbox" checked={draft.dryRun} onChange={event => updateDraft('dryRun', event.target.checked)} /></div>
            <p className={`alert ${draft.dryRun ? 'alert-warning' : 'alert-danger'}`}>{draft.dryRun
              ? 'Modalità simulazione: nessuna modifica verrà scritta su Base.com.'
              : 'ATTENZIONE: modalità reale. Le operazioni possono modificare Base.com.'}</p>
            <CategoryPolicySelect value={draft.unmappedCategoryPolicy}
              onChange={value => updateDraft('unmappedCategoryPolicy', value)} disabled={busy} />
          </fieldset>}

          {[{ title: 'Catalogo Vudoo', fields: vudooFields }, { title: 'Connessione Base.com', fields: baseFields }].filter(group => group.fields.length > 0).map(group => <fieldset className="card" disabled={busy} key={group.title}>
            <legend>{group.title}</legend>
            <div className="settings-number-grid">
            {group.fields.map(({ key, label, min, max, description }) => (
              <div key={key} className="form-field">
                <div className="setting-label-row"><label htmlFor={`setting-${key}`}>{label}</label><SettingHelp label={label}>{settingHelpContent[key]}</SettingHelp></div>
                {description && <small className="setting-description">{description}</small>}
                  <input className="input mono" id={`setting-${key}`} type="number" min={min} max={max} step="1" value={draft[key]}
                    onChange={event => updateDraft(key, event.target.value)} required />
                {key === 'baseApiRequestsPerMinute' && <p className="settings-guidance">{rateLimitGuidance(draft[key])}</p>}
              </div>
            ))}
            </div>
          </fieldset>)}
          {hasUnsavedChanges && <p className="alert alert-warning settings-unsaved" role="status">Modifiche non salvate.</p>}
          <div className="settings-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{willRequireRestart ? 'Salva e riavvia' : 'Salva impostazioni'}</button>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => { setDraft(snapshot.settings); setEditing(false); setError(''); }}>Annulla modifiche</button></div>
        </form>
      )}

      {snapshot.restartRequired && (
        <div className="card"><button className="btn btn-primary" type="button" onClick={handleRestart} disabled={busy}>Riavvia applicazione</button></div>
      )}
    </section>
  );
}

export default SettingsPanel;
