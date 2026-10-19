import { useEffect, useState } from 'react';

export default function CatalogLookup({ onLoad, onLoaded, busy, loadError, initialQuery = '',
  placeholder = 'Cerca produttore per nome o codice catalogo...' }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);
  const term = query.trim();
  const directCode = Boolean(term) && !results.some(item => item.catalog_code === term) &&
    (results.length === 0 || /^\d+$/.test(term));

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

  async function load(code) {
    if (await onLoad(code)) onLoaded?.();
  }

  return <div className="catalog-lookup">
    <label className="form-field"><span>Cerca produttore o codice catalogo</span>
      <input className="input" type="search" autoFocus placeholder={placeholder}
        value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    {searching && <p role="status" className="muted">Ricerca in corso…</p>}
    {directoryError && <p className="alert alert-warning" role="alert">Anagrafica locale non disponibile. Puoi comunque caricare un catalogo per codice.</p>}
    {!searching && term && !directoryError && results.length === 0 && <p className="muted">Nessun produttore salvato corrisponde alla ricerca.</p>}
    {results.length > 0 && <ul className="catalog-lookup-results">{results.map(item => <li key={item.catalog_code}>
      <div><strong>{item.name}</strong><small>Catalogo {item.catalog_code}</small></div>
      <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={() => load(item.catalog_code)}>Carica catalogo</button>
    </li>)}</ul>}
    {directCode && <button className="btn btn-primary" type="button" disabled={busy} onClick={() => load(term)}>Carica catalogo {term}</button>}
    {loadError && <p className="alert alert-danger" role="alert">{loadError}</p>}
  </div>;
}
