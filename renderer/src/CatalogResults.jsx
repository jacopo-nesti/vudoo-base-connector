import { formatDuration } from './importTiming.js';

function Metric({ label, value }) {
  if (value == null) return null;
  return <div className="result-metric"><span>{label}</span><strong className="mono">{value}</strong></div>;
}

export function PreflightSummary({ result, title = 'Controlli preliminari' }) {
  const products = result.products ?? {};
  const categories = result.categories ?? {};
  const base = result.base ?? {};
  return <div className="page-stack">
    <section className="card"><div className="card-heading"><div><h2>{title}</h2><p>Risultati restituiti dai controlli reali.</p></div>{result.durationMs != null && <span className="tag tag-gray">{formatDuration(result.durationMs)}</span>}</div>
      <div className="result-grid"><Metric label="Prodotti analizzati" value={products.analyzed} /><Metric label="Prodotti importabili" value={products.importable} /><Metric label="Pronti per Base.com" value={products.readyForBase} /><Metric label="Categorie mappate" value={categories.mapped} /><Metric label="Categorie non mappate" value={categories.unmapped} /><Metric label="Senza categoria di origine" value={products.missingSourceCategory} /><Metric label="Duplicati nel feed" value={products.feedDuplicates} /><Metric label="Avvisi EAN" value={products.eanWarnings} /><Metric label="Esclusi per categoria non mappata" value={products.unmappedValidCategory} /></div>
    </section>
    {(base.inventory || base.priceGroup || base.warehouse) && <section className="card"><div className="card-heading"><div><h2>Risorse Base.com</h2><p>Elementi individuati durante i controlli.</p></div></div><dl className="detail-list"><div><dt>Inventory</dt><dd>{base.inventory?.name ?? base.inventory?.id ?? 'Non disponibile'}</dd></div><div><dt>Price Group</dt><dd>{base.priceGroup?.name ?? base.priceGroup?.id ?? 'Non disponibile'}{base.priceGroup?.currency ? ` · ${base.priceGroup.currency}` : ''}</dd></div><div><dt>Warehouse</dt><dd>{base.warehouse?.name ?? base.warehouse?.id ?? 'Non disponibile'}</dd></div></dl></section>}
    {Array.isArray(categories.entries) && categories.entries.length > 0 && <section className="card table-card"><div className="card-heading padded"><div><h2>Categorie rilevate</h2><p>Esiti dell’analisi delle categorie nel catalogo.</p></div></div><div className="table-scroll"><table className="table"><thead><tr><th>Categoria Vudoo</th><th>Categoria Base.com</th><th>Stato</th><th className="numeric">Prodotti</th></tr></thead><tbody>{categories.entries.map((entry, index) => <tr key={`${entry.sourceCategory}-${index}`}><td>{entry.sourceCategory || 'Non disponibile'}</td><td>{Array.isArray(entry.basePath) ? entry.basePath.join(' > ') : entry.canonicalCategory || '—'}</td><td><span className={`tag ${entry.status === 'mapped' ? 'tag-green' : 'tag-orange'}`}>{entry.status === 'mapped' ? 'Mappata' : entry.status === 'missing' ? 'Senza categoria' : entry.status === 'unmapped' ? 'Non mappata' : 'Non disponibile'}</span></td><td className="numeric mono">{entry.count}</td></tr>)}</tbody></table></div></section>}
  </div>;
}

export function ImportSummary({ result, dryRunMode }) {
  const summary = result.categorySummary;
  return <div className="page-stack">
    <div className={`alert ${result.ok ? 'alert-success' : 'alert-warning'}`} role="status">{result.ok ? (dryRunMode ? 'Simulazione completata.' : 'Importazione completata.') : 'Importazione completata con problemi.'}</div>
    {result.preflightError && <div className="alert alert-danger" role="alert">Controlli preliminari non superati: {result.preflightError}</div>}
    <section className="card"><div className="card-heading"><div><h2>Risultato importazione</h2><p>Riepilogo restituito dal processo principale.</p></div>{result.durationMs != null && <span className="tag tag-gray">{formatDuration(result.durationMs)}</span>}</div><div className="result-grid"><Metric label="Prodotti letti" value={result.read} /><Metric label="Prodotti selezionati" value={result.selected} /><Metric label="Elaborati" value={result.processed} /><Metric label="Creati" value={result.created} /><Metric label="Aggiornati" value={result.updated} /><Metric label="Invariati" value={result.unchanged} /><Metric label="Operazioni simulate" value={result.simulated} /><Metric label="Errori" value={result.errors} /><Metric label="Duplicati nel feed" value={result.feedDuplicates} /><Metric label="Avvisi EAN" value={result.eanWarningsCount} /><Metric label="Esiti incerti" value={result.uncertainSkus?.length} /></div></section>
    {summary && <section className="card"><div className="card-heading"><div><h2>Riepilogo categorie</h2><p>Prodotti importabili ed esclusioni rilevate.</p></div></div><div className="result-grid"><Metric label="Totale nel feed" value={summary.totalFeedProducts} /><Metric label="Importabili" value={summary.importableProducts} /><Metric label="Senza categoria di origine" value={summary.missingSourceCategoryProducts} /><Metric label="Senza categoria registrabile" value={summary.missingSourceCategoryUnrecordableProducts} /><Metric label="Esclusi per categoria non mappata" value={summary.unmappedValidCategoryProducts} /><Metric label="Categorie non mappate" value={summary.unmappedCategories} /></div></section>}
    {result.uncertainSkus?.length > 0 && <section className="card"><h2>Operazioni con esito incerto</h2><ul className="sku-list">{result.uncertainSkus.map((sku, index) => <li key={`${sku}-${index}`}>{sku}</li>)}</ul></section>}
    {result.errorSkus?.length > 0 && <section className="card"><h2>Prodotti con errore</h2><ul className="sku-list">{result.errorSkus.map((sku, index) => <li key={`${sku}-${index}`}>{sku}</li>)}</ul></section>}
  </div>;
}
