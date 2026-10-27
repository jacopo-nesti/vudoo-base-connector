import { useEffect, useRef, useState } from 'react';
import { notifyOperation } from './operationNotifications.js';
import { rateLimitGuidance } from './rateLimitGuidance.js';
import { parseNumericSettings } from './settingsValidation.js';
import { baseConnectionView } from './baseConnectionView.js';
import CategoryMappingsSettings from './components/CategoryMappingsSettings.jsx';
import {
  allowStartupViewOnNextEntry, clampColumnWidth, defaultColumnOrder, defaultColumnWidths, defaultColumns, markStartupViewHandled,
  pinnedColumnOffsets, productColumns, readLayoutPreferences, readTableState, resetVisualPreferences, visibleColumnOrder,
  writeLayoutPreferences, writeTableState,
} from './uiPreferences.js';

const tabs = [
  ['general', 'Generali'],
  ['technical', 'Tecniche'],
  ['catalog', 'Catalogo e importazione'],
  ['base', 'Base.com'],
  ['layout', 'Layout'],
  ['columns', 'Colonne prodotti'],
  ['advanced', 'Avanzate'],
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

function LocalDataCard({ info, onCopy, onOpen, feedback }) {
  return <section className="card settings-section"><h2>Dati locali</h2><p>Cartella dati dell’applicazione su questo computer.</p>
    <strong>Cartella dati applicazione</strong><code className="settings-path">{info?.dataPath || 'Non disponibile'}</code>
    <div className="settings-path-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={!info?.dataPath} onClick={onCopy}>Copia percorso</button>
      <button type="button" className="btn btn-secondary btn-sm" disabled={!info?.dataPath} onClick={onOpen}>Apri cartella dati</button></div>
    {feedback && <small role="status">{feedback}</small>}
  </section>;
}

function LayoutNumber({ id, label, value, min, max, unit = 'px', onChange }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => { const n = Number(draft); if (draft.trim() && Number.isFinite(n)) onChange(clamp(Math.round(n), min, max)); else setDraft(String(value)); };
  return <div className="settings-control"><div className="settings-control-heading"><label htmlFor={id}>{label}</label><strong>{value} {unit}</strong></div>
    <div className="settings-number-control"><span className="settings-range-label">{min}</span><input aria-label={`${label}: cursore`} type="range" min={min} max={max} value={value} onChange={event => onChange(Number(event.target.value))} /><span className="settings-range-label">{max}</span>
      <input className="input mono" id={id} type="number" min={min} max={max} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} /></div>
  </div>;
}

export function LayoutPreview({ layout, density }) {
  return <section className="card settings-section settings-preview" data-density={density}><h2>Anteprima in tempo reale</h2><p>Solo dati illustrativi: le scelte si applicano subito.</p>
    <div className="settings-preview-card"><strong>◇ &nbsp; Esempio di card</strong><p>Un esempio dell’aspetto dei contenuti e delle azioni.</p><div className="settings-preview-actions"><span className="btn btn-primary">Azione principale</span><span className="btn btn-secondary">Azione secondaria</span></div></div>
    <div className="settings-preview-table"><table><thead><tr><th>Prodotto</th><th>SKU</th><th>Prezzo</th></tr></thead><tbody>{[['Collana Venere', 'COL-001', '€ 49,90'], ['Orecchini Luna', 'ORE-002', '€ 29,90'], ['Bracciale Stella', 'BRA-003', '€ 39,00']].map(([name, sku, price]) => <tr key={sku}><td>{name}</td><td>{sku}</td><td>{price}</td></tr>)}</tbody></table></div>
    <small className="muted">Tema: {layout.theme} · Accento: {layout.accent} · Densità: {density} · Testo: {layout.tableFontSize} px · Angoli: {layout.radius} px</small>
  </section>;
}

function ColumnWidthInput({ columnKey, column, width, onCommit }) {
  const [draft, setDraft] = useState(String(width));
  useEffect(() => { setDraft(String(width)); }, [width]);
  function commit() {
    if (!draft.trim() || !Number.isFinite(Number(draft))) { setDraft(String(width)); return; }
    const clamped = clampColumnWidth(columnKey, draft);
    setDraft(String(clamped));
    onCommit(columnKey, clamped);
  }
  return <label><span className="sr-only">Larghezza in pixel {column.label}</span><input className="input mono" type="number" min={column.min} max={column.max} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /></label>;
}

