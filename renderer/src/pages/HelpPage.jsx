const topics = [
  ['Cercare un produttore', 'Dalla Panoramica cerca per nome, anche parziale, o per codice catalogo Vudoo.'],
  ['Caricare un catalogo', 'Seleziona Carica catalogo: i prodotti vengono letti dal feed Vudoo e mostrati in Prodotti.'],
  ['Modificare prodotti', 'Apri un prodotto, cambia i campi disponibili e salva. La scheda mostra i valori effettivi.'],
  ['Override Base.com', 'Gli override Base.com restano separati dai dati originali Vudoo e vengono usati per il relativo payload.'],
  ['Modifica massiva', 'Seleziona i prodotti e usa il Bulk Editor; controlla sempre l’anteprima prima di applicare gli override locali.'],
  ['Problemi', 'La pagina Problemi raccoglie i blocchi e gli avvisi già rilevati, con accesso al prodotto quando disponibile.'],
  ['Controlli preliminari', 'Esegui il preflight dalle Operazioni prima dell’importazione e verifica gli esiti.'],
  ['Modalità Reale / Simulazione', 'La modalità Simulazione prepara e verifica senza scrivere su Base.com. In Reale, l’importazione può modificare Base.com.'],
  ['Importare su Base.com', 'Dopo i controlli preliminari, avvia l’importazione dalla pagina Import / Operazioni con la modalità voluta.'],
  ['Inventory per produttore', 'L’associazione Inventory è gestita durante il caricamento del catalogo; Produttori mostra l’ID salvato localmente.'],
  ['Product Tags', 'Single e Bulk Editor salvano i tag nell’override locale. Il Tag Manager li verifica durante preflight/import.'],
  ['Diagnostica', 'La pagina Diagnostica espone i controlli disponibili per configurazione e collegamento Base.com.'],
];

export default function HelpPage() {
  return <div className="page-stack help-page"><div className="page-heading"><div><h1>Guida</h1>
    <p>Indicazioni essenziali per lavorare nel Vudoo Product Manager.</p></div></div>
    <section className="card"><div className="card-heading"><div><h2>Guida operativa</h2><p>Dal catalogo Vudoo all’importazione Base.com.</p></div></div>
      <div className="help-topics">{topics.map(([title, description]) => <div key={title}><h3>{title}</h3><p>{description}</p></div>)}</div>
    </section>
    <section className="card"><div className="card-heading"><div><h2>Documentazione tecnica</h2></div></div>
      <p>Vudoo → Product Manager → override locali → preflight → Base.com.</p>
      <p className="muted">Documentazione tecnica completa in preparazione.</p>
    </section>
  </div>;
}
