import { useEffect, useRef, useState } from 'react';
import CatalogLookup from './CatalogLookup.jsx';

export default function CatalogSwitcher({ open, app, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  return <dialog className="catalog-switcher" ref={dialog} aria-labelledby="catalog-switcher-title" onCancel={event => { event.preventDefault(); if (!app.catalogLoading) onClose(); }}>
    <div>
      <div className="dialog-heading"><div><span className="topbar-eyebrow">SORGENTE VUDOO</span><h2 id="catalog-switcher-title">Carica catalogo Vudoo</h2></div><button type="button" className="btn btn-quiet" aria-label="Chiudi catalogo" disabled={app.catalogLoading} onClick={onClose}>×</button></div>
      <p>Il catalogo caricato diventa il contesto del Product Manager e delle operazioni Base.com.</p>
      {app.catalog && <p className="catalog-switcher-current">Attivo: <strong>{app.catalog.manufacturerName || app.catalog.channelTitle}</strong> · {app.catalog.totalProducts} prodotti</p>}
      <CatalogLookup initialQuery="" onLoad={app.handleFetchCatalog} onLoaded={onClose}
        busy={app.catalogBusy} loadError={app.catalogError} />
      <div className="dialog-actions"><button className="btn btn-secondary" type="button" disabled={app.catalogLoading} onClick={onClose}>Chiudi</button></div>
      {app.catalogLoading && <p role="status" className="working"><span className="spinner" />Recupero catalogo Vudoo…</p>}
    </div>
  </dialog>;
}
