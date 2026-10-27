import { useEffect, useRef, useState } from 'react';
import { PRODUCT_FIELDS, BASE_OVERRIDE_FIELDS, validateFieldInput } from '../../../src/productSchema.js';
import { editorFieldScope, editorFieldValue } from './productFieldValues.js';
import ManualImageEditor from './ManualImageEditor.jsx';
import BaseCategorySelector from './BaseCategorySelector.jsx';

const sections = ['Identità', 'Contenuto', 'Commerciale', 'Classificazione', 'Media', 'Fisico', 'Logistica', 'Marca e dettagli', 'Base.com'];
const originLabels = { supplier: 'Originale supplier', canonical: 'Normalizzato', manual: 'Override manuale', marketplace: 'Override Base' };
const symbols = { PASS: '✓', WARNING: '⚠', BLOCKING: '✕' };
const display = value => Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value);
const fieldId = key => `field-${key.replace(/[^a-z0-9]/gi, '-')}`;

export default function ProductDetailsDialog({ product, onClose, onSave, onSaveCategory, onMediaChange,
  onCategoryTreeLoaded, canonicalOptions = [], initialSection = 'Identità' }) {
  const dialogRef = useRef(null);
  const [section, setSection] = useState('Identità');
  const [draft, setDraft] = useState({});
  const [resets, setResets] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false);
  const [saveAsMapping, setSaveAsMapping] = useState(false);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryLoadError, setCategoryLoadError] = useState('');
  const dirty = Object.keys(draft).length > 0 || resets.length > 0;
  const fields = section === 'Base.com' ? BASE_OVERRIDE_FIELDS : PRODUCT_FIELDS.filter(field =>
    field.section === section && field.key !== 'canonical_category');

  useEffect(() => {
    if (!product) return undefined;
    setSection(initialSection);
    setDraft({}); setResets([]); setError(''); setSuccess(''); setFieldErrors({}); setPreview(null);
    if (!dialogRef.current.open) dialogRef.current.showModal();
    return () => { if (dialogRef.current?.open) dialogRef.current.close(); };
  }, [product?.id, initialSection]);
  useEffect(() => {
    if (!product || !dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [product, dirty]);
  useEffect(() => {
    if (!product || section !== 'Classificazione') return undefined;
    let active = true;
    setCategoryLoading(true); setCategoryLoadError('');
    window.electronAPI.ensureBaseCategories().then(response => {
      if (!active) return;
      if (!response?.ok) throw new Error(response?.error || 'Categorie Base.com non disponibili.');
      onCategoryTreeLoaded?.(response);
    }).catch(error => { if (active) setCategoryLoadError(error?.message || 'Categorie Base.com non disponibili.'); })
      .finally(() => { if (active) setCategoryLoading(false); });
    return () => { active = false; };
  }, [product?.id, section]);
  if (!product) return null;

  function valueFor(field) {
    return editorFieldValue(product, section, field.key, draft, resets);
  }
  function edit(field, value) {
    setDraft(previous => ({ ...previous, [field.key]: value }));
    setResets(previous => previous.filter(key => key !== field.key));
    setFieldErrors(previous => ({ ...previous, [field.key]: null })); setSuccess('');
  }
  function reset(field) {
    setDraft(previous => { const next = { ...previous }; delete next[field.key]; return next; });
    setResets(previous => [...new Set([...previous, field.key])]); setSuccess('');
  }
  function close() {
    if (saving) return;
    if (dirty && !window.confirm('Le modifiche non salvate andranno perse. Vuoi chiudere?')) return;
    dialogRef.current?.close();
  }
  function navigate(name) {
    if (dirty && !window.confirm('Hai modifiche non salvate. Cambiare sezione le scarterà. Continuare?')) return;
    setSection(name); setDraft({}); setResets([]); setError(''); setFieldErrors({});
  }
  function goToField(key) {
    const field = PRODUCT_FIELDS.find(item => item.key === key && item.editable);
    if (!field) return;
    navigate(field.section);
    requestAnimationFrame(() => document.getElementById(fieldId(key))?.focus());
  }
  async function save(event) {
    event.preventDefault();
    if (!dirty) return;
    const errors = {}, batches = { base: { changes: {}, reset: [] }, manual: { changes: {}, reset: [] } };
    for (const [key, value] of Object.entries(draft)) {
      const fieldScope = editorFieldScope(section, key);
      try { batches[fieldScope].changes[key] = validateFieldInput(key, value, fieldScope); }
      catch (failure) { errors[key] = failure.message; }
    }
    for (const key of resets) batches[editorFieldScope(section, key)].reset.push(key);
    setFieldErrors(errors);
    if (Object.keys(errors).length) { setError('Correggi i campi evidenziati.'); return; }
    if (Object.hasOwn(batches.base.changes, 'tags') &&
        !window.confirm('I tag Base sostituiranno l’elenco remoto al prossimo import. Confermi?')) return;
    setSaving(true); setError(''); setSuccess('');
    try {
      let current = product;
      for (const fieldScope of ['base', 'manual']) {
        const batch = batches[fieldScope];
        if (!Object.keys(batch.changes).length && !batch.reset.length) continue;
        current = await onSave({ id: product.id, scope: fieldScope, ...batch,
          expectedRevision: current.overrideRevision });
        const savedKeys = new Set([...Object.keys(batch.changes), ...batch.reset]);
        setDraft(previous => Object.fromEntries(Object.entries(previous).filter(([key]) => !savedKeys.has(key))));
        setResets(previous => previous.filter(key => !savedKeys.has(key)));
      }
      setSuccess('Modifiche salvate. Preflight aggiornato.');
    } catch (failure) { setError(failure?.message || 'Salvataggio non riuscito.'); }
    finally { setSaving(false); }
  }
  async function showPreview() {
    setError('');
    try {
      const response = await window.electronAPI.basePayloadPreview(product.id);
      if (!response?.ok) throw new Error(response?.error || 'Anteprima Base non disponibile.');
      setPreview(response.preview);
    } catch (failure) { setError(failure.message); }
  }
  async function saveCategory(category) {
    setSaving(true); setError(''); setSuccess('');
    try {
      const result = await onSaveCategory({ ids: [product.id], categoryId: category?.categoryId ?? null,
        saveAsMapping: Boolean(category && saveAsMapping),
        expectedRevisions: { [product.id]: product.overrideRevision } });
      setCategorySelectorOpen(false); setSaveAsMapping(false);
      setSuccess(result.warning || 'Categoria Base.com salvata localmente. Preflight aggiornato.');
    } catch (failure) { setError(failure?.message || 'Categoria non salvata. Riprova.'); }
    finally { setSaving(false); }
  }

  return <dialog ref={dialogRef} className="product-dialog product-dialog-wide" aria-labelledby="product-dialog-title"
    onClose={onClose} onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <form className="product-dialog-content" onSubmit={save}>
      <header className="product-dialog-header"><div><span className="product-dialog-eyebrow">Scheda prodotto · {product.supplier || 'supplier'}</span>
        <h2 id="product-dialog-title">{product.title || product.id || 'Senza titolo'}</h2>
        <p className="muted">Supplier → Vudoo → override manuali → Base.com. Il feed originale resta conservato.</p></div>
        <button className="product-dialog-close" type="button" aria-label="Chiudi scheda prodotto" disabled={saving} onClick={close}>×</button></header>
      <nav className="product-dialog-tabs" aria-label="Sezioni prodotto">{sections.map(name =>
        <button key={name} type="button" className={`btn btn-sm ${section === name ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => navigate(name)}>{name}</button>)}</nav>
      <div className="product-dialog-body">
        {section === 'Base.com' && <div className="alert alert-info">Questi override valgono solo per Base.com. L'invio richiede il preflight remoto Base.</div>}
        <div className="product-editor-grid">{fields.map(field => {
          const layer = product.provenance?.[field.key];
          const fieldScope = editorFieldScope(section, field.key);
          const overridden = fieldScope === 'base' ? Object.hasOwn(product.baseOverrides ?? {}, field.key)
            : Object.hasOwn(product.manualOverrides ?? {}, field.key);
          return <div className="product-editor-field" key={field.key}>
            <label className="form-field" htmlFor={fieldId(field.key)}><span>{field.label} <small className="source-badge">{fieldScope === 'base' && overridden ? 'Override Base'
              : originLabels[layer?.origin] || 'Supplier'}</small></span>
              {field.key === 'canonical_category' ? <select id={fieldId(field.key)} className="select" value={display(valueFor(field))}
                onChange={event => edit(field, event.target.value)}><option value="">Seleziona categoria</option>
                {canonicalOptions.map(id => <option key={id} value={id}>{id}</option>)}</select>
                : ['longtext', 'image-list', 'tags'].includes(field.type)
                ? <textarea id={fieldId(field.key)} className="input" rows={field.type === 'longtext' ? 4 : 2}
                  value={display(valueFor(field))} onChange={event => edit(field, event.target.value)} disabled={!field.editable && fieldScope !== 'base'} />
                : <input id={fieldId(field.key)} className="input" type={field.type === 'url' ? 'url' : 'text'}
                  value={display(valueFor(field))} onChange={event => edit(field, event.target.value)} disabled={!field.editable && fieldScope !== 'base'} />}</label>
            {fieldErrors[field.key] && <small className="danger-text">{fieldErrors[field.key]}</small>}
            {layer && <details className="field-provenance"><summary>Origine e valori</summary><dl>
              <div><dt>Supplier</dt><dd>{display(layer.source) || 'vuoto'}</dd></div>
              <div><dt>Vudoo</dt><dd>{display(layer.canonical) || 'vuoto'}</dd></div>
              <div><dt>Manuale</dt><dd>{layer.manual === undefined ? 'nessun override' : display(layer.manual) || 'vuoto esplicito'}</dd></div>
              <div><dt>Base</dt><dd>{layer.marketplace === undefined ? 'nessun override' : display(layer.marketplace) || 'vuoto esplicito'}</dd></div>
            </dl></details>}
            {overridden && <button className="btn btn-quiet btn-sm" type="button" onClick={() => reset(field)}>Ripristina override</button>}
            {field.base && <small className="muted">Base: {field.base}</small>}
          </div>;
        })}</div>
        {section === 'Media' && <ManualImageEditor key={product.id} product={product} onProductChange={onMediaChange} />}
        {section === 'Classificazione' && <section className="base-category-detail"><h3>Categoria Base.com</h3>
          {categoryLoading && <p role="status">Caricamento categorie Base.com…</p>}
          {categoryLoadError && <p className="alert alert-warning" role="alert">{categoryLoadError}
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setCategorySelectorOpen(true)}>Riprova</button></p>}
          <dl><div><dt>Categoria Vudoo originale</dt><dd>{product.sourceCategory || 'Non disponibile'}</dd></div>
            <div><dt>Categoria Base.com effettiva</dt><dd>{product.baseCategory?.path?.join(' › ') || 'Non assegnata'}</dd></div>
            <div><dt>ID Base.com</dt><dd>{product.baseCategory?.categoryId ??
              (product.baseCategory?.invalidCategoryId ? `${product.baseCategory.invalidCategoryId} · non disponibile` : 'Non assegnata')}</dd></div>
            <div><dt>Origine</dt><dd>{{ product_override: 'Override prodotto', runtime_mapping: 'Mapping utente',
              deleted_category: 'Categoria Base.com eliminata', unverified_category: 'Categoria da verificare',
              unresolved: 'Non assegnata' }[product.baseCategory?.origin] || 'Non assegnata'}</dd></div></dl>
          {!product.baseCategory?.path?.length && <p className="alert alert-warning">{product.baseCategory?.origin === 'unverified_category'
            ? 'Categoria Base.com non verificata: aggiorna le categorie e riprova.'
            : product.baseCategory?.origin === 'deleted_category'
            ? product.baseCategory?.invalidOrigin === 'runtime_mapping'
              ? 'Categoria del mapping non esiste più su Base.com: scegli un override o correggi il mapping in Impostazioni.'
              : 'Categoria selezionata non esiste più su Base.com: scegli una nuova categoria o ripristina.'
            : 'Categoria Base.com non assegnata: il prodotto resta importabile senza category_id.'}</p>}
          <label className="base-category-mapping-choice"><input type="checkbox" checked={saveAsMapping} disabled={!product.sourceCategory?.trim() || saving} onChange={event => setSaveAsMapping(event.target.checked)} /> Usa questa categoria anche per prodotti futuri con questa categoria Vudoo</label>
          <div className="selection-actions"><button className="btn btn-secondary" type="button" disabled={saving || dirty} onClick={() => setCategorySelectorOpen(true)}>Cambia categoria Base.com</button>
            {(product.baseCategory?.origin === 'product_override' || product.baseCategory?.origin === 'deleted_category' &&
              product.baseCategory?.invalidOrigin === 'product_override') && <button className="btn btn-quiet" type="button" disabled={saving || dirty} onClick={() => saveCategory(null)}>Ripristina categoria automatica</button>}</div>
          <small className="muted">La selezione salva solo dati locali. Nessuna modifica viene inviata subito a Base.com.</small>
        </section>}
        {section === 'Base.com' && <section className="base-preview-panel"><h3>Perché non posso inviarlo?</h3>
          <p><strong>{product.basePreflight?.status || 'Non verificato'}</strong> · {product.basePreflight?.counts?.BLOCKING ?? 0} blocchi · {product.basePreflight?.counts?.WARNING ?? 0} avvisi</p>
          <ul className="check-list">{product.basePreflight?.checks?.map(check => <li key={check.code} className={`check-${check.status.toLowerCase()}`}>
            <strong>{symbols[check.status]} {check.message}</strong>{check.suggestedAction && <span>{check.suggestedAction}</span>}
            {check.code === 'category' && check.status === 'WARNING'
              ? <button type="button" className="btn btn-quiet btn-sm" disabled={dirty} onClick={() => { setSection('Classificazione'); setCategorySelectorOpen(true); }}>Assegna categoria</button>
              : PRODUCT_FIELDS.some(field => field.key === check.field && field.editable) && <button type="button" className="btn btn-quiet btn-sm" onClick={() => goToField(check.field)}>Vai al campo</button>}</li>)}</ul>
          <button type="button" className="btn btn-secondary" disabled={dirty} onClick={showPreview}>Mostra payload Base e campi vuoti</button>
          {preview && <><p className="muted">{preview.note}</p>{preview.tagPlan && <div className="alert alert-info"><strong>Product Tags Base.com</strong>
            {preview.tagPlan.error ? <p>Verifica tag non riuscita: {preview.tagPlan.error}</p>
              : <><p>Esistenti: {preview.tagPlan.existing.join(', ') || 'nessuno'}.</p>
                <p>{preview.tagPlan.simulated ? 'Verrebbero creati' : 'Da creare prima dell’import'}: {preview.tagPlan.wouldCreate.join(', ') || 'nessuno'}.</p></>}</div>}
            <div className="preview-field-list">{preview.fields.map(item => <div key={item.key}><span>{item.label}</span><strong>{item.status === 'POPULATED' ? '✓ Valorizzato' : item.status === 'SUPPORTED_EMPTY' ? '○ Vuoto' : item.status === 'INVALID' ? '⚠ Non valido' : '— Non supportato'}</strong><small>{item.baseField || 'Nessun mapping Base'}</small></div>)}</div>
            <details><summary>Payload locale e ID da risolvere nel preflight remoto</summary><pre className="payload-preview">{JSON.stringify({ ...preview.payload, _unresolved: preview.unresolved }, null, 2)}</pre></details></>}
        </section>}
        {error && <p className="alert alert-danger" role="alert">{error}</p>}
        {success && <p className="alert alert-success" role="status">{success}</p>}
      </div>
      <footer className="product-dialog-footer"><span className="muted">{dirty ? 'Modifiche non salvate' : 'Nessuna modifica in sospeso'}</span>
        <button className="btn btn-secondary" type="button" disabled={saving} onClick={close}>Chiudi</button>
        <button className="btn btn-primary" type="submit" disabled={saving || !product.id || !dirty}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</button></footer>
    </form>
    {categorySelectorOpen && <BaseCategorySelector currentCategory={product.baseCategory} onClose={() => setCategorySelectorOpen(false)} onSelect={saveCategory} />}
  </dialog>;
}
