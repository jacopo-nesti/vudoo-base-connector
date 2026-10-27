import { useMemo, useState } from 'react';
import { buildBaseCategoryTree, searchBaseCategories } from '../baseCategoryTree.js';
import { prepareBaseCategoryMove } from '../baseCategoryMove.js';

export default function BaseCategoryBrowser({ categories, selectedId, onSelect, disabledIds = new Set(),
  query, onQueryChange, label = 'Cerca nome, percorso o ID', onMove }) {
  const [expanded, setExpanded] = useState(new Set());
  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const tree = useMemo(() => buildBaseCategoryTree(categories), [categories]);
  const results = useMemo(() => searchBaseCategories(categories, query), [categories, query]);
  function toggle(id) {
    setExpanded(previous => { const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function dragOver(event, parentId) {
    if (!onMove || !prepareBaseCategoryMove(categories, draggedId, parentId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetId(parentId);
  }
  function drop(event, parentId) {
    event.preventDefault();
    const proposal = prepareBaseCategoryMove(categories, draggedId, parentId);
    setDropTargetId(null); setDraggedId(null);
    if (proposal) onMove(proposal);
  }
  function nodes(items, depth = 0) {
    return items.map(node => <div key={node.categoryId} className="base-category-node">
      <div className={`base-category-line ${dropTargetId === node.categoryId ? 'base-category-line--drop' : ''}`}
        style={{ paddingLeft: depth * 18 }} onDragOver={event => dragOver(event, node.categoryId)}
        onDragLeave={() => setDropTargetId(null)} onDrop={event => drop(event, node.categoryId)}>
        {onMove && <span className="base-category-drag-handle" draggable title={`Trascina ${node.name} per cambiare categoria padre`}
          aria-label={`Trascina ${node.name}; in alternativa usa Sposta nel dettaglio`}
          onDragStart={event => { setDraggedId(node.categoryId); event.dataTransfer.setData('text/plain', String(node.categoryId));
            event.dataTransfer.effectAllowed = 'move'; }}
          onDragEnd={() => { setDraggedId(null); setDropTargetId(null); }}>⋮⋮</span>}
        {node.children.length ? <button type="button" className="btn btn-quiet btn-sm"
          aria-label={`${expanded.has(node.categoryId) ? 'Chiudi' : 'Apri'} ${node.name}`}
          aria-expanded={expanded.has(node.categoryId)} onClick={() => toggle(node.categoryId)}>{expanded.has(node.categoryId) ? '▾' : '▸'}</button>
          : <span className="base-category-spacer" />}
        <button type="button" className="btn btn-quiet btn-sm" aria-pressed={selectedId === node.categoryId}
          disabled={disabledIds.has(node.categoryId)} title={node.path.join(' > ')}
          onClick={() => onSelect(node)}>{node.name}</button>
        {dropTargetId === node.categoryId && <small className="base-category-drop-hint">Sposta dentro questa categoria</small>}
      </div>
      {expanded.has(node.categoryId) && node.children.length > 0 && nodes(node.children, depth + 1)}
    </div>);
  }
  return <div className="base-category-browser">
    <label className="form-field"><span>{label}</span><input className="input" type="search" value={query}
      onChange={event => onQueryChange(event.target.value)} placeholder="Cerca categoria Base.com" /></label>
    <div className="base-category-results">{query.trim()
      ? results.length ? results.map(category => <button type="button" key={category.categoryId}
        className="base-category-result" aria-pressed={selectedId === category.categoryId}
        disabled={disabledIds.has(category.categoryId)} onClick={() => onSelect(category)}>
        <span>{category.path.join(' › ')}</span><small>ID {category.categoryId}</small></button>)
        : <p>Nessuna categoria corrisponde alla ricerca.</p>
      : nodes(tree)}</div>
    {onMove && <div className={`base-category-root-drop ${dropTargetId === 0 ? 'base-category-root-drop--active' : ''}`}
      onDragOver={event => dragOver(event, 0)} onDragLeave={() => setDropTargetId(null)}
      onDrop={event => drop(event, 0)}>Livello principale · trascina qui per spostare alla root</div>}
  </div>;
}
