import { useEffect, useMemo, useRef, useState } from 'react';
import { buildBaseCategoryTree, searchBaseCategories } from '../baseCategoryTree.js';

export default function BaseCategorySelector({ currentCategory, onSelect, onClose }) {
  const ref = useRef(null);
  const [categories, setCategories] = useState([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [chosen, setChosen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const tree = useMemo(() => buildBaseCategoryTree(categories), [categories]);
  const results = useMemo(() => searchBaseCategories(categories, query), [categories, query]);
  const parentIds = useMemo(() => new Set(categories.map(category => category.parentId)), [categories]);
  async function refresh() {
    setLoading(true); setError('');
    try {
      const response = await window.electronAPI.getBaseCategories();
      if (!response?.ok) throw new Error(response?.error || 'Categorie Base.com non disponibili.');
      setCategories(response.categories ?? []);
    } catch (failure) { setError(failure.message || 'Categorie Base.com non disponibili.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { ref.current?.showModal(); void refresh(); return () => ref.current?.close(); }, []);
  function toggle(id) { setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function renderNodes(nodes, depth = 0) {
    return nodes.map(node => <div key={node.categoryId} className="base-category-node">
      <div className="base-category-line" style={{ paddingLeft: depth * 18 }}>
        {node.children.length ? <button type="button" className="btn btn-quiet btn-sm" aria-label={`${expanded.has(node.categoryId) ? 'Chiudi' : 'Apri'} ${node.name}`} aria-expanded={expanded.has(node.categoryId)} onClick={() => toggle(node.categoryId)}>{expanded.has(node.categoryId) ? '▾' : '▸'}</button> : <span className="base-category-spacer" />}
        <button type="button" className="btn btn-quiet btn-sm" disabled={node.children.length > 0} aria-pressed={chosen?.categoryId === node.categoryId} onClick={() => setChosen(node)} title={node.path.join(' > ')}>{node.name}</button>
      </div>
      {expanded.has(node.categoryId) && node.children.length > 0 && renderNodes(node.children, depth + 1)}
    </div>);
  }
  return <dialog ref={ref} className="base-category-dialog" aria-labelledby="base-category-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="base-category-dialog-content"><header><h2 id="base-category-title">Categoria Base.com</h2><p>Scegli una categoria esistente. Le categorie con sottocategorie si esplorano; seleziona una foglia.</p></header>
      <label className="form-field"><span>Cerca nome, percorso o ID</span><input className="input" autoFocus value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Cerca categoria Base.com" /></label>
      {loading ? <p role="status">Caricamento categorie Base.com…</p> : error ? <p className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Riprova</button></p>
        : categories.length === 0 ? <p className="alert alert-warning">Categorie Base.com non ancora caricate. <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Aggiorna categorie</button></p>
          : <div className="base-category-results">{query.trim() ? results.length ? results.map(category => <button type="button" key={category.categoryId} className="base-category-result" disabled={parentIds.has(category.categoryId)} aria-pressed={chosen?.categoryId === category.categoryId} onClick={() => setChosen(category)}><span>{category.path.join(' › ')}</span><small>ID {category.categoryId}{parentIds.has(category.categoryId) ? ' · contiene sottocategorie' : ''}</small></button>) : <p>Nessuna categoria corrisponde alla ricerca.</p>
            : renderNodes(tree)}</div>}
      <p className="base-category-breadcrumb">{chosen ? <>Selezionata: <strong>{chosen.path.join(' › ')}</strong> · ID {chosen.categoryId}</> : currentCategory?.path?.length ? <>Attuale: <strong>{currentCategory.path.join(' › ')}</strong></> : 'Nessuna categoria selezionata.'}</p>
      <footer><button type="button" className="btn btn-secondary" onClick={onClose}>Annulla</button><button type="button" className="btn btn-primary" disabled={!chosen || loading} onClick={() => onSelect({ categoryId: chosen.categoryId, path: chosen.path })}>Usa categoria</button></footer>
    </div>
  </dialog>;
}