function ColumnsSettings({ state, onChange, filters, storageError, pageSize, onResetPageSize }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState('');
  const [feedback, setFeedback] = useState('');
  const [viewError, setViewError] = useState('');
  const previewRef = useRef(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  const current = state.views.find(view => view.id === selected);
  const ordered = state.order || defaultColumnOrder();
  const visible = visibleColumnOrder(state);
  const previewPinnedOffsets = pinnedColumnOffsets(state, 42, previewWidth ? Math.floor(previewWidth * 0.62) : 520);
  const previewPinLimited = state.pinned.some(key => visible.includes(key) && previewPinnedOffsets[key] === undefined);
  const sortable = [['source', 'Ordine catalogo'], ...Object.values(productColumns).filter(column => column.sort).map(column => [column.sort, column.label])];
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const measure = () => setPreviewWidth(element.clientWidth);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  function change(updater, message) {
    const saved = onChange(previous => typeof updater === 'function' ? updater(previous) : updater);
    setFeedback(saved ? message : '');
    return saved;
  }
  function move(key, shift) {
    const next = [...ordered]; const index = next.indexOf(key); const target = index + shift;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change(previous => ({ ...previous, order: next }), 'Ordine colonne salvato.');
  }
  function updateWidth(key, value) {
    change(previous => ({ ...previous, widths: { ...previous.widths, [key]: clampColumnWidth(key, value) } }), 'Larghezza salvata.');
  }
  function saveView() {
    const trimmed = name.trim();
    if (!trimmed) { setViewError('Inserisci un nome per la vista.'); return; }
    if (state.views.some(view => view.name.toLocaleLowerCase('it') === trimmed.toLocaleLowerCase('it'))) { setViewError('Esiste già una vista con questo nome.'); return; }
    if (state.views.length >= 30) { setViewError('Puoi salvare al massimo 30 viste.'); return; }
    setViewError('');
    const id = globalThis.crypto?.randomUUID?.() || `view-${Date.now()}`;
    if (change(previous => ({ ...previous, views: [...previous.views, {
      id, name: trimmed, channel: 'base', filters, columns: previous.columns,
      order: previous.order, widths: previous.widths, pinned: previous.pinned,
      density: previous.density, sort: previous.sort, pageSize,
    }] }), 'Vista salvata localmente.')) setSelected(id);
  }
  return <div className="settings-sections">
    <section className="card settings-section"><div className="settings-section-heading"><div><h2>Colonne prodotti</h2><p>Selezione e Prodotto restano visibili: la seconda contiene le azioni e l’Inspector. Le modifiche si salvano subito su questo dispositivo.</p></div></div>
      <div className="settings-column-grid">{ordered.map((key, index) => {
        const column = productColumns[key]; if (!column) return null;
        return <div className="settings-column-row" key={key}>
          <label className="settings-column-name"><input type="checkbox" checked={Boolean(state.columns[key])} disabled={key === 'title'} onChange={event => change(previous => ({ ...previous, columns: { ...previous.columns, [key]: event.target.checked }, pinned: event.target.checked ? previous.pinned : previous.pinned.filter(value => value !== key) }), 'Visibilità salvata.')} /> {column.label}{key === 'title' && <small> · azioni</small>}</label>
          <div className="settings-column-order" aria-label={`Ordine ${column.label}`}><button type="button" className="btn btn-quiet btn-sm" disabled={index === 0} aria-label={`Sposta ${column.label} su`} onClick={() => move(key, -1)}>↑</button><button type="button" className="btn btn-quiet btn-sm" disabled={index === ordered.length - 1} aria-label={`Sposta ${column.label} giù`} onClick={() => move(key, 1)}>↓</button></div>
          <label><input type="checkbox" checked={state.pinned?.includes(key) || false} disabled={!state.columns[key]} onChange={event => change(previous => ({ ...previous, pinned: event.target.checked ? [...previous.pinned, key] : previous.pinned.filter(value => value !== key) }), 'Colonne fissate salvate.')} /> Fissa</label>
          <label className="settings-column-width"><span className="sr-only">Larghezza {column.label}</span><input type="range" min={column.min} max={column.max} step="1" value={state.widths[key]} onChange={event => updateWidth(key, event.target.value)} aria-label={`Larghezza ${column.label}`} /><small>{column.min}–{column.max} px</small></label>
          <ColumnWidthInput columnKey={key} column={column} width={state.widths[key]} onCommit={updateWidth} />
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => updateWidth(key, column.defaultWidth)} aria-label={`Larghezza predefinita ${column.label}`}>Default</button>
        </div>;
      })}</div>
      <p className="settings-hint">Le colonne fissate rimangono a sinistra durante lo scorrimento orizzontale. Se manca spazio, quelle in eccesso scorrono normalmente.</p>
      {previewPinLimited && <p className="alert alert-warning" role="status">Con questa larghezza, alcune colonne selezionate non possono rimanere fisse. Riduci le larghezze o usa una finestra più ampia.</p>}
    </section>
    <section className="card settings-section"><h2>Ordine e anteprima</h2>
      <div className="settings-view-controls"><label className="form-field"><span>Ordina per</span><select className="select" value={state.sort.split(':')[0]} onChange={event => change(previous => ({ ...previous, sort: event.target.value + (previous.sort.endsWith(':desc') && event.target.value !== 'source' ? ':desc' : '') }), 'Ordinamento salvato.')} >{sortable.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="form-field"><span>Direzione</span><select className="select" value={state.sort.endsWith(':desc') ? 'desc' : 'asc'} disabled={state.sort === 'source'} onChange={event => change(previous => ({ ...previous, sort: previous.sort.split(':')[0] + (event.target.value === 'desc' ? ':desc' : '') }), 'Direzione salvata.')}><option value="asc">Crescente</option><option value="desc">Decrescente</option></select></label>
        <label className="form-field"><span>Densità</span><select className="select" value={state.density} onChange={event => change(previous => ({ ...previous, density: event.target.value }), 'Densità salvata.')}><option value="comfortable">Comoda</option><option value="compact">Compatta</option></select></label>
        <div className="form-field"><span>Righe per pagina</span><strong>{pageSize}</strong><small>Modifica in Layout. Le nuove viste conservano questo valore.</small></div></div>
      <p className="settings-hint">Anteprima con dati dimostrativi.</p>
      <div className="settings-table-preview" ref={previewRef} data-density={state.density} aria-label="Anteprima configurazione tabella"><table style={{ width: 42 + visible.reduce((sum, key) => sum + state.widths[key], 0) }}><colgroup><col style={{ width: 42 }} />{visible.map(key => <col key={key} style={{ width: state.widths[key] }} />)}</colgroup><thead><tr><th>✓</th>{visible.map(key => <th key={key} data-pinned={previewPinnedOffsets[key] !== undefined} style={previewPinnedOffsets[key] === undefined ? undefined : { left: previewPinnedOffsets[key] }} title={productColumns[key].label}>{productColumns[key].label}</th>)}</tr></thead><tbody><tr><td>□</td>{visible.map(key => <td key={key} data-pinned={previewPinnedOffsets[key] !== undefined} style={previewPinnedOffsets[key] === undefined ? undefined : { left: previewPinnedOffsets[key] }} title={{sku:'534078',title:'Agenda settimanale',ean:'8050000000000',brand:'Marca',category:'Cancelleria',mpn:'Riferimento',price:'€ 12,00',stock:'10'}[key]}>{{sku:'534078',title:'Agenda settimanale',ean:'8050000000000',brand:'Marca',category:'Cancelleria',mpn:'Riferimento',price:'€ 12,00',stock:'10'}[key]}</td>)}</tr></tbody></table></div>
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => { if (change(previous => ({ ...previous, columns: defaultColumns('base'), order: defaultColumnOrder(), widths: defaultColumnWidths(), pinned: [], sort: 'source', density: 'comfortable', startup: '' }), '')) { if (onResetPageSize()) { setViewError(''); setFeedback('Configurazione tabella ripristinata; le viste personali sono state conservate.'); } else { setFeedback(''); setViewError('Colonne ripristinate, ma righe per pagina non salvate. Riprova.'); } } }}>Ripristina configurazione tabella</button>
    </section>
    <section className="card settings-section"><h2>Viste salvate</h2><p>Conservano filtri, ricerca, colonne, ordine, larghezze, colonne fissate, densità, ordinamento e righe per pagina.</p>
      <div className="settings-view-controls"><label className="form-field"><span>Vista da gestire</span><select className="select" value={selected} onChange={event => { setSelected(event.target.value); setName(state.views.find(view => view.id === event.target.value)?.name || ''); }}><option value="">Seleziona una vista</option>{state.views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
        <label className="form-field"><span>Nome vista</span><input className="input" value={name} maxLength={60} onChange={event => { setName(event.target.value); setViewError(''); }} placeholder="Es. Base - da completare" /></label>
        <button className="btn btn-primary btn-sm" type="button" onClick={saveView} disabled={!name.trim() || state.views.length >= 30}>Salva nuova vista</button></div>
      {current && <div className="settings-view-actions">
        <button className="btn btn-secondary btn-sm" type="button" disabled={!name.trim()} onClick={() => { const trimmed = name.trim(); if (state.views.some(view => view.id !== selected && view.name.toLocaleLowerCase('it') === trimmed.toLocaleLowerCase('it'))) { setViewError('Esiste già una vista con questo nome.'); return; } change(previous => ({ ...previous, views: previous.views.map(view => view.id === selected ? { ...view, name: trimmed } : view) }), 'Vista rinominata.'); }}>Rinomina</button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => { if (change(previous => ({ ...previous, views: previous.views.filter(view => view.id !== selected), startup: previous.startup === selected ? '' : previous.startup }), 'Vista eliminata.')) setSelected(''); }}>Elimina</button>
        <label><input type="checkbox" checked={state.startup === selected} onChange={event => { if (change(previous => ({ ...previous, startup: event.target.checked ? selected : '' }), 'Vista iniziale salvata.')) allowStartupViewOnNextEntry('base'); }} /> Vista iniziale</label>
      </div>}
      {state.startup && <p>Vista all’avvio: <strong>{state.views.find(view => view.id === state.startup)?.name || 'Nessuna'}</strong></p>}
    </section>
    {viewError && <p className="alert alert-danger" role="alert">{viewError}</p>}
    {storageError && <p className="alert alert-danger" role="alert">Non è stato possibile salvare le preferenze locali.</p>}
    {feedback && <p className="alert alert-success" role="status">{feedback}</p>}
  </div>;
}

