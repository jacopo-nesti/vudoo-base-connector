import { useEffect, useRef, useState } from 'react';
import BaseCategoryBrowser from './BaseCategoryBrowser.jsx';

export default function BaseCategorySelector({ currentCategory, onSelect, onClose }) {
  const ref = useRef(null);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true); setError('');
    try {
      const response = await window.electronAPI.ensureBaseCategories();
      if (!response?.ok) throw new Error(response?.error || 'Categorie Base.com non disponibili.');
      setCategories(response.categories ?? []);
      setChosen(null);
    } catch (failure) { setError(failure.message || 'Categorie Base.com non disponibili.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { ref.current?.showModal(); void refresh(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="base-category-dialog" aria-labelledby="base-category-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="base-category-dialog-content"><header><h2 id="base-category-title">Categoria Base.com</h2><p>Scegli una categoria dell’albero reale Base.com.</p></header>
      {loading ? <p role="status">Caricamento categorie Base.com…</p> : error ? <p className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Riprova</button></p>
        : categories.length === 0 ? <p className="alert alert-warning">Categorie Base.com non ancora caricate. <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Aggiorna categorie</button></p>
          : <BaseCategoryBrowser categories={categories} selectedId={chosen?.categoryId} onSelect={setChosen}
              query={query} onQueryChange={setQuery} />}
      <p className="base-category-breadcrumb">{chosen ? <>Selezionata: <strong>{chosen.path.join(' › ')}</strong> · ID {chosen.categoryId}</> : currentCategory?.path?.length ? <>Attuale: <strong>{currentCategory.path.join(' › ')}</strong></> : 'Nessuna categoria selezionata.'}</p>
      <footer><button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button><button type="button" className="btn btn-primary" disabled={!chosen || loading} onClick={() => onSelect({ categoryId: chosen.categoryId, path: chosen.path })}>Usa categoria</button></footer>
    </div>
  </dialog>;
}
