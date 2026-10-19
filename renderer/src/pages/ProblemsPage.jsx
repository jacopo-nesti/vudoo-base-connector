import { useMemo, useState } from 'react';
import { deriveProblems, problemCounts } from '../problemCenter.js';
import '../problems.css';

const PAGE_SIZE = 50;
const CHANNEL_LABEL = { base: 'Base.com', system: 'Sistema' };

export default function ProblemsPage({ app, onOpen, onCatalog }) {
  const [channel, setChannel] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [pageIndex, setPageIndex] = useState(0);

  const errors = {
    catalogError: app.catalogError, runtimeModeError: app.runtimeModeError,
    environmentError: app.environmentError,
    preflightError: app.preflightError, fullPreflightError: app.fullPreflightError,
    importError: app.importError, fullImportError: app.fullImportError,
    manufacturerSyncError: app.manufacturerSyncError,
    dryRunInvalid: app.dryRunMode === null, testModeInvalid: app.testModeEnabled === null,
  };
  const problems = useMemo(() => deriveProblems({ catalog: app.catalog, errors }),
    [app.catalog, ...Object.values(errors)]);
  const counts = useMemo(() => problemCounts(problems), [problems]);
  const visible = problems.filter(problem => (channel === 'all' || problem.channel === channel)
    && (severity === 'all' || problem.severity === severity));
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(pageIndex, totalPages - 1);
  const rows = visible.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const filtered = channel !== 'all' || severity !== 'all';
  const reset = () => { setChannel('all'); setSeverity('all'); setPageIndex(0); };

  return <div className="page-stack problems-page">
    <div className="page-heading"><div><h1>Problemi</h1><p>Controlli del catalogo e errori operativi che richiedono attenzione.</p></div></div>
    <div className="problems-summary" aria-label="Riepilogo problemi"><div><strong>{counts.error}</strong><span>Blocchi ed errori</span></div><div><strong>{counts.warning}</strong><span>Avvisi</span></div><div><strong>{counts.products}</strong><span>Prodotti interessati</span></div></div>
    {!app.catalog && !app.catalogLoading && <div className="card problems-empty"><h2>Nessun catalogo caricato</h2><p>Carica un catalogo Vudoo per vedere i problemi dei prodotti. Gli errori operativi già rilevati restano visibili qui sotto.</p><button type="button" className="btn btn-primary" onClick={onCatalog}>Carica catalogo</button></div>}
    {app.catalogLoading && <div className="alert alert-info" role="status">Caricamento del catalogo in corso…</div>}
    <section className="card problems-list" aria-label="Elenco problemi"><div className="problems-controls"><div><strong>{visible.length} problemi visualizzati</strong>{filtered && <span className="tag tag-blue">Vista filtrata</span>}</div><div className="problems-filters"><label className="form-field"><span>Ambito</span><select className="select" value={channel} onChange={event => { setChannel(event.target.value); setPageIndex(0); }}><option value="all">Tutti</option><option value="base">Base.com</option><option value="system">Sistema</option></select></label><label className="form-field"><span>Tipo</span><select className="select" value={severity} onChange={event => { setSeverity(event.target.value); setPageIndex(0); }}><option value="all">Tutti</option><option value="error">Blocchi ed errori</option><option value="warning">Avvisi</option></select></label><button type="button" className="btn btn-quiet btn-sm" disabled={!filtered} onClick={reset}>Reset filtri</button></div></div>
      {rows.length ? <div className="problems-rows">{rows.map(problem => <article className="problem-row" key={problem.id}><span className={`problem-mark problem-mark--${problem.severity}`} aria-label={problem.severity === 'error' ? 'Errore o blocco' : 'Avviso'}>{problem.severity === 'error' ? '!' : 'i'}</span><div className="problem-copy"><div><strong>{problem.title}</strong><span className="problem-channel">{CHANNEL_LABEL[problem.channel]}</span>{problem.productId && <span className="mono problem-id">{problem.search}</span>}</div><p>{problem.detail}</p>{problem.field && <small>Campo: {problem.field}</small>}</div><button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(problem)}>{problem.productId ? 'Apri prodotto' : 'Apri contesto'}</button></article>)}</div>
        : <div className="problems-empty"><strong>{filtered ? 'Nessun problema corrisponde ai filtri' : 'Nessun problema rilevato nei dati disponibili'}</strong><p>{filtered ? 'Azzera i filtri per vedere tutti i problemi.' : 'I problemi vengono aggiornati quando il catalogo o i controlli locali cambiano.'}</p>{filtered && <button type="button" className="btn btn-secondary btn-sm" onClick={reset}>Reset filtri</button>}</div>}
      {totalPages > 1 && <div className="catalog-pagination"><span>Pagina {safePage + 1} di {totalPages}</span><div className="selection-actions"><button type="button" className="btn btn-secondary btn-sm" disabled={safePage === 0} onClick={() => setPageIndex(value => value - 1)}>Precedente</button><button type="button" className="btn btn-secondary btn-sm" disabled={safePage + 1 >= totalPages} onClick={() => setPageIndex(value => value + 1)}>Successiva</button></div></div>}
    </section>
  </div>;
}
