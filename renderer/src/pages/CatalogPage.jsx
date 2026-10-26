import TableTools, { useTablePreferences, SortHeading } from '../components/TableTools.jsx';
import { clampColumnWidth, pinnedColumnOffsets, productColumns, readLayoutPreferences, sortProductRows, visibleColumnOrder } from '../uiPreferences.js';
import ProductInspector from '../components/ProductInspector.jsx';
import { useEffect, useRef, useState } from 'react';
import { isSelectableId, variantDetails } from '../catalogFilters.js';
import { exactProblemPage } from '../problemCenter.js';
import { formatDuration } from '../importTiming.js';
import ProductDetailsDialog from '../components/ProductDetailsDialog.jsx';
import BulkEditorDialog from '../components/BulkEditorDialog.jsx';
import InventoryStatus from '../components/InventoryStatus.jsx';

export default function CatalogPage({ model }) {
  const [inspectorProduct, setInspectorProduct] = useState(null);
  const handledProblemFocus = useRef(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [detailSection, setDetailSection] = useState('Identità');
  const [pageIndex, setPageIndex] = useState(0);
  const tablePreferences = useTablePreferences('base');
  const { sort, density } = tablePreferences.state;
  const visibleColumns = visibleColumnOrder(tablePreferences.state);
  const [liveWidths, setLiveWidths] = useState(tablePreferences.state.widths);
  const resize = useRef(null);
  const scrollRef = useRef(null);
  const [tableViewportWidth, setTableViewportWidth] = useState(0);
  useEffect(() => { setLiveWidths(tablePreferences.state.widths); }, [tablePreferences.state.widths]);
  useEffect(() => () => { resize.current?.stop?.(); }, []);
  const columnWidths = { ...tablePreferences.state.widths, ...liveWidths };
  const pinnedOffsets = pinnedColumnOffsets({ ...tablePreferences.state, widths: columnWidths }, 42,
    tableViewportWidth ? Math.floor(tableViewportWidth * 0.62) : 520);
  const pinnedLimited = tablePreferences.state.pinned.some(key => visibleColumns.includes(key) && pinnedOffsets[key] === undefined);
  const tableWidth = 42 + visibleColumns.reduce((sum, key) => sum + columnWidths[key], 0);
  function startResize(event, key) {
    event.preventDefault(); event.stopPropagation();
    resize.current?.stop?.();
    const start = event.clientX;
    const original = columnWidths[key];
    let current = original;
    function move(pointer) { current = clampColumnWidth(key, original + pointer.clientX - start); setLiveWidths(previous => ({ ...previous, [key]: current })); }
    function stop() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      resize.current = null;
      if (current !== original) tablePreferences.setState(previous => ({ ...previous, widths: { ...previous.widths, [key]: current } }));
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    resize.current = { stop };
  }
  const pinStyle = key => pinnedOffsets[key] === undefined ? undefined : { left: pinnedOffsets[key] };
  const setSort = value => { tablePreferences.setState(s => ({...s, sort:value})); setPageIndex(0); };
  const sortAria = field => sort === field ? 'ascending' : sort === `${field}:desc` ? 'descending' : 'none';
  const heading = (label, field) => <SortHeading label={label} field={field} sort={sort} onSort={setSort} />;
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState('');
  const {
    companyCode, setCompanyCode, activeCatalogCode, catalog, catalogLoading, catalogError, catalogBusy, onFetch,
    problemFocus, onProblemFocusHandled,
    searchQuery, setSearchQuery, categoryFilter, setCategoryFilter,
    categories, canonicalCategories, extraFilters, setExtraFilters,
    filteredProducts, selectedIds, selectedIdSet, selectedProducts,
    visibleSelectedCount, selectableVisibleCount, hasActiveFilters,
    onToggle, onSelectFiltered, onDeselectFiltered, onClearSelection, onUndo,
    canUndo, onPreflightSelected, preflightLoading,
    onSaveProduct, onSaveCategory, onMediaChange, onBulkEditProducts, onSelectInventory, onRetryInventory,
  } = model;
  const currentInspectorProduct = inspectorProduct && catalog?.products?.find(product => product.id === inspectorProduct.id);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setTableViewportWidth(element.clientWidth);
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [Boolean(catalog)]);

  useEffect(() => { setDetailProduct(null); setInspectorProduct(null); setBulkOpen(false); }, [activeCatalogCode]);
  useEffect(() => { setPageIndex(0); }, [searchQuery, categoryFilter, extraFilters, activeCatalogCode]);
  const pageSize = readLayoutPreferences().pageSize;
  const pages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const orderedProducts = sortProductRows(filteredProducts, sort, 'base');
  const visiblePage = orderedProducts.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  useEffect(() => {
    if (!problemFocus || handledProblemFocus.current === problemFocus.requestId) return;
    const product = catalog?.products?.find(item => String(item.id) === String(problemFocus.productId));
    const exactPage = exactProblemPage(orderedProducts, problemFocus.productId, pageSize);
    if (!product || exactPage < 0) return;
    handledProblemFocus.current = problemFocus.requestId;
    setPageIndex(exactPage);
    setInspectorProduct(product);
    setDetailSection('Base.com');
    setDetailProduct(product);
    onProblemFocusHandled?.();
  }, [problemFocus?.requestId, catalog, filteredProducts, sort]);
  const setExtra = (key, value) => setExtraFilters(current => ({ ...current, [key]: value }));
  const applyView = ({search = '', categoryFilter = '', canonicalFilter = '', availabilityFilter = '', eanFilter = '', imageFilter = '', baseCategoryFilter = ''} = {}) => {
    setSearchQuery(search); setCategoryFilter(categoryFilter);
    setExtraFilters({ canonicalFilter, availabilityFilter, eanFilter, imageFilter, baseCategoryFilter });
  };
  const currentFilters = {search:searchQuery, categoryFilter,
    canonicalFilter:extraFilters.canonicalFilter ?? '', availabilityFilter:extraFilters.availabilityFilter ?? '',
    eanFilter:extraFilters.eanFilter ?? '', imageFilter:extraFilters.imageFilter ?? '',
    baseCategoryFilter:extraFilters.baseCategoryFilter ?? ''};
  function open(product, section = 'Identità') { setDetailSection(section); setDetailProduct(product); }
  function productCell(product, key, details, selectable) {
    switch (key) {
      case 'sku': return <span className="mono" title={String(product.sku || product.id || '—')}>{product.sku || product.id || '—'}</span>;
      case 'title': return <><div className="product-title-line">{product.imageLink && <img className="catalog-thumb" src={product.imageLink} alt="" loading="lazy" />}<button type="button" className="product-inspect-trigger" title={product.title || 'Senza titolo'} aria-expanded={inspectorProduct?.id === product.id} onClick={() => setInspectorProduct(product)}>{product.title || 'Senza titolo'}</button><button className="product-details-action" type="button" onClick={event => { event.stopPropagation(); open(product); }} aria-label={`Dettagli di ${product.title || 'prodotto senza titolo'}`}><span aria-hidden="true">⌕</span> Apri scheda</button></div>{details && <small title={details}>{details}</small>}{product.provenance?.title?.origin === 'manual' && <small className="source-badge">Titolo modificato</small>}{!selectable && <small className="danger-text">ID non disponibile · selezione disabilitata</small>}</>;
      case 'ean': return <span title={product.ean || '—'}>{product.ean || '—'}</span>;
      case 'brand': return product.brand && <span className="tag tag-gray" title={product.brand}>{product.brand}</span>;
      case 'category': { const path = product.baseCategory?.path;
        return path?.length ? <span className="tag tag-blue" title={`${path.join(' > ')} · ${product.baseCategory.origin}`}>{path.at(-1)}</span>
          : <span className="tag tag-orange" title="Categoria Base.com non assegnata">Non assegnata</span>; }
      case 'mpn': return <span title={product.mpn || '—'}>{product.mpn || '—'}</span>;
      case 'price': return product.price ?? '—';
      case 'stock': return product.quantity ?? '—';
      default: return null;
    }
  }
  return <div className="page-stack">
    <div className="page-heading"><div><h1>Prodotti</h1><p>Controlla e modifica i prodotti prima dell'importazione su Base.com.</p></div></div>

    {catalogError && <div className="alert alert-danger" role="alert">Impossibile caricare il catalogo: {catalogError}</div>}
    <div className="catalog-source-bar"><div className="catalog-source-identity"><span className="topbar-eyebrow">CATALOGO VUDOO</span><strong>{catalog?.channelTitle || 'Nessun catalogo attivo'}</strong></div>{catalog && <div className="catalog-source-meta"><span>Codice <strong>{activeCatalogCode}</strong></span><span><strong>{catalog.totalProducts}</strong> prodotti</span></div>}<button className="btn btn-secondary" type="button" onClick={model.onCatalog} disabled={catalogBusy}>{catalog ? 'Cambia catalogo' : 'Carica catalogo Vudoo'}</button></div>
    {catalog && <InventoryStatus catalogCode={activeCatalogCode} manufacturerName={catalog.manufacturerName}
      status={catalog.inventoryStatus} onSelect={onSelectInventory} onRetry={onRetryInventory} />}

    {!catalog && !catalogLoading && <div className="card empty-state"><span className="empty-glyph" aria-hidden="true">□</span><h2>Nessun catalogo caricato</h2><p>Carica un catalogo Vudoo per vedere i prodotti e avviare i controlli preliminari.</p></div>}

    {catalog && <>
      {catalog.mappingError && <div className="alert alert-danger">Mapping categorie non disponibile: {catalog.mappingError}</div>}
      <section className="card filter-card" aria-label="Ricerca e filtri">
        <div className="filter-grid">
          <label className="form-field grow filter-search"><span>Ricerca globale</span><input className="input" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Cerca per nome, SKU, EAN o ID..." /></label>
          <label className="form-field"><span>Categoria</span><select className="select" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">Tutte le categorie</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
          <details className="filter-more"><summary>Altri filtri{[extraFilters.canonicalFilter, extraFilters.availabilityFilter, extraFilters.eanFilter, extraFilters.imageFilter, extraFilters.baseCategoryFilter].filter(Boolean).length ? ` · ${[extraFilters.canonicalFilter, extraFilters.availabilityFilter, extraFilters.eanFilter, extraFilters.imageFilter, extraFilters.baseCategoryFilter].filter(Boolean).length} attivi` : ''}</summary><div className="filter-more-fields">
            <label className="form-field"><span>Categoria Base</span><select className="select" value={extraFilters.baseCategoryFilter ?? ''} onChange={event => setExtra('baseCategoryFilter', event.target.value)}><option value="">Tutte</option><option value="assigned">Assegnate</option><option value="unassigned">Non assegnate</option></select></label>
            <label className="form-field"><span>Canonica</span><select className="select" value={extraFilters.canonicalFilter ?? ''} onChange={event => setExtra('canonicalFilter', event.target.value)}><option value="">Tutte</option>{canonicalCategories.map(item => <option key={item}>{item}</option>)}</select></label>
            <label className="form-field"><span>Disponibilità</span><select className="select" value={extraFilters.availabilityFilter ?? ''} onChange={event => setExtra('availabilityFilter', event.target.value)}><option value="">Tutte</option><option value="available">Disponibile</option><option value="unavailable">Non disponibile</option></select></label>
            <label className="form-field"><span>EAN</span><select className="select" value={extraFilters.eanFilter ?? ''} onChange={event => setExtra('eanFilter', event.target.value)}><option value="">Tutti</option><option value="present">Presente</option><option value="missing">Mancante</option><option value="invalid">Invalido nel feed</option></select></label>
            <label className="form-field"><span>Immagini</span><select className="select" value={extraFilters.imageFilter ?? ''} onChange={event => setExtra('imageFilter', event.target.value)}><option value="">Tutte</option><option value="present">Presente</option><option value="missing">Mancante</option></select></label>
          </div></details>
        </div>
      </section>

      <TableTools channel="base" preferences={tablePreferences} filters={currentFilters} onApply={applyView} filtered={hasActiveFilters} onReset={() => applyView({})} onCustomize={model.onSettingsColumns} presets={[{id:'all',name:'Tutti',filters:{}}]} />
      <p className="catalog-count">{catalog.totalProducts} nel catalogo · {filteredProducts.length} visualizzati · {selectedIds.length} selezionati{selectedIds.length > visibleSelectedCount && <> · {selectedIds.length - visibleSelectedCount} selezionati fuori dai filtri attuali</>}</p>
      {pinnedLimited && <p className="alert alert-warning" role="status">Alcune colonne fissate scorrono normalmente perché lo spazio disponibile è ridotto. Riduci le larghezze o allarga la tabella per fissarle.</p>}
      {bulkFeedback && <p className="alert alert-success" role="status">{bulkFeedback}</p>}

      <section className="card table-card enterprise-table" data-density={density} aria-label="Prodotti del catalogo"><div className={"catalog-inspector-layout " + (inspectorProduct ? "has-inspector" : "")}><div className="table-scroll" ref={scrollRef}><table className="table product-configurable-table" style={{width: tableWidth}}><colgroup><col style={{width:42}} />{visibleColumns.map(key => <col key={key} style={{width:columnWidths[key]}} />)}</colgroup><thead><tr><th className="check-col pinned-selection"><span className="sr-only">Selezione</span></th>{visibleColumns.map(key => <th key={key} className={pinnedOffsets[key] === undefined ? '' : 'pinned-product-column'} style={pinStyle(key)} aria-sort={productColumns[key].sort ? sortAria(productColumns[key].sort) : undefined}>{productColumns[key].sort ? heading(productColumns[key].label, productColumns[key].sort) : productColumns[key].label}<span className="column-resizer" role="separator" aria-label={`Ridimensiona ${productColumns[key].label}`} aria-orientation="vertical" tabIndex={0} onPointerDown={event => startResize(event, key)} onDoubleClick={event => { event.stopPropagation(); tablePreferences.setState(previous => ({ ...previous, widths: { ...previous.widths, [key]: productColumns[key].defaultWidth } })); }} onKeyDown={event => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); const next = clampColumnWidth(key, columnWidths[key] + (event.key === 'ArrowRight' ? 10 : -10)); tablePreferences.setState(previous => ({ ...previous, widths: { ...previous.widths, [key]: next } })); }} /></th>)}</tr></thead><tbody>
        {visiblePage.map(({ product, index }) => {
          const selectable = isSelectableId(product.id);
          const selected = selectable && selectedIdSet.has(product.id);
          const details = variantDetails(product).map(([, value]) => value).join(' · ');
          return <tr key={selectable ? `${product.id}-${index}` : `missing-${product.sku ?? 'id'}-${index}`} className={(selected ? 'selected ' : '') + (inspectorProduct?.id === product.id ? 'inspected' : '')}><td className="check-col pinned-selection"><input type="checkbox" checked={selected} onChange={() => onToggle(product.id)} disabled={catalogBusy || !selectable} aria-label={`Seleziona ${product.title ?? 'prodotto'}`} /></td>{visibleColumns.map(key => <td key={key} className={`${key === 'title' ? 'product-cell' : ''} ${['price','stock'].includes(key) ? 'numeric mono' : ''} ${['sku','ean'].includes(key) ? 'mono' : ''} ${pinnedOffsets[key] === undefined ? '' : 'pinned-product-column'}`} style={pinStyle(key)}>{productCell(product, key, details, selectable)}</td>)}</tr>;
        })}
        {filteredProducts.length === 0 && <tr><td colSpan={1 + visibleColumns.length} className="table-empty">{catalog.products.length === 0 ? 'Il catalogo non contiene prodotti.' : 'Nessun prodotto corrisponde ai filtri selezionati.'}{hasActiveFilters && <button className="btn btn-quiet btn-sm" onClick={() => applyView({})}>Reset filtri</button>}</td></tr>}
      </tbody></table></div><ProductInspector product={currentInspectorProduct} channel="base" onClose={() => setInspectorProduct(null)} onEdit={() => open(currentInspectorProduct)} /></div></section>
      <div className="catalog-pagination"><span>Pagina {pageIndex + 1} di {pages} · {pageSize} prodotti per pagina</span><div className="selection-actions"><button className="btn btn-secondary btn-sm" disabled={pageIndex === 0} onClick={() => setPageIndex(value => value - 1)}>Precedente</button><button className="btn btn-secondary btn-sm" disabled={pageIndex + 1 >= pages} onClick={() => setPageIndex(value => value + 1)}>Successiva</button></div></div>

      <div className="selection-toolbar">
        <div className="selection-actions"><button className="btn btn-secondary btn-sm" type="button" disabled={catalogBusy || selectableVisibleCount === 0 || visibleSelectedCount === selectableVisibleCount} onClick={onSelectFiltered}>Seleziona tutti i risultati</button><button className="btn btn-secondary btn-sm" type="button" disabled={catalogBusy || visibleSelectedCount === 0} onClick={onDeselectFiltered}>Deseleziona risultati</button><button className="btn btn-secondary btn-sm" type="button" disabled={catalogBusy || !selectedIds.length} onClick={onClearSelection}>Svuota selezione</button><button className="btn btn-quiet btn-sm" type="button" disabled={catalogBusy || !canUndo} onClick={onUndo}>Annulla ultima modifica</button></div>
        <div className="selection-next"><span><strong>{selectedIds.length}</strong> selezionati</span><button className="btn btn-secondary" type="button" disabled={catalogBusy || !selectedProducts.length} onClick={() => setBulkOpen(true)}>Modifica massiva</button><button className="btn btn-primary" type="button" disabled={catalogBusy || !selectedIds.length} onClick={onPreflightSelected}>{preflightLoading ? 'Controlli in corso…' : 'Controlli preliminari'}</button></div>
      </div>
      {!selectedProducts.length && <p className="muted bulk-hint">Seleziona almeno un prodotto per utilizzare la modifica massiva.</p>}
      <details className="card selected-panel"><summary>Visualizza prodotti selezionati <span className="tag tag-blue">{selectedIds.length}</span></summary><div className="selected-panel-content">{selectedProducts.length === 0 ? <p className="muted">Nessun prodotto selezionato.</p> : <><div className="selected-list">{selectedProducts.slice(0, 100).map(product => <div key={product.id} className="selected-row"><div><button type="button" className="product-inspect-trigger" aria-expanded={inspectorProduct?.id === product.id} onClick={() => setInspectorProduct(product)}>{product.title || 'Senza titolo'}</button><small>{[product.sku, product.brand, ...variantDetails(product).map(([, value]) => value)].filter(Boolean).join(' · ')}</small></div><div className="selected-row-end"><span className="mono">{product.price ?? '—'}</span><button className="btn btn-danger-quiet btn-sm" type="button" disabled={catalogBusy} onClick={() => onToggle(product.id)}>Rimuovi</button></div></div>)}</div>{selectedProducts.length > 100 && <p>Mostrati i primi 100 di {selectedProducts.length} selezionati.</p>}</>}</div></details>

      <details className="catalog-quality-details"><summary>Qualità del catalogo <span className="tag tag-gray">{catalog.quality?.blocking ?? '—'} bloccati · {catalog.quality?.warnings ?? '—'} avvisi</span></summary><section className="catalog-quality" aria-label="Qualità del catalogo">
        <div><strong>{catalog.quality?.total ?? catalog.totalProducts}</strong><span>prodotti ricevuti</span></div>
        <div><strong>{catalog.quality?.importable ?? '—'}</strong><span>pronti localmente per Base</span></div>
        <div><strong>{catalog.quality?.unmappedCategories ?? '—'}</strong><span>categorie da associare</span></div>
        <div><strong>{catalog.quality?.mappedCategories ?? '—'}</strong><span>categorie mappate</span></div>
        <div><strong>{catalog.quality?.missingRequired ?? '—'}</strong><span>dati richiesti mancanti</span></div>
        <div><strong>{catalog.quality?.eanMissing ?? '—'}</strong><span>EAN mancanti</span></div>
        <div><strong>{catalog.quality?.eanInvalid ?? '—'}</strong><span>EAN da correggere</span></div>
        <div><strong>{catalog.quality?.imageMissing ?? '—'}</strong><span>immagini Vudoo mancanti</span></div>
        <div><strong>{catalog.quality?.duplicateIds ?? '—'}</strong><span>ID ripetuti</span></div>
        <div><strong>{catalog.quality?.warnings ?? '—'}</strong><span>avvisi locali</span></div>
        <div><strong>{catalog.quality?.blocking ?? '—'}</strong><span>prodotti bloccati</span></div>
      </section></details>

      {selectedIds.length > 0 && <div className="enterprise-bulk-bar" role="region" aria-label="Azioni sui prodotti selezionati"><strong>{selectedIds.length} prodotti selezionati</strong><button className="btn btn-secondary btn-sm" disabled={catalogBusy || !selectedProducts.length} onClick={() => setBulkOpen(true)}>Modifica massiva</button><button className="btn btn-secondary btn-sm" disabled={catalogBusy} onClick={onPreflightSelected}>Controlli preliminari</button><button className="btn btn-quiet btn-sm" disabled={catalogBusy} onClick={onClearSelection}>Deseleziona</button></div>}
      {bulkOpen && <BulkEditorDialog selectedIds={selectedIds} selectedProducts={selectedProducts} onApply={onBulkEditProducts}
        onClose={() => setBulkOpen(false)} onDone={message => { setBulkFeedback(message); setBulkOpen(false); }} />}
      <ProductDetailsDialog product={detailProduct} canonicalOptions={catalog.canonicalOptions ?? []} initialSection={detailSection} onClose={() => setDetailProduct(null)} onMediaChange={next => { setDetailProduct(next); onMediaChange(next); }} onSave={async input => { const next = await onSaveProduct(input); setDetailProduct(next); return next; }} onSaveCategory={async input => { const result = await onSaveCategory(input); setDetailProduct(result.product); return result; }} />
    </>}
  </div>;
}
