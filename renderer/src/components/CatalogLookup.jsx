import { useEffect, useRef, useState } from 'react';
import CatalogLoadProgress from './CatalogLoadProgress.jsx';

export default function CatalogLookup({ onLoad, onLoaded, busy, loadError, initialQuery = '',
  placeholder = 'Cerca produttore per nome o codice catalogo...' }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);
  const [loadStatus, setLoadStatus] = useState('idle');
  const [loadingName, setLoadingName] = useState('');
  const [loadingCode, setLoadingCode] = useState('');
  const [loadingSource, setLoadingSource] = useState('');
  const loadingResultRef = useRef(null);
  const term = query.trim();
  const directCode = Boolean(term) && !results.some(item => item.catalog_code === term) &&
    (results.length === 0 || /^\d+$/.test(term));
  const loadingResultVisible = loadingSource === 'result' && results.some(item => item.catalog_code === loadingCode);

  useEffect(() => {
    if (loadStatus === 'loading' && loadingResultVisible) loadingResultRef.current?.scrollIntoView({ block: 'nearest' });
  }, [loadStatus, loadingResultVisible]);

  useEffect(() => {
    if (!term) { setResults([]); setSearching(false); setDirectoryError(false); return undefined; }
    let current = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const response = await window.electronAPI.searchManufacturers(term);
        if (!current) return;
        setResults(response?.ok ? response.results ?? [] : []);
        setDirectoryError(!response?.ok);
      } catch {
        if (current) { setResults([]); setDirectoryError(true); }
      } finally { if (current) setSearching(false); }
    }, 120);
    return () => { current = false; clearTimeout(timer); };
  }, [term]);

  async function load(code, name) {
    setLoadingCode(code);
    setLoadingSource(name ? 'result' : 'direct');
    setLoadingName(name || code);
    setLoadStatus('loading');
    try {
      if (await onLoad(code)) {
        setLoadStatus('success');
        await new Promise(resolve => setTimeout(resolve, 450));
        onLoaded?.();
      } else setLoadStatus('idle');
    } catch {
      setLoadStatus('idle');
    }
  }

  return <div className="catalog-lookup">
    <label className="form-field"><span>Cerca produttore o codice catalogo</span>
      <input className="input" type="search" autoFocus placeholder={placeholder}
        value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    {searching && <p role="status" className="muted">Ricerca in corso…</p>}
    {directoryError && <p className="alert alert-warning" role="alert">Anagrafica locale non disponibile. Puoi comunque caricare un catalogo per codice.</p>}
    {!searching && term && !directoryError && results.length === 0 && <p className="muted">Nessun produttore salvato corrisponde alla ricerca.</p>}
    {results.length > 0 && <ul className="catalog-lookup-results">{results.map(item => <li className={loadingSource === 'result' && loadingCode === item.catalog_code ? 'catalog-lookup-result--loading' : ''} ref={loadingSource === 'result' && loadingCode === item.catalog_code ? loadingResultRef : null} key={item.catalog_code}>
      <div><strong>{item.name}</strong><small>Catalogo {item.catalog_code}</small></div>
      <button className="btn btn-secondary btn-sm" type="button" disabled={busy || loadStatus !== 'idle'} onClick={() => load(item.catalog_code, item.name)}>Carica catalogo</button>
      {loadingSource === 'result' && loadingCode === item.catalog_code && <CatalogLoadProgress status={loadStatus} name={loadingName} />}
    </li>)}</ul>}
    {directCode && <button className="btn btn-primary" type="button" disabled={busy || loadStatus !== 'idle'} onClick={() => load(term)}>Carica catalogo {term}</button>}
    {(loadingSource === 'direct' || (loadingSource === 'result' && !loadingResultVisible)) &&
      <CatalogLoadProgress status={loadStatus} name={loadingName} />}
    {loadError && <p className="alert alert-danger" role="alert">{loadError}</p>}
  </div>;
}
