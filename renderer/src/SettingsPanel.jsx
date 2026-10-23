import { useEffect, useState } from 'react';
import { notifyOperation } from './operationNotifications.js';
import { rateLimitGuidance } from './rateLimitGuidance.js';
import { parseNumericSettings } from './settingsValidation.js';
import {
  columnDefinitions, defaultColumns, markStartupViewHandled, readLayoutPreferences, readTableState,
  writeLayoutPreferences, writeTableState,
} from './uiPreferences.js';

const tabs = [
  ['technical', 'Tecniche'],
  ['catalog', 'Catalogo e importazione'],
  ['base', 'Base.com'],
  ['layout', 'Layout'],
  ['columns', 'Colonne prodotti'],
];
const fields = [
  { key: 'vudooResultsLimit', label: 'Limite prodotti Vudoo', min: 1, sliderMin: 100, max: 100000, step: 100, defaultValue: 3000, section: 'technical', description: 'Numero massimo di risultati richiesti per catalogo.' },
  { key: 'vudooTimeoutMs', label: 'Timeout caricamento catalogo', min: 1, max: 3600, step: 1, defaultValue: 90, section: 'technical', scale: 1000, unit: 'secondi', description: 'Durata massima di attesa della risposta Vudoo.' },
  { key: 'automaticStockCap', label: 'Stock automatico massimo', min: 1, max: 100, step: 1, defaultValue: 10, section: 'catalog', description: 'Limita la quantità automatica destinata a Base.com. Gli override manuali hanno priorità.' },
  { key: 'baseApiRequestsPerMinute', label: 'Richieste Base.com al minuto', min: 1, max: 10000, step: 1, defaultValue: 95, section: 'base' },
  { key: 'baseApiReadAttempts', label: 'Tentativi lettura Base.com', min: 1, max: 10, step: 1, defaultValue: 3, section: 'base' },
  { key: 'baseApiRetryDelayMs', label: 'Ritardo tra i tentativi', min: 0.001, sliderMin: 1, max: 3600, step: 1, defaultValue: 1, section: 'base', scale: 1000, unit: 'secondi' },
  { key: 'baseApiRateLimitDelayMs', label: 'Pausa dopo limite API', min: 0.001, sliderMin: 1, max: 3600, step: 1, defaultValue: 60, section: 'base', scale: 1000, unit: 'secondi' },
];
const numericFields = fields.map(field => ({
  key: field.key, label: field.label,
  min: field.scale ? field.min * field.scale : field.min,
  max: field.scale ? field.max * field.scale : field.max,
}));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const settingsError = response => response?.code === 'importInProgress'
  ? 'Attendi il termine dell’importazione prima di salvare.'
  : response?.code === 'invalidValue'
    ? `Valore non valido per ${fields.find(field => field.key === response.field)?.label || 'un’impostazione'}.`
    : 'Impossibile salvare le impostazioni. Riprova.';

export function NumericSetting({ field, value, onChange, disabled }) {
  const shown = field.scale && value !== '' ? Number(value) / field.scale : value;
  const numeric = Number(shown);
  const inRange = shown !== '' && Number.isSafeInteger(Number(value)) && numeric >= field.min && numeric <= field.max;
  const useSlider = field.max <= 100000;
  const update = raw => onChange(field.key, raw === '' ? '' : String(Math.round(Number(raw) * (field.scale || 1))));
  return <div className="settings-control">
    <div className="settings-control-heading"><label htmlFor={`setting-${field.key}`}>{field.label}</label><strong>{inRange ? `${shown} ${field.unit || ''}` : 'Valore da verificare'}</strong></div>
    {field.description && <p>{field.description}</p>}
    <div className="settings-number-control">
      {useSlider && <><span className="settings-range-label">{field.sliderMin || field.min}</span><input aria-label={`${field.label}: cursore`} type="range" min={field.sliderMin || field.min} max={field.max} step={field.step}
        value={inRange ? clamp(numeric, field.sliderMin || field.min, field.max) : field.defaultValue} onChange={event => update(Number(event.target.value))} disabled={disabled} /><span className="settings-range-label">{field.max}</span></>}
      <input className="input mono" id={`setting-${field.key}`} type="number" min={field.min} max={field.max} step={field.scale && field.min < 1 ? '0.001' : '1'}
        value={shown} onChange={event => update(event.target.value)} onBlur={() => {
          if (shown === '' || !Number.isFinite(numeric)) return;
          update(clamp(field.scale && field.min < 1 ? Math.round(numeric * field.scale) / field.scale : Math.round(numeric), field.min, field.max));
        }} aria-invalid={shown !== '' && !inRange} disabled={disabled} required />
      {field.unit && <span>{field.unit}</span>}
    </div>
    {!useSlider && <small>Valori consentiti: {field.min}–{field.max}.</small>}
    {field.key === 'baseApiRequestsPerMinute' && <small>{rateLimitGuidance(inRange ? numeric : field.defaultValue)}</small>}
  </div>;
}

