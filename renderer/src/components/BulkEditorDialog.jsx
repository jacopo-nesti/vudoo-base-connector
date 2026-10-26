import { useEffect, useRef, useState } from 'react';
import { BULK_BASE_FIELDS, validateBulkBaseInput } from '../../../src/productSchema.js';
import { applyInventoryTagOperation, normalizeInventoryTagNames } from '../../../src/inventoryTags.js';
import BaseCategorySelector from './BaseCategorySelector.jsx';

const units = { price: 'EUR', tax_rate: '%', weight: 'kg', height: 'cm', width: 'cm', length: 'cm' };
const tagField = { key: 'tags', label: 'Product Tags Base.com' };
const bulkFields = [...BULK_BASE_FIELDS, tagField, { key: 'category', label: 'Categoria Base.com' }];

export default function BulkEditorDialog({ selectedIds, selectedProducts, onApply, onClose, onDone }) {
  const dialogRef = useRef(null);
  const fieldRef = useRef(null);
  const [field, setField] = useState('');
  const [value, setValue] = useState('');
  const [preview, setPreview] = useState(false);
  const [tagOperation, setTagOperation] = useState('add');
  const [tagSummary, setTagSummary] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState(null);
  const [categorySelectorOpen, setCategorySelectorOpen] = useState(false);
  const selectedField = bulkFields.find(item => item.key === field);
  const excluded = selectedIds.length - selectedProducts.length;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    fieldRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  function showPreview() {
    setError('');
    if (!selectedProducts.length || excluded) {
      setError('Seleziona almeno un prodotto valido nel catalogo attivo.');
      return;
    }
    try {
      if (field === 'category') {
        if (!category?.categoryId) throw new Error('Scegli una categoria Base.com esistente.');
        setTagSummary(null);
      } else if (field === 'tags') {
        const requested = normalizeInventoryTagNames(value.split(/\r?\n|,/));
        if (tagOperation !== 'replace' && requested.length === 0) {
          throw new Error('Indica almeno un Product Tag per aggiungere o rimuovere.');
        }
        const results = selectedProducts.map(product => {
          const before = product.tags;
          const after = applyInventoryTagOperation(before, requested, tagOperation);
          return { id: product.id, title: product.title, before, after,
            changed: JSON.stringify(before) !== JSON.stringify(after) };
        });
        setTagSummary({ requested, changedCount: results.filter(item => item.changed).length,
          examples: results.slice(0, 3) });
      } else { validateBulkBaseInput(field, value); setTagSummary(null); }
      setPreview(true);
    }
    catch (failure) { setError(failure.message); }
  }

  async function apply() {
    if (!preview || !selectedProducts.length || excluded || busy) return;
    let normalized;
    try { normalized = field === 'category' ? category.categoryId : field === 'tags' ? tagSummary?.requested : validateBulkBaseInput(field, value); }
    catch (failure) { setError(failure.message); setPreview(false); return; }
    if (field === 'tags' && (!normalized || !tagSummary)) {
      setError('Anteprima Product Tags non disponibile. Ricalcola l’anteprima.');
      setPreview(false);
      return;
    }
    if (field === 'tags' && tagOperation === 'replace' && normalized.length === 0 &&
        !window.confirm('Stai per rimuovere tutti i Product Tags dai prodotti selezionati. Confermi?')) return;
    setBusy(true); setError('');
    try {
      const count = await onApply({ ids: selectedProducts.map(product => product.id), scope: 'base',
        field, value: normalized, ...(field === 'category' ? { categoryId: category.categoryId } : {}),
        ...(field === 'tags' ? { operation: tagOperation,
          confirmedEmptyReplace: tagOperation === 'replace' && normalized.length === 0 } : {}),
        expectedRevisions: Object.fromEntries(selectedProducts.map(product => [product.id, product.overrideRevision])) });
      onDone(`${count} prodotti aggiornati con override Base.com. Il catalogo Vudoo originale resta invariato.`);
    } catch (failure) { setError(failure?.message || 'Modifica massiva non riuscita. Riprova.'); }
    finally { setBusy(false); }
  }

  const conflicts = preview && field !== 'tags' && field !== 'category' ? selectedProducts.filter(product => Object.hasOwn(product.baseOverrides ?? {}, field) &&
    product.baseOverrides[field] !== validateBulkBaseInput(field, value)).length : 0;
  const displayValue = preview ? field === 'category' ? category.path.join(' › ') : field === 'tags' ? tagSummary.requested.join(', ') || 'Lista vuota'
    : `${validateBulkBaseInput(field, value)}${units[field] ? ` ${units[field]}` : ''}` : '';

  return <dialog ref={dialogRef} className="bulk-editor-dialog" aria-labelledby="bulk-editor-title"
    aria-describedby="bulk-editor-description" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="bulk-editor-header"><div><span className="product-dialog-eyebrow">Override Base.com</span>
      <h2 id="bulk-editor-title">Modifica massiva</h2>
      <p id="bulk-editor-description">{selectedProducts.length} prodotti selezionati · Il feed Vudoo resta in sola lettura.</p></div>
      <button type="button" className="product-dialog-close" aria-label="Chiudi modifica massiva" disabled={busy} onClick={onClose}>×</button>
    </header>
    <div className="bulk-editor-body">
      {!selectedProducts.length ? <p className="alert alert-warning">Seleziona almeno un prodotto per utilizzare la modifica massiva.</p> : <>
        <label className="form-field"><span>Campo</span><select ref={fieldRef} className="select" value={field}
          onChange={event => { setField(event.target.value); setValue(''); setCategory(null); setPreview(false); setTagSummary(null); setError(''); }}>
          <option value="">Scegli un campo Base.com</option>
          {bulkFields.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        {field === 'tags' && <label className="form-field"><span>Operazione</span><select className="select" value={tagOperation}
          onChange={event => { setTagOperation(event.target.value); setPreview(false); setTagSummary(null); setError(''); }}>
          <option value="add">Aggiungi</option><option value="remove">Rimuovi</option><option value="replace">Sostituisci tutti</option>
        </select></label>}
        {field === 'category' && <div className="form-field"><span>Categoria Base.com</span><strong>{category?.path?.join(' › ') || 'Non selezionata'}</strong><button type="button" className="btn btn-secondary" onClick={() => setCategorySelectorOpen(true)}>Scegli categoria</button></div>}
        {selectedField && field !== 'category' && <label className="form-field"><span>Valore comune{units[field] ? ` (${units[field]})` : ''}</span>
          <input className="input" type="text" inputMode={field === 'tags' ? 'text' : field === 'quantity' ? 'numeric' : 'decimal'} value={value}
            onChange={event => { setValue(event.target.value); setPreview(false); setTagSummary(null); setError(''); }}
            placeholder={field === 'tags' ? 'Es. Unisex, Incenso, Oud' : field === 'quantity' ? 'Es. 10' : field === 'price' ? 'Es. 220,00' : 'Inserisci valore numerico'} />
        </label>}
        {field === 'tags' && <small className="muted">Separa i tag con una virgola. Massimo 25 caratteri per tag. Il salvataggio è solo locale.</small>}
        {field === 'tax_rate' && <small className="muted">Aliquota numerica da 0 a 100; sono accettati anche i codici speciali già previsti dal modello Base.</small>}
        {preview && <div className="bulk-editor-preview" role="region" aria-label="Anteprima modifica massiva">
          <h3>Anteprima modifiche</h3>
          <dl><div><dt>Prodotti interessati</dt><dd>{selectedProducts.length}</dd></div>
            <div><dt>Campo</dt><dd>{selectedField.label}</dd></div>
            {field === 'tags' && <div><dt>Operazione</dt><dd>{tagOperation === 'add' ? 'Aggiungi' : tagOperation === 'remove' ? 'Rimuovi' : 'Sostituisci tutti'}</dd></div>}
            <div><dt>Nuovo valore</dt><dd>{displayValue}</dd></div>
            {field === 'tags' && <div><dt>Prodotti che cambieranno</dt><dd>{tagSummary.changedCount}</dd></div>}
            <div><dt>Prodotti esclusi</dt><dd>{excluded}</dd></div>
            <div><dt>Errori di validazione locale</dt><dd>0</dd></div>
            {field !== 'tags' && field !== 'category' && <div><dt>Override Base già presenti che cambieranno</dt><dd>{conflicts}</dd></div>}</dl>
          {field === 'tags' && <><ul className="sku-list">{tagSummary.examples.map(item => <li key={item.id}><strong>{item.title || item.id}</strong>: {item.before?.join(', ') || 'nessun tag'} → {item.after?.join(', ') || 'nessun tag'}{!item.changed && ' (invariato)'}</li>)}</ul>
            {tagOperation === 'replace' && tagSummary.requested.length === 0 && <p className="alert alert-warning">Stai per rimuovere tutti i Product Tags dai prodotti selezionati. Verrà richiesta una conferma esplicita.</p>}</>}
          <p className="muted">Questa è la conferma finale. La modifica riguarda solo gli override locali dei prodotti selezionati.</p>
        </div>}
      </>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
    </div>
    <footer className="bulk-editor-footer"><button className="btn btn-secondary" type="button" disabled={busy} onClick={onClose}>Annulla</button>
      {preview ? <button className="btn btn-primary" type="button" disabled={busy || !selectedProducts.length || excluded > 0} onClick={apply}>{busy ? 'Applicazione…' : `Applica a ${selectedProducts.length} prodotti`}</button>
        : <button className="btn btn-primary" type="button" disabled={busy || !field || !selectedProducts.length} onClick={showPreview}>Anteprima modifiche</button>}
    </footer>
    {categorySelectorOpen && <BaseCategorySelector currentCategory={category} onClose={() => setCategorySelectorOpen(false)} onSelect={chosen => { setCategory(chosen); setPreview(false); setCategorySelectorOpen(false); }} />}
  </dialog>;
}
