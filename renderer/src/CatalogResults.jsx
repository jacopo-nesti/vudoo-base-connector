export function PreflightSummary({ result, title }) {
  return (
    <section>
      <h4>{title}</h4>
      <p>Prodotti analizzati: {result.products.analyzed}</p>
      <p>Prodotti importabili: {result.products.importable}</p>
      <p>Prodotti pronti per Base.com: {result.products.readyForBase}</p>
      <p>Categorie riconosciute: {result.categories.mapped}</p>
      <p>Categorie non mappate: {result.categories.unmapped}</p>
      <p>Duplicati nel catalogo: {result.products.feedDuplicates}</p>
      <p>Avvisi EAN: {result.products.eanWarnings}</p>
      <p>Prodotti esclusi per categoria mancante: {result.products.missingSourceCategory}</p>
      <p>Prodotti esclusi per categoria non mappata: {result.products.unmappedValidCategory}</p>
    </section>
  );
}

export function ImportSummary({ result, dryRunMode }) {
  return (
    <section>
      <h4>{result.ok
        ? (dryRunMode ? 'Simulazione completata' : 'Importazione completata')
        : 'Importazione completata con problemi'}</h4>
      <p>Prodotti letti: {result.read}</p>
      <p>Prodotti selezionati: {result.selected}</p>
      <p>Prodotti elaborati: {result.processed}</p>
      <p>Prodotti creati: {result.created}</p>
      <p>Prodotti aggiornati: {result.updated}</p>
      <p>Prodotti invariati: {result.unchanged}</p>
      <p>Operazioni simulate: {result.simulated}</p>
      <p>Errori: {result.errors}</p>
      <p>Avvisi EAN: {result.eanWarningsCount}</p>
      {result.uncertainSkus.length > 0 && (
        <div>
          <p>Operazioni con esito incerto:</p>
          <ul>{result.uncertainSkus.map(sku => <li key={sku}>{sku}</li>)}</ul>
        </div>
      )}
      {result.errorSkus.length > 0 && (
        <div>
          <p>Prodotti con errore:</p>
          <ul>{result.errorSkus.map(sku => <li key={sku}>{sku}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
