import { useEffect, useMemo, useRef, useState } from 'react';
import BaseCategoryBrowser from '../components/BaseCategoryBrowser.jsx';

function DeleteCategoryDialog({ category, impact, onClose, onConfirm, busy }) {
  const ref = useRef(null);
  const [typed, setTyped] = useState('');
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="base-category-dialog" aria-labelledby="delete-category-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="base-category-dialog-content"><h2 id="delete-category-title">Elimina categoria “{category.name}”?</h2>
      <p className="alert alert-danger">Base.com elimina anche i prodotti contenuti direttamente nella categoria. Le sottocategorie vengono spostate al livello principale.</p>
      {impact ? <p className="alert alert-danger" role="alert">{impact.atLeast > 0
        ? `La lettura Base.com ha trovato ${impact.truncated ? 'almeno ' : ''}${impact.atLeast} prodotti in questa categoria nei cataloghi accessibili.`
        : 'La lettura Base.com non ha trovato prodotti in questa categoria nei cataloghi accessibili.'}</p>
        : <p className="alert alert-warning">Impossibile verificare il numero di prodotti presenti: considera la categoria potenzialmente occupata.</p>}
      <dl><div><dt>Nome</dt><dd>{category.name}</dd></div><div><dt>ID Base.com</dt><dd>{category.categoryId}</dd></div>
        <div><dt>Path</dt><dd>{category.path.join(' › ')}</dd></div></dl>
      <label className="form-field"><span>Scrivi esattamente ELIMINA per confermare</span><input className="input" autoFocus
        value={typed} onChange={event => setTyped(event.target.value)} /></label>
      <footer><button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Annulla</button>
        <button type="button" className="btn btn-danger" disabled={busy || typed !== 'ELIMINA'}
          onClick={() => onConfirm(typed)}>{busy ? 'Eliminazione…' : 'Elimina categoria'}</button></footer>
    </div>
  </dialog>;
}

function CreateCategoryDialog({ parent, name, onNameChange, onClose, onConfirm, busy }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="base-category-dialog" aria-labelledby="create-category-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="base-category-dialog-content"><h2 id="create-category-title">
      {parent ? 'Nuova sottocategoria' : 'Nuova categoria'}</h2>
      <p>Posizione: <strong>{parent ? parent.path.join(' › ') : 'Livello principale'}</strong></p>
      <label className="form-field"><span>Nome</span><input autoFocus className="input" maxLength={200}
        value={name} onChange={event => onNameChange(event.target.value)} /></label>
      <footer><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Annulla</button>
        <button type="button" className="btn btn-primary" disabled={busy || !name.trim()}
          onClick={onConfirm}>{busy ? 'Salvataggio…' : parent ? 'Crea sottocategoria' : 'Crea categoria'}</button></footer>
    </div>
  </dialog>;
}

function MoveCategoryDialog({ proposal, busy, onClose, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); return () => ref.current?.close(); }, []);
  return <dialog ref={ref} className="base-category-dialog" aria-labelledby="move-category-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="base-category-dialog-content"><h2 id="move-category-title">Sposta categoria?</h2>
      <p><strong>{proposal.name}</strong></p>
      <dl><div><dt>Da</dt><dd>{proposal.fromPath.join(' › ')}</dd></div>
        <div><dt>Nuovo parent</dt><dd>{proposal.toPath.length ? proposal.toPath.join(' › ') : 'Livello principale'}</dd></div></dl>
      <footer><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Annulla</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={onConfirm}>
          {busy ? 'Spostamento…' : 'Sposta categoria'}</button></footer>
    </div>
  </dialog>;
}

