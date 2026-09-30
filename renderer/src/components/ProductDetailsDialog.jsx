import { useEffect, useRef, useState } from 'react';
import { hasDisplayValue } from '../catalogFilters.js';

const fields = [
  ['ID prodotto', 'id'],
  ['SKU Vudoo', 'sku'],
  ['MPN', 'mpn'],
  ['Brand', 'brand'],
  ['Categoria sorgente', 'category'],
  ['Prezzo', 'price'],
  ['Formato / Dimensione', 'size'],
  ['Colore', 'color'],
  ['EAN', 'ean'],
  ['Gruppo prodotti', 'itemGroupId'],
  ['Disponibilità', 'availability'],
  ['Quantità', 'quantity'],
  ['Condizione', 'condition'],
];

export default function ProductDetailsDialog({ product, onClose, onSave }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!product) return undefined;
    setTitle(product.title ?? '');
    setDescription(product.description ?? '');
    setError('');
    const dialog = dialogRef.current;
    dialog.showModal();
    titleRef.current?.focus();
    return () => dialog.close();
  }, [product]);

  if (!product) return null;

  const changed = title !== (product.title ?? '') || description !== (product.description ?? '');

  function requestClose() {
    if (saving) return;
    if (changed && !window.confirm('Le modifiche non salvate andranno perse. Vuoi chiudere?')) return;
    dialogRef.current?.close();
  }

  async function save(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Il titolo non può essere vuoto.');
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ id: product.id, title, description });
      dialogRef.current?.close();
    } catch (failure) {
      setError(failure?.message || 'Impossibile salvare le modifiche.');
    } finally {
      setSaving(false);
    }
  }

  return <dialog ref={dialogRef} className="product-dialog" aria-labelledby="product-dialog-title"
    onClose={onClose} onCancel={event => { event.preventDefault(); requestClose(); }}
    onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
    <form className="product-dialog-content" onSubmit={save}>
      <header className="product-dialog-header">
        <div><span className="product-dialog-eyebrow">Dettagli prodotto</span><h2 id="product-dialog-title">{product.title || 'Senza titolo'}</h2></div>
        <button className="product-dialog-close" type="button" aria-label="Chiudi dettagli prodotto"
          disabled={saving} onClick={requestClose}>×</button>
      </header>
      <div className="product-dialog-body">
        <label className="form-field"><span>Titolo</span><input ref={titleRef} className="input" type="text" value={title}
          onChange={event => setTitle(event.target.value)} disabled={saving || !product.id} required /></label>
        <label className="form-field product-dialog-description"><span>Descrizione completa</span>
          <textarea className="input product-description-input" value={description}
            onChange={event => setDescription(event.target.value)} disabled={saving || !product.id} /></label>
        {!product.id && <p className="muted">ID non disponibile: questo prodotto non può essere modificato.</p>}
        <dl className="product-dialog-fields">
          {fields.filter(([, key]) => hasDisplayValue(product[key])).map(([label, key]) =>
            <div key={key}><dt>{label}</dt><dd>{product[key]}</dd></div>)}
        </dl>
        {error && <p className="alert alert-danger" role="alert">{error}</p>}
      </div>
      <footer className="product-dialog-footer">
        <button className="btn btn-secondary" type="button" disabled={saving} onClick={requestClose}>Annulla</button>
        <button className="btn btn-primary" type="submit" disabled={saving || !product.id || !changed}>
          {saving ? 'Salvataggio in corso…' : 'Salva modifiche'}
        </button>
      </footer>
    </form>
  </dialog>;
}