function ToggleSetting({ id, title, description, checked, onChange, disabled }) {
  return <label className="settings-toggle"><span><strong>{title}</strong><small>{description}</small></span>
    <input id={id} type="checkbox" checked={Boolean(checked)} onChange={event => onChange(event.target.checked)} disabled={disabled} />
  </label>;
}

function ColumnsSettings({ state, onChange, filters, storageError }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState('');
  const current = state.views.find(view => view.id === selected);
  function change(updater, message) {
    const saved = onChange(previous => typeof updater === 'function' ? updater(previous) : updater);
    setFeedback(saved ? message : '');
    return saved;
  }
  function saveView() {
    const trimmed = name.trim();
    if (!trimmed || state.views.length >= 30) return;
    const id = globalThis.crypto?.randomUUID?.() || `view-${Date.now()}`;
    if (change(previous => ({ ...previous, views: [...previous.views, { id, name: trimmed, channel: 'base', filters, columns: previous.columns, density: previous.density, sort: previous.sort }] }), 'Vista salvata localmente.')) setSelected(id);
  }
  return <div className="settings-sections">
    <section className="card settings-section"><h2>Colonne visibili</h2><p>Prodotto, selezione e azioni restano sempre disponibili.</p>
      <div className="settings-column-list">{Object.entries(columnDefinitions.base).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={state.columns[key]} onChange={event => change(previous => ({ ...previous, columns: { ...previous.columns, [key]: event.target.checked } }), 'Colonne salvate localmente.')} /> {label}</label>)}</div>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => change(previous => ({ ...previous, columns: defaultColumns('base') }), 'Colonne predefinite ripristinate.')}>Ripristina colonne</button>
    </section>
    <section className="card settings-section"><h2>Viste salvate</h2><p>Conservano filtri, ricerca, colonne, densità e ordinamento disponibili al momento del salvataggio.</p>
      <div className="settings-view-controls"><label className="form-field"><span>Vista da gestire</span><select className="select" value={selected} onChange={event => { setSelected(event.target.value); setName(state.views.find(view => view.id === event.target.value)?.name || ''); }}><option value="">Seleziona una vista</option>{state.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
        <label className="form-field"><span>Nome vista</span><input className="input" value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Es. Base - da completare" /></label>
        <button className="btn btn-primary btn-sm" type="button" onClick={saveView} disabled={!name.trim() || state.views.length >= 30}>Salva nuova vista</button></div>
      {current && <div className="settings-view-actions">
        <button className="btn btn-secondary btn-sm" type="button" disabled={!name.trim()} onClick={() => change(previous => ({ ...previous, views: previous.views.map(view => view.id === selected ? { ...view, name: name.trim() } : view) }), 'Vista rinominata.')}>Rinomina</button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => { if (change(previous => ({ ...previous, views: previous.views.filter(view => view.id !== selected), startup: previous.startup === selected ? '' : previous.startup }), 'Vista eliminata.')) setSelected(''); }}>Elimina</button>
        <label><input type="checkbox" checked={state.startup === selected} onChange={event => change(previous => ({ ...previous, startup: event.target.checked ? selected : '' }), 'Vista iniziale salvata.')} /> Vista iniziale</label>
      </div>}
      {state.startup && <p>Vista all’avvio: <strong>{state.views.find(view => view.id === state.startup)?.name || 'Nessuna'}</strong></p>}
    </section>
    {storageError && <p className="alert alert-danger" role="alert">Non è stato possibile salvare le preferenze locali.</p>}
    {feedback && <p className="alert alert-success" role="status">{feedback}</p>}
  </div>;
}

