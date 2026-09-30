import { useEffect, useState } from 'react';
import { isSelectableId, variantDetails } from '../catalogFilters.js';
import { formatDuration } from '../importTiming.js';
import ProductDetailsDialog from '../components/ProductDetailsDialog.jsx';

export default function CatalogPage({ model }) {
  const [detailProduct, setDetailProduct] = useState(null);
  const {
    companyCode, setCompanyCode, catalog, catalogLoading, catalogError, catalogBusy, onFetch,
    searchQuery, setSearchQuery, categoryFilter, setCategoryFilter, brandFilter, setBrandFilter,
    categories, brands, filteredProducts, selectedIds, selectedIdSet, selectedProducts,
    visibleSelectedCount, selectableVisibleCount, hasActiveFilters,
    onToggle, onSelectFiltered, onDeselectFiltered, onClearSelection, onUndo,
    canUndo, onPreflightSelected, preflightLoading,
  } = model;

  useEffect(() => { setDetailProduct(null); }, [catalog]);

  return <div className="page-stack">
    <div className="page-heading"><div><h1>Catalogo Vudoo</h1><p>Carica, esplora e seleziona i prodotti da importare su Base.com.</p></div>{catalog && <span className="tag tag-blue">{catalog.totalProducts} prodotti caricati</span>}</div>

    <section className="card load-card" aria-labelledby="load-title">
      <div className="card-heading"><div><h2 id="load-title">Carica catalogo fornitore</h2><p>Il catalogo viene recuperato da Vudoo.</p></div></div>
      <form className="load-form" onSubmit={event => { event.preventDefault(); if (!catalogBusy && companyCode.trim()) onFetch(); }}>
        <label className="form-field grow"><span>Codice azienda Vudoo</span><input className="input mono" type="text" value={companyCode} onChange={event => setCompanyCode(event.target.value)} placeholder="Inserisci il codice azienda" /></label>
        <button className="btn btn-primary" type="submit" disabled={catalogBusy || !companyCode.trim()}>{catalogLoading ? 'Caricamento in corso…' : 'Carica catalogo'}</button>
      </form>
      {catalogLoading && <p className="working" role="status"><span className="spinner" /> Recupero catalogo in corso…</p>}
      {catalogError && <div className="alert alert-danger" role="alert">Impossibile caricare il catalogo: {catalogError}</div>}
      {catalog && <div className="load-meta"><span><strong>Fornitore</strong> {catalog.channelTitle || 'Non disponibile'}</span><span><strong>Prodotti ricevuti</strong> {catalog.totalProducts}</span>{catalog.durationMs != null && <span><strong>Durata</strong> {formatDuration(catalog.durationMs)}</span>}</div>}
    </section>

    {!catalog && !catalogLoading && <div className="card empty-state"><span className="empty-glyph" aria-hidden="true">□</span><h2>Nessun catalogo caricato</h2><p>Inserisci il codice azienda per vedere i prodotti e avviare i controlli preliminari.</p></div>}

    {catalog && <>
      <section className="card filter-card" aria-label="Ricerca e filtri">
        <div className="filter-grid">
          <label className="form-field grow"><span>Cerca prodotti</span><input className="input" type="search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="ID, SKU, prodotto, brand, categoria, MPN, formato o colore" /></label>
          <label className="form-field"><span>Categoria</span><select className="select" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">Tutte le categorie</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
          <label className="form-field"><span>Brand</span><select className="select" value={brandFilter} onChange={event => setBrandFilter(event.target.value)}><option value="">Tutti i brand</option>{brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}</select></label>
          <button className="btn btn-secondary align-end" type="button" disabled={!hasActiveFilters} onClick={() => { setSearchQuery(''); setCategoryFilter(''); setBrandFilter(''); }}>Azzera filtri</button>
        </div>
      </section>

      <div className="selection-toolbar">
        <div className="selection-actions"><button className="btn btn-secondary btn-sm" type="button" disabled={catalogBusy || selectableVisibleCount === 0 || visibleSelectedCount === selectableVisibleCount} onClick={onSelectFiltered}>Seleziona tutti i risultati</button><button className="btn btn-secondary btn-sm" type="button" disabled={catalogBusy || visibleSelectedCount === 0} onClick={onDeselectFiltered}>Deseleziona risultati</button><button className="btn btn-secondary btn-sm" type="button" disabled={catalogBusy || !selectedIds.length} onClick={onClearSelection}>Svuota selezione</button><button className="btn btn-quiet btn-sm" type="button" disabled={catalogBusy || !canUndo} onClick={onUndo}>Annulla ultima modifica</button></div>
        <div className="selection-next"><span><strong>{selectedIds.length}</strong> selezionati</span><button className="btn btn-primary" type="button" disabled={catalogBusy || !selectedIds.length} onClick={onPreflightSelected}>{preflightLoading ? 'Controlli in corso…' : 'Controlli preliminari'}</button></div>
      </div>
      <p className="catalog-count">{catalog.totalProducts} nel catalogo · {filteredProducts.length} visualizzati · {selectedIds.length} selezionati{selectedIds.length > visibleSelectedCount && <> · {selectedIds.length - visibleSelectedCount} selezionati fuori dai filtri attuali</>}</p>

      <details className="card selected-panel"><summary>Visualizza prodotti selezionati <span className="tag tag-blue">{selectedIds.length}</span></summary><div className="selected-panel-content">{selectedProducts.length === 0 ? <p className="muted">Nessun prodotto selezionato.</p> : <div className="selected-list">{selectedProducts.map(product => <div key={product.id} className="selected-row"><div><strong>{product.title || 'Senza titolo'}</strong><small>{[product.sku, product.brand, ...variantDetails(product).map(([, value]) => value)].filter(Boolean).join(' · ')}</small></div><div className="selected-row-end"><span className="mono">{product.price ?? '—'}</span><button className="btn btn-danger-quiet btn-sm" type="button" disabled={catalogBusy} onClick={() => onToggle(product.id)}>Rimuovi</button></div></div>)}</div>}</div></details>

      <section className="card table-card" aria-label="Prodotti del catalogo"><div className="table-scroll"><table className="table"><thead><tr><th className="check-col"><span className="sr-only">Selezione</span></th><th>SKU</th><th>Prodotto</th><th>Brand</th><th>Categoria</th><th>MPN</th><th className="numeric">Prezzo</th></tr></thead><tbody>
        {filteredProducts.map(({ product, index }) => {
          const selectable = isSelectableId(product.id);
          const selected = selectable && selectedIdSet.has(product.id);
          const details = variantDetails(product).map(([, value]) => value).join(' · ');
          return <tr key={selectable ? `${product.id}-${index}` : `missing-${product.sku ?? 'id'}-${index}`} className={selected ? 'selected' : ''}><td className="check-col"><input type="checkbox" checked={selected} onChange={() => onToggle(product.id)} disabled={catalogBusy || !selectable} aria-label={`Seleziona ${product.title ?? 'prodotto'}`} /></td><td className="mono sku-cell">{product.sku || '—'}</td><td className="product-cell"><div className="product-title-line"><strong>{product.title || 'Senza titolo'}</strong><button className="product-details-action" type="button" onClick={event => { event.stopPropagation(); setDetailProduct(product); }} aria-label={`Dettagli di ${product.title || 'prodotto senza titolo'}`}><span aria-hidden="true">⌕</span> Dettagli</button></div>{details && <small>{details}</small>}{!selectable && <small className="danger-text">ID non disponibile · selezione disabilitata</small>}</td><td>{product.brand && <span className="tag tag-gray">{product.brand}</span>}</td><td>{product.category && <span className="tag tag-blue">{product.category}</span>}</td><td className="muted-cell">{product.mpn || '—'}</td><td className="numeric mono">{product.price ?? '—'}</td></tr>;
        })}
        {filteredProducts.length === 0 && <tr><td colSpan="7" className="table-empty">{catalog.products.length === 0 ? 'Il catalogo non contiene prodotti.' : 'Nessun prodotto corrisponde ai filtri selezionati.'}</td></tr>}
      </tbody></table></div></section>

      <ProductDetailsDialog product={detailProduct} onClose={() => setDetailProduct(null)} />
    </>}
  </div>;
}