export default function SettingsPanel({ scope = 'all', initialTab, dryRunMode, baseConfigured, baseConnection, catalog, onModeChanged, onDiagnostics, onCategoryMappingsChanged, filters = {} }) {
  const [tab, setTab] = useState(initialTab || (scope === 'base' ? 'base' : 'general'));
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
  const [localInfo, setLocalInfo] = useState(null);
  const [localFeedback, setLocalFeedback] = useState('');
  const resetDialog = useRef(null);

  useEffect(() => { if (initialTab && tabs.some(([id]) => id === initialTab)) setTab(initialTab); }, [initialTab]);
  useEffect(() => { let active = true; window.electronAPI?.getLocalAppInfo?.().then(info => { if (active) setLocalInfo(info); }).catch(() => {}); return () => { active = false; }; }, []);
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
    if (writeLayoutPreferences(next)) { setLayout(next); if (patch.pageSize !== undefined) setPageSizeInput(String(next.pageSize)); setStorageError(false); return true; }
    setStorageError(true); return false;
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
  async function copyDataPath() {
    try { const result = await window.electronAPI.copyAppDataPath(); setLocalFeedback(result?.ok ? 'Percorso copiato.' : 'Impossibile copiare il percorso.'); }
    catch { setLocalFeedback('Impossibile copiare il percorso.'); }
  }
  async function openDataFolder() {
    try { const result = await window.electronAPI.openAppDataFolder(); setLocalFeedback(result?.ok ? 'Cartella aperta.' : 'Impossibile aprire la cartella dati.'); }
    catch { setLocalFeedback('Impossibile aprire la cartella dati.'); }
  }
  function restoreVisualPreferences() {
    if (resetVisualPreferences()) {
      setLayout(readLayoutPreferences()); setTable(readTableState('base'));
      setPageSizeInput(String(readLayoutPreferences().pageSize)); setStorageError(false);
      setLocalFeedback('Preferenze interfaccia ripristinate.');
    } else setStorageError(true);
    resetDialog.current?.close();
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
      setSnapshot(response); setDraft(response.settings);
      onModeChanged?.(response.activeSettings.dryRun, response.activeSettings.testMode);
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
  const requiresRestart = Object.keys(snapshot.activeSettings).some(key => !['dryRun', 'testMode'].includes(key) && String(draft[key]) !== String(snapshot.activeSettings[key]));
  return <section className="settings-panel" aria-label="Impostazioni Vudoo e Base.com">
    <nav className="settings-tabs" aria-label="Sezioni impostazioni">{tabs.map(([id, label]) =>
      <button type="button" key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); setError(''); }}>{label}</button>)}</nav>
    <div className="page-heading"><div><h1>Impostazioni</h1><p>Configurazione locale Vudoo e Base.com.</p></div></div>
    {snapshot.warning && <div className="alert alert-warning" role="alert">Il file delle impostazioni non è stato letto correttamente: sono in uso i valori predefiniti.</div>}
    {snapshot.environmentWarnings?.length > 0 && <div className="alert alert-warning" role="alert">Alcuni valori .env non sono validi: {snapshot.environmentWarnings.join(', ')}.</div>}
    {tab === 'general' && <div className="settings-sections settings-cards">
      <section className="card settings-section"><h2>Informazioni applicazione</h2><p>Stato corrente di Vudoo Product Manager.</p><dl className="settings-facts">
        <div><dt>Applicazione</dt><dd>{localInfo?.appName || 'Vudoo Product Manager'}</dd></div><div><dt>Versione</dt><dd>{localInfo?.version || 'Non disponibile'}</dd></div>
        <div><dt>Modalità</dt><dd>{dryRunMode === true ? 'Simulazione' : dryRunMode === false ? 'Reale' : 'Non disponibile'}</dd></div>
        <div><dt>Catalogo attivo</dt><dd>{catalog?.manufacturerName || catalog?.channelTitle || 'Nessun catalogo caricato'}</dd></div>
        <div><dt>Prodotti caricati</dt><dd>{catalog?.totalProducts ?? catalog?.products?.length ?? 'Non disponibile'}</dd></div>
      </dl></section>
      <section className="card settings-section"><h2>Base.com</h2><p>Stato condiviso con Diagnostica.</p><strong>{baseConnectionView(baseConnection?.configured ?? baseConfigured, baseConnection?.verification).text}</strong><div><button type="button" className="btn btn-secondary btn-sm" onClick={onDiagnostics}>Apri Diagnostica</button></div></section>
      <LocalDataCard info={localInfo} onCopy={copyDataPath} onOpen={openDataFolder} feedback={localFeedback} />
    </div>}
    {tab === 'layout' && <div className="settings-sections settings-cards">
      <section className="card settings-section"><h2>Layout</h2><p>Preferenze visive applicate e salvate subito su questo dispositivo.</p>
        <fieldset className="settings-theme"><legend>Tema</legend><div className="settings-theme-options">{[['light', 'Chiaro'], ['dark', 'Scuro'], ['system', 'Sistema']].map(([value, label]) =>
          <label key={value}><input type="radio" name="theme" value={value} checked={layout.theme === value} onChange={() => updateLayout({ theme: value })} />{label}</label>)}</div></fieldset>
        <fieldset className="settings-theme"><legend>Accento colore</legend><div className="settings-choice-row">{[['blue', 'Blu'], ['azure', 'Azzurro'], ['cyan', 'Ciano']].map(([value, label]) => <label key={value}><span className={`settings-accent-swatch settings-accent-swatch--${value}`} aria-hidden="true" /><input type="radio" name="accent" value={value} checked={layout.accent === value} onChange={() => updateLayout({ accent: value })} />{label}</label>)}</div></fieldset>
        <div className="settings-control"><label htmlFor="sidebar-start">Sidebar all’avvio</label><select className="select" id="sidebar-start" value={layout.sidebarCollapsed ? 'collapsed' : 'expanded'} onChange={event => updateLayout({ sidebarCollapsed: event.target.value === 'collapsed' })}><option value="expanded">Espansa</option><option value="collapsed">Compressa</option></select></div>
        <div className="settings-control"><label htmlFor="table-density">Densità tabella</label><select className="select" id="table-density" value={table.density} onChange={event => updateTable(previous => ({ ...previous, density: event.target.value }))}><option value="comfortable">Comoda</option><option value="compact">Compatta</option></select></div>
        <ToggleSetting id="layout-animations" title="Animazioni interfaccia" description="Riduce le transizioni decorative quando disattivate." checked={layout.animations} onChange={value => updateLayout({ animations: value })} />
        <LayoutNumber id="layout-table-font-size" label="Dimensione testo tabella" min={12} max={18} value={layout.tableFontSize} onChange={value => updateLayout({ tableFontSize: value })} />
        <LayoutNumber id="layout-radius" label="Angoli arrotondati" min={0} max={24} value={layout.radius} onChange={value => updateLayout({ radius: value })} />
        <div className="settings-control"><div className="settings-control-heading"><label htmlFor="page-size">Righe per pagina</label><strong>{layout.pageSize}</strong></div><div className="settings-number-control"><span className="settings-range-label">10</span><input type="range" aria-label="Righe per pagina: cursore" min="10" max="200" step="10" value={layout.pageSize} onChange={event => updateLayout({ pageSize: Number(event.target.value) })} /><span className="settings-range-label">200</span><input className="input mono" id="page-size" type="number" min="10" max="200" step="1" value={pageSizeInput} onChange={event => setPageSizeInput(event.target.value)} onBlur={commitPageSize} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commitPageSize(); } }} /></div></div>
      </section><LayoutPreview layout={layout} density={table.density} />{storageError && <p role="alert" className="alert alert-danger">Non è stato possibile salvare le preferenze locali.</p>}
    </div>}
    {tab === 'columns' && <ColumnsSettings state={table} onChange={updateTable} filters={filters} storageError={storageError} pageSize={layout.pageSize} onResetPageSize={() => updateLayout({ pageSize: 50 })} />}
    {tab === 'advanced' && <div className="settings-sections settings-cards"><LocalDataCard info={localInfo} onCopy={copyDataPath} onOpen={openDataFolder} feedback={localFeedback} />
      <section className="card settings-section"><h2>Preferenze interfaccia</h2><p>Ripristina tema, accento, densità, sidebar, animazioni, dimensione testo, angoli e righe per pagina. Le viste salvate e le colonne restano disponibili.</p>
        <div><button type="button" className="btn btn-secondary" onClick={() => resetDialog.current?.showModal()}>Ripristina preferenze interfaccia</button></div></section>
      {storageError && <p role="alert" className="alert alert-danger">Non è stato possibile salvare le preferenze locali.</p>}
      <dialog ref={resetDialog} className="settings-reset-dialog" aria-labelledby="reset-ui-title"><h2 id="reset-ui-title">Ripristinare le preferenze dell’interfaccia?</h2><p>Tema, densità, dimensioni e altre preferenze visive torneranno ai valori predefiniti.</p><p>I prodotti e i dati Base.com non verranno modificati.</p><div className="settings-preview-actions"><button type="button" className="btn btn-secondary" onClick={() => resetDialog.current?.close()}>Annulla</button><button type="button" className="btn btn-primary" onClick={restoreVisualPreferences}>Ripristina</button></div></dialog>
    </div>}
    {['technical', 'catalog', 'base'].includes(tab) && <form className="settings-sections" onSubmit={save}>
      <section className="card settings-section"><div className="settings-section-heading"><div><h2>{tabs.find(([id]) => id === tab)?.[1]}</h2><p>{tab === 'technical' ? 'Configurazione del caricamento Vudoo.' : tab === 'catalog' ? 'Preparazione e limiti dell’importazione.' : 'Parametri operativi Base.com; la verifica della connessione resta in Diagnostica.'}</p></div>{tab === 'base' && <button className="btn btn-secondary btn-sm" type="button" onClick={onDiagnostics}>Apri Diagnostica</button>}</div>
        {tab === 'catalog' && <ToggleSetting id="setting-testMode" title="Limite di prova" description="Elabora un solo prodotto; non modifica la modalità Simulazione/Reale." checked={draft.testMode} onChange={value => update('testMode', value)} disabled={busy} />}
        {tab === 'base' && <><ToggleSetting id="setting-dryRun" title="Modalità simulazione" description="Quando attiva, nessuna importazione modifica Base.com." checked={draft.dryRun} onChange={value => update('dryRun', value)} disabled={busy} />
          <p className={`alert ${draft.dryRun ? 'alert-warning' : 'alert-danger'}`}>{draft.dryRun ? 'Simulazione: nessuna modifica inviata a Base.com.' : 'Modalità reale: le operazioni di import possono modificare Base.com.'}</p>
          {snapshot.activeSettings.dryRun !== draft.dryRun && <small>Modalità attiva: {snapshot.activeSettings.dryRun ? 'Simulazione' : 'Reale'}; il valore selezionato sarà applicato dopo il salvataggio.</small>}</>}
        {fields.filter(field => field.section === tab).map(field => <NumericSetting key={field.key} field={field} value={draft[field.key]} onChange={update} disabled={busy} />)}
      </section>
      {tab === 'catalog' && <CategoryMappingsSettings onProductsChanged={onCategoryMappingsChanged} />}
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