export default function SettingsPanel({ scope = 'all', initialTab, dryRunMode, onModeChanged, onDiagnostics, filters = {} }) {
  const [tab, setTab] = useState(initialTab || (scope === 'base' ? 'base' : 'technical'));
  const [snapshot, setSnapshot] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [layout, setLayout] = useState(() => readLayoutPreferences());
  const [table, setTable] = useState(() => readTableState('base'));
  const [storageError, setStorageError] = useState(false);
  const [pageSizeInput, setPageSizeInput] = useState(() => String(readLayoutPreferences().pageSize));
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => { if (initialTab && tabs.some(([id]) => id === initialTab)) setTab(initialTab); }, [initialTab]);
  useEffect(() => {
    let active = true;
    if (!window.electronAPI?.getSettings) { setError('Collegamento con l’applicazione non disponibile.'); setLoading(false); return; }
    window.electronAPI.getSettings().then(response => {
      if (!active) return;
      if (!response?.ok) throw new Error('settings');
      setSnapshot(response); setDraft(response.settings);
    }).catch(() => { if (active) setError('Impossibile leggere le impostazioni.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retryCount]);
  useEffect(() => {
    if (typeof dryRunMode !== 'boolean') return;
    setSnapshot(current => current ? { ...current, activeSettings: { ...current.activeSettings, dryRun: dryRunMode } } : current);
  }, [dryRunMode]);
  function update(key, value) { setDraft(current => ({ ...current, [key]: value })); setError(''); setMessage(''); }
  function updateLayout(patch) {
    const next = { ...layout, ...patch };
    if (writeLayoutPreferences(next)) { setLayout(next); if (patch.pageSize !== undefined) setPageSizeInput(String(next.pageSize)); setStorageError(false); } else setStorageError(true);
  }
  function commitPageSize() {
    const value = Number(pageSizeInput);
    updateLayout({ pageSize: pageSizeInput.trim() && Number.isFinite(value) ? clamp(Math.round(value), 10, 200) : layout.pageSize });
  }
  function updateTable(updater) {
    const next = typeof updater === 'function' ? updater(table) : updater;
    if (writeTableState('base', next)) { markStartupViewHandled('base'); setTable(next); setStorageError(false); return true; }
    setStorageError(true); return false;
  }
  async function save(event) {
    event.preventDefault();
    const parsed = parseNumericSettings(draft, numericFields);
    if (parsed.error) { setError(parsed.error); return; }
    if (snapshot.activeSettings.dryRun === true && draft.dryRun === false &&
        !window.confirm('Attivare la modalità reale?\nLe operazioni di import potranno modificare Base.com.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await window.electronAPI.saveSettings(parsed.settings);
      if (!response?.ok) { setError(settingsError(response)); return; }
      setSnapshot(response); setDraft(response.settings); onModeChanged?.(response.activeSettings.dryRun);
      notifyOperation('settingsSaved');
      if (response.restartRequired) {
        setMessage('Impostazioni salvate. Riavvio necessario per applicare tutti i valori.');
      } else setMessage('Impostazioni salvate e attive.');
    } catch { setError('Impossibile salvare le impostazioni. Riprova.'); }
    finally { setBusy(false); }
  }
  async function restart() {
    setBusy(true); setError('');
    try {
      const response = await window.electronAPI.restartApp();
      if (!response?.ok) setError(settingsError(response));
    } catch { setError('Impossibile riavviare l’applicazione. Riavviala manualmente.'); }
    finally { setBusy(false); }
  }
  if (loading) return <div className="card working" role="status"><span className="spinner" /> Caricamento impostazioni…</div>;
  if (!snapshot || !draft) return <div className="card"><p className="alert alert-danger" role="alert">{error}</p><button className="btn btn-secondary" type="button" onClick={() => { setLoading(true); setError(''); setRetryCount(value => value + 1); }}>Riprova</button></div>;
  const dirty = Object.keys(draft).some(key => String(draft[key]) !== String(snapshot.settings[key]));
  const requiresRestart = Object.keys(snapshot.activeSettings).some(key => key !== 'dryRun' && String(draft[key]) !== String(snapshot.activeSettings[key]));
  return <section className="settings-panel" aria-label="Impostazioni Vudoo e Base.com">
    <nav className="settings-tabs" aria-label="Sezioni impostazioni">{tabs.map(([id, label]) =>
      <button type="button" key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }}>{label}</button>)}</nav>
    <div className="page-heading"><div><h1>Impostazioni</h1><p>Configurazione locale Vudoo e Base.com.</p></div></div>
    {snapshot.warning && <div className="alert alert-warning" role="alert">Il file delle impostazioni non è stato letto correttamente: sono in uso i valori predefiniti.</div>}
    {snapshot.environmentWarnings?.length > 0 && <div className="alert alert-warning" role="alert">Alcuni valori .env non sono validi: {snapshot.environmentWarnings.join(', ')}.</div>}
    {tab === 'layout' && <div className="settings-sections">
      <section className="card settings-section"><h2>Layout</h2><p>Queste preferenze vengono applicate e salvate subito su questo dispositivo.</p>
        <div className="settings-control"><label htmlFor="sidebar-start">Sidebar all’avvio</label><select className="select" id="sidebar-start" value={layout.sidebarCollapsed ? 'collapsed' : 'expanded'} onChange={event => updateLayout({ sidebarCollapsed: event.target.value === 'collapsed' })}><option value="expanded">Espansa</option><option value="collapsed">Compressa</option></select></div>
        <div className="settings-control"><label htmlFor="table-density">Densità tabella</label><select className="select" id="table-density" value={table.density} onChange={event => updateTable(previous => ({ ...previous, density: event.target.value }))}><option value="comfortable">Comoda</option><option value="compact">Compatta</option></select></div>
        <div className="settings-control"><div className="settings-control-heading"><label htmlFor="page-size">Righe per pagina</label><strong>{layout.pageSize}</strong></div><div className="settings-number-control"><span className="settings-range-label">10</span><input type="range" aria-label="Righe per pagina: cursore" min="10" max="200" step="10" value={layout.pageSize} onChange={event => updateLayout({ pageSize: Number(event.target.value) })} /><span className="settings-range-label">200</span><input className="input mono" id="page-size" type="number" min="10" max="200" step="1" value={pageSizeInput} onChange={event => setPageSizeInput(event.target.value)} onBlur={commitPageSize} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitPageSize(); } }} /></div></div>
      </section>{storageError && <p role="alert" className="alert alert-danger">Non è stato possibile salvare le preferenze locali.</p>}
    </div>}
    {tab === 'columns' && <ColumnsSettings state={table} onChange={updateTable} filters={filters} storageError={storageError} />}
    {['technical', 'catalog', 'base'].includes(tab) && <form className="settings-sections" onSubmit={save}>
      <section className="card settings-section"><div className="settings-section-heading"><div><h2>{tabs.find(([id]) => id === tab)?.[1]}</h2><p>{tab === 'technical' ? 'Configurazione del caricamento Vudoo.' : tab === 'catalog' ? 'Preparazione e limiti dell’importazione.' : 'Parametri operativi Base.com; la verifica della connessione resta in Diagnostica.'}</p></div>{tab === 'base' && <button className="btn btn-secondary btn-sm" type="button" onClick={onDiagnostics}>Apri Diagnostica</button>}</div>
        {tab === 'catalog' && <ToggleSetting id="setting-testMode" title="Limite di prova" description="Elabora un solo prodotto; non modifica la modalità Simulazione/Reale." checked={draft.testMode} onChange={value => update('testMode', value)} disabled={busy} />}
        {tab === 'base' && <><ToggleSetting id="setting-dryRun" title="Modalità simulazione" description="Quando attiva, nessuna importazione modifica Base.com." checked={draft.dryRun} onChange={value => update('dryRun', value)} disabled={busy} />
          <p className={`alert ${draft.dryRun ? 'alert-warning' : 'alert-danger'}`}>{draft.dryRun ? 'Simulazione: nessuna modifica inviata a Base.com.' : 'Modalità reale: le operazioni di import possono modificare Base.com.'}</p>
          {snapshot.activeSettings.dryRun !== draft.dryRun && <small>Modalità attiva: {snapshot.activeSettings.dryRun ? 'Simulazione' : 'Reale'}; il valore selezionato sarà applicato dopo il salvataggio.</small>}</>}
        {fields.filter(field => field.section === tab).map(field => <NumericSetting key={field.key} field={field} value={draft[field.key]} onChange={update} disabled={busy} />)}
      </section>
      {dirty && <p className="alert alert-warning settings-unsaved" role="status">Modifiche non salvate.</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      <div className="settings-actions"><button type="submit" className="btn btn-primary" disabled={busy || !dirty}>Salva modifiche</button>
        {dirty && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setDraft(snapshot.settings); setError(''); }}>Annulla modifiche</button>}
        {(snapshot.restartRequired || requiresRestart) && <span className="settings-restart-note">Le modifiche ai limiti tecnici richiedono il riavvio.</span>}
        {snapshot.restartRequired && <button type="button" className="btn btn-secondary" disabled={busy} onClick={restart}>Riavvia applicazione</button>}
      </div>
    </form>}
  </section>;
}