export default function BaseCategoriesPage({ dryRunMode, onProductsChanged }) {
  const [categories, setCategories] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [parentQuery, setParentQuery] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState(0);
  const [formMode, setFormMode] = useState(null);
  const [moveProposal, setMoveProposal] = useState(null);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshedAt, setRefreshedAt] = useState(null);
  const creating = formMode === 'create';
  const selected = useMemo(() => categories.find(row => row.categoryId === selectedId) ?? null,
    [categories, selectedId]);
  const parent = useMemo(() => categories.find(row => row.categoryId === parentId) ?? null,
    [categories, parentId]);
  const disabledParents = useMemo(() => {
    if (creating || !selected) return new Set();
    const byId = new Map(categories.map(row => [row.categoryId, row]));
    return new Set(categories.filter(row => {
      let current = row;
      while (current) {
        if (current.categoryId === selected.categoryId) return true;
        current = byId.get(current.parentId);
      }
      return false;
    }).map(row => row.categoryId));
  }, [categories, selected, creating]);
  async function refresh() {
    setLoading(true); setError('');
    try {
      const response = await window.electronAPI.getBaseCategories();
      if (!response?.ok) throw new Error(response?.error || 'Impossibile leggere le categorie Base.com.');
      setCategories(response.categories); setRefreshedAt(new Date());
      if (selectedId != null && !creating) {
        const current = response.categories.find(row => row.categoryId === selectedId);
        if (current) { setName(current.name); setParentId(current.parentId); }
        else setSelectedId(null);
      }
      onProductsChanged?.(response.products, response.quality, response);
    } catch (failure) { setError(failure.message || 'Impossibile leggere le categorie Base.com.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  function choose(category) {
    setFormMode(null); setSelectedId(category.categoryId); setName(category.name);
    setParentId(category.parentId); setParentQuery(''); setError(''); setMessage('');
  }
  function startCreate(newParentId = 0) {
    setFormMode('create'); setName(''); setParentId(newParentId);
    setParentQuery(''); setError(''); setMessage('');
  }
  function startEdit(mode) {
    if (!selected) return;
    setFormMode(mode); setName(selected.name); setParentId(selected.parentId);
    setParentQuery(''); setError(''); setMessage('');
  }
  async function prepareDelete() {
    const category = selected;
    if (!category) return;
    setBusy(true); setError(''); setDeleteImpact(null);
    try {
      const response = await window.electronAPI.getBaseCategoryDeleteImpact(category.categoryId);
      if (response?.ok) setDeleteImpact(response.impact);
    } catch { /* The confirmation still displays the conservative warning. */ }
    finally { setBusy(false); setDeletingCategory(category); }
  }
  async function mutate(operation, input) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await window.electronAPI.mutateBaseCategory(operation, input);
      if (!response?.ok) throw new Error(response?.error || 'Operazione categoria non riuscita.');
      setCategories(response.categories); setRefreshedAt(new Date());
      onProductsChanged?.(response.products, response.quality, response);
      if (!response.simulated) {
        if (operation === 'delete') { setSelectedId(null); setDeletingCategory(null); }
        else { setSelectedId(response.categoryId); setFormMode(null); }
      } else if (operation === 'delete') setDeletingCategory(null);
      else setFormMode(null);
      setMessage(response.simulated ? 'Operazione simulata — nessuna modifica inviata a Base.com.'
        : operation === 'delete' ? 'Categoria eliminata su Base.com. Albero aggiornato.'
          : 'Categoria salvata su Base.com. Albero aggiornato.');
      return true;
    } catch (failure) { setError(failure.message || 'Operazione non riuscita. Aggiorna e riprova.'); return false; }
    finally { setBusy(false); }
  }
  async function confirmMove() {
    if (!moveProposal) return;
    const category = categories.find(row => row.categoryId === moveProposal.categoryId);
    if (!category) { setMoveProposal(null); setError('Categoria non più disponibile. Aggiorna l’albero.'); return; }
    const succeeded = await mutate('update', { categoryId: category.categoryId,
      name: category.name, parentId: moveProposal.parentId,
      expectedParentId: moveProposal.currentParentId, expectedName: moveProposal.name });
    if (succeeded) setMoveProposal(null);
  }
  return <section className="base-categories-page">
    <header className="page-header"><div><h1>Categorie Base.com</h1>
      <p>Gestisci la struttura reale utilizzata dai prodotti Base.com.</p></div>
      <div className="selection-actions"><button type="button" className="btn btn-secondary" disabled={loading || busy} onClick={refresh}>Aggiorna</button>
        <button type="button" className="btn btn-primary" disabled={loading || busy} onClick={() => startCreate(0)}>+ Nuova categoria</button></div></header>
    {refreshedAt && <p className="muted">Ultimo aggiornamento: {refreshedAt.toLocaleTimeString('it-IT')}</p>}
    {dryRunMode === true && <p className="alert alert-info">Simulazione attiva: le modifiche preparate non verranno inviate a Base.com.</p>}
    {dryRunMode !== true && dryRunMode !== false && <p className="alert alert-warning">Modalità operativa non verificata: modifiche bloccate.</p>}
    {error && <p className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-secondary btn-sm" onClick={refresh}>Riprova</button></p>}
    {message && <p className="alert alert-success" role="status">{message}</p>}
    <div className="base-categories-layout"><div className="card base-categories-tree"><h2>Albero categorie</h2>
      {loading ? <p role="status">Caricamento categorie Base.com…</p> : categories.length
        ? <BaseCategoryBrowser categories={categories} selectedId={selectedId} onSelect={choose}
            query={query} onQueryChange={setQuery} onMove={busy ? undefined : setMoveProposal} /> : <p>Nessuna categoria disponibile.</p>}</div>
      <div className="card base-categories-detail">{selected ? <><h2>{selected.name}</h2>
        <dl><div><dt>ID Base.com</dt><dd>{selected.categoryId}</dd></div>
          <div><dt>Path</dt><dd>{selected.path.join(' › ')}</dd></div></dl>
        {!formMode && <div className="selection-actions"><button type="button" className="btn btn-secondary" disabled={busy}
          onClick={() => startCreate(selected.categoryId)}>Aggiungi sottocategoria</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => startEdit('rename')}>Rinomina</button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => startEdit('move')}>Sposta</button>
          <button type="button" className="btn btn-danger-quiet" disabled={busy || dryRunMode == null}
            onClick={prepareDelete}>Elimina categoria</button></div>}
        {formMode === 'rename' && <><label className="form-field"><span>Nuovo nome</span><input className="input"
          maxLength={200} value={name} onChange={event => setName(event.target.value)} /></label>
          <div className="selection-actions"><button type="button" className="btn btn-secondary" disabled={busy}
            onClick={() => setFormMode(null)}>Annulla</button><button type="button" className="btn btn-primary"
            disabled={busy || !name.trim() || name.trim() === selected.name || dryRunMode == null}
            onClick={() => mutate('update', { categoryId: selectedId, name, parentId: selected.parentId })}>Salva nome</button></div></>}
        {formMode === 'move' && <><p>Nuovo parent: <strong>{parent ? parent.path.join(' › ') : 'Livello principale'}</strong></p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParentId(0)} disabled={busy}>Livello principale</button>
          <BaseCategoryBrowser categories={categories} selectedId={parentId} onSelect={row => setParentId(row.categoryId)}
            disabledIds={disabledParents} query={parentQuery} onQueryChange={setParentQuery} label="Cerca nuovo parent" />
          <div className="selection-actions"><button type="button" className="btn btn-secondary" disabled={busy}
            onClick={() => setFormMode(null)}>Annulla</button><button type="button" className="btn btn-primary"
            disabled={busy || parentId === selected.parentId || dryRunMode == null}
            onClick={() => mutate('update', { categoryId: selectedId, name: selected.name, parentId,
              expectedParentId: selected.parentId, expectedName: selected.name })}>Sposta categoria</button></div></>}
        </>
        : <p className="muted">Seleziona una categoria nell’albero oppure creane una nuova.</p>}</div></div>
    {creating && <CreateCategoryDialog parent={parent} name={name} onNameChange={setName} busy={busy}
      onClose={() => setFormMode(null)} onConfirm={() => mutate('create', { name, parentId })} />}
    {moveProposal && <MoveCategoryDialog proposal={moveProposal} busy={busy}
      onClose={() => setMoveProposal(null)} onConfirm={confirmMove} />}
    {deletingCategory && <DeleteCategoryDialog category={deletingCategory} impact={deleteImpact} busy={busy}
      onClose={() => setDeletingCategory(null)} onConfirm={confirmation => mutate('delete', {
        categoryId: deletingCategory.categoryId, confirmation, expectedName: deletingCategory.name,
        expectedParentId: deletingCategory.parentId })} />}
  </section>;
}
