import { useEffect, useState } from 'react';
import BaseCategorySelector from './BaseCategorySelector.jsx';

export default function CategoryMappingsSettings({ onProductsChanged }) {
  const [mappings, setMappings] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      const response = await window.electronAPI.listCategoryMappings();
      if (!response?.ok) throw new Error(response?.error || 'Mapping locali non disponibili.');
      setMappings(response.mappings ?? []);
      setError(response.categoryError ? `Categorie Base.com non disponibili: ${response.categoryError}` : '');
      if (response.categoriesVerified) onProductsChanged?.(response.products, response.quality, response);
    } catch (failure) { setError(failure.message); }
  }
  useEffect(() => { void refresh(); }, []);
  async function save(category) {
    setBusy(true); setError('');
    try {
      const response = await window.electronAPI.saveCategoryMapping({
        sourceTitle: editing.sourceTitle, sourceCategory: editing.sourceCategory,
        categoryId: category.categoryId,
      });
      if (!response?.ok) throw new Error(response?.error || 'Mapping non salvato.');
      setMappings(response.mappings); onProductsChanged?.(response.products, response.quality, response);
      setEditing(null); setMessage('Mapping categoria aggiornato.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function remove(mapping) {
    if (!window.confirm(`Eliminare il mapping locale per ${mapping.sourceCategory}?`)) return;
    setBusy(true); setError('');
    try {
      const response = await window.electronAPI.removeCategoryMapping({
        sourceTitle: mapping.sourceTitle, sourceCategory: mapping.sourceCategory,
      });
      if (!response?.ok) throw new Error(response?.error || 'Mapping non eliminato.');
      setMappings(response.mappings); onProductsChanged?.(response.products, response.quality, response);
      setMessage('Mapping locale eliminato. Nessuna categoria Base.com è stata eliminata.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const visible = mappings.filter(item => `${item.sourceTitle} ${item.sourceCategory} ${item.path.join(' > ')}`
    .toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it')));
  return <section className="card settings-section"><h2>Mapping categorie</h2><p>Regole locali tra catalogo, categoria Vudoo e categoria Base.com. Non modificano l’albero Base.com né config/.</p>
    <label className="form-field"><span>Cerca mapping</span><input className="input" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Categoria Vudoo o Base.com" /></label>
    {visible.length ? <div className="category-mapping-list">{visible.map(item => <div className="category-mapping-row" key={`${item.sourceTitle}:${item.sourceCategory}`}><div><strong>{item.sourceCategory}</strong><small>{item.sourceTitle} · Mapping utente</small></div><span>→</span><div><strong>{item.valid === false ? 'Categoria Base.com non più disponibile' : item.path.join(' › ')}</strong><small>ID {item.categoryId}{item.valid === false ? ' · da correggere' : item.valid === null ? ' · verifica Base non disponibile' : ''}</small></div><button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditing(item)}>Modifica</button><button type="button" className="btn btn-danger-quiet btn-sm" disabled={busy} onClick={() => remove(item)}>Elimina mapping</button></div>)}</div>
      : <p className="muted">{mappings.length ? 'Nessun mapping corrisponde alla ricerca.' : 'Nessun mapping utente salvato.'}</p>}
    <button type="button" className="btn btn-quiet btn-sm" onClick={refresh}>Aggiorna elenco</button>
    {error && <p className="alert alert-danger" role="alert">{error}</p>}{message && <p className="alert alert-success" role="status">{message}</p>}
    {editing && <BaseCategorySelector currentCategory={editing} onClose={() => setEditing(null)} onSelect={save} />}
  </section>;
}
