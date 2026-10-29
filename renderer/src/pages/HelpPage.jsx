import { useState } from 'react';

const icons = {
  book: 'M4 4c3-1 5-1 8 1 3-2 5-2 8-1v16c-3-1-5-1-8 1-3-2-5-2-8-1V4Zm8 1v14', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 5 5',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4', list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  edit: 'M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4', check: 'M4 12l5 5L20 6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.3-2l2-1-2-3-2 1a7 7 0 0 0-3-2V3h-4v2a7 7 0 0 0-3 2l-2-1-2 3 2 1a7 7 0 0 0 0 4l-2 1 2 3 2-1a7 7 0 0 0 3 2v2h4v-2a7 7 0 0 0 3-2l2 1 2-3-2-1a7 7 0 0 0 .3-2Z',
  help: 'M9 9a3 3 0 1 1 5 2c-1 .7-2 1.2-2 2.5M12 17h.01M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  people: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 21v-2a8 8 0 0 1 16 0v2',
  layers: 'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8Z',
  receipt: 'M4 3h16v18l-4-2-4 2-4-2-4 2V3Zm4 5h8M8 12h8', pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
};
function Icon({ name, size = 20 }) { return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icons[name]} /></svg>; }

export const helpTabs = [['start', 'Inizia da qui', 'book'], ['functions', 'Funzioni', 'grid'], ['settings', 'Impostazioni', 'settings'], ['problems', 'Problemi comuni', 'help']];
export const helpSteps = [
  ['search', 'Cerca un produttore', 'Dalla Panoramica cerca per nome o codice catalogo Vudoo.'],
  ['upload', 'Carica il catalogo', 'Seleziona il produttore, carica il catalogo e attendi i prodotti.'],
  ['list', 'Controlla i prodotti', 'Verifica categoria, immagini, prezzo e stock degli articoli.'],
  ['edit', 'Modifica e salva', 'Modifica la scheda o usa il Bulk Editor su più prodotti.'],
  ['upload', 'Importa su Base.com', 'Controlla errori e avvisi in Operazioni, poi avvia l’importazione.'],
  ['check', 'Verifica il risultato', 'In Base.com apri Products → Product List nell’inventario usato.'],
];

const functions = [
  ['people', 'Produttori', 'Ritrova produttori e cataloghi già utilizzati.', 'Mostra le informazioni disponibili sui produttori e cataloghi usati. Puoi cercarli e ricaricarli senza ricordare ogni volta il codice Vudoo.'],
  ['layers', 'Prodotti', 'Cerca, controlla e modifica gli articoli.', 'La lista mostra i prodotti caricati. Usa ricerca, filtri, colonne configurabili e viste salvate. Apri una scheda per modificare categoria Base.com, immagini, prezzo e stock. Puoi selezionare più prodotti e usare il Bulk Editor. Le modifiche locali non cambiano i dati originali Vudoo.'],
  ['bolt', 'Operazioni', 'Controlla l’importazione e consulta l’esito.', 'Seleziona i prodotti e leggi errori e avvisi dei controlli preliminari. Simulazione prepara l’operazione senza modificare Base.com. Reale può creare o aggiornare: CREATE è la creazione di un prodotto nuovo; UPDATE è l’aggiornamento di un prodotto già presente. Al termine controlla il risultato.'],
  ['grid', 'Categorie', 'Gestisci le categorie reali di Base.com.', 'Le categorie visualizzate corrispondono alle categorie reali di Base.com. Puoi assegnare una categoria a un prodotto e l’assegnazione rimane salvata localmente. In modalità Reale, creazione, rinomina, spostamento ed eliminazione modificano direttamente Base.com. Eliminare può coinvolgere i prodotti contenuti: devi digitare ELIMINA per confermare.'],
  ['receipt', 'Ordini', 'Leggi gli ordini disponibili su Base.com.', 'Gli ordini vengono letti da Base.com: il gestionale mostra solo i dati ricevuti, senza inventare quelli mancanti. Se Base.com non riceve alcuni dati dell’acquirente dal marketplace, anche il gestionale non può visualizzarli. Quando necessario, completa prima i dati su Base.com usando le informazioni disponibili nel marketplace; saranno leggibili alla sincronizzazione successiva.'],
  ['pulse', 'Diagnostica', 'Controlla configurazione e collegamento.', 'Mostra le verifiche disponibili per configurazione, connessione Base.com, inventario e stati da controllare. Usa Diagnostica al primo avvio e quando Base.com non sembra raggiungibile.'],
];
const settings = [
  ['settings', 'Generali', 'Versione, modalità e stato dell’app.', 'Mostra la versione, la modalità operativa, il catalogo corrente, il numero di prodotti caricati, lo stato Base.com e il percorso dei dati locali.'],
  ['pulse', 'Tecniche', 'Tempi e dimensioni del caricamento.', 'Limite prodotti Vudoo: numero massimo di prodotti richiesti al catalogo; aumentarlo può richiedere più tempo e risorse. Timeout caricamento catalogo: tempo massimo di attesa della risposta; aumentalo se il catalogo o il collegamento sono lenti. Un valore troppo basso può interrompere il caricamento.'],
  ['layers', 'Catalogo e importazione', 'Prove e quantità automatiche.', 'Limite di prova: quando attivo elabora un solo prodotto; non cambia Reale o Simulazione. Stock automatico massimo: con valore 10, uno stock Vudoo di 50 viene inviato automaticamente come 10, mentre uno stock di 6 resta 6. La quantità modificata manualmente per Base.com ha precedenza.'],
  ['bolt', 'Base.com', 'Modalità, connessione e ritmo delle richieste.', 'Reale può modificare Base.com; Simulazione prepara e controlla senza scrivere. Il token si configura in Impostazioni → Base.com → Connessione API e il valore salvato non viene mostrato. Richieste Base.com al minuto limita il ritmo; Tentativi lettura Base.com riprova le letture fallite; Ritardo tra i tentativi regola l’attesa; Pausa dopo limite API fa attendere quando Base.com segnala troppe richieste.'],
  ['grid', 'Layout', 'Aspetto e densità dell’interfaccia.', 'Scegli tema Chiaro, Scuro o Sistema e colore accento. Puoi regolare densità, sidebar all’avvio, animazioni, dimensione del testo della tabella, angoli e righe per pagina.'],
  ['list', 'Colonne prodotti', 'Personalizza tabella e viste.', 'Mostra o nascondi colonne, cambiane l’ordine, fissale, regolane la larghezza e scegli l’ordinamento. Puoi usare viste salvate o ripristinare i valori predefiniti.'],
  ['settings', 'Avanzate', 'Dati locali e preferenze visive.', 'Puoi vedere, copiare o aprire il percorso dei dati locali. Ripristina preferenze interfaccia riporta tema, accento, densità e altre scelte visive ai valori iniziali senza modificare prodotti o dati Base.com.'],
];
const problems = [
  ['search', 'Il catalogo non si carica', 'Controlla produttore, codice e attesa.', 'Verifica produttore o codice catalogo e attendi il completamento. Se termina troppo presto, controlla Timeout caricamento catalogo in Impostazioni → Tecniche. Se il problema riguarda Base.com, apri Diagnostica.'],
  ['pulse', 'Base.com non risponde', 'Verifica token e connessione.', 'Apri Impostazioni → Base.com, controlla il token e usa Verifica connessione. Poi consulta Diagnostica.'],
  ['grid', 'Un prodotto non ha categoria', 'Scegli una categoria dalla scheda.', 'Apri il prodotto, vai in Classificazione e scegli la categoria Base.com appropriata.'],
  ['bolt', 'L’importazione non procede', 'Controlla errori e modalità.', 'In Operazioni leggi errori e avvisi dei controlli preliminari. Verifica modalità operativa e connessione Base.com, correggi i problemi e riprova.'],
  ['receipt', 'Gli ordini non mostrano i dati cliente', 'Potrebbero mancare già su Base.com.', 'Il gestionale visualizza solo i dati resi disponibili da Base.com. Se il marketplace non li ha trasmessi, completali prima su Base.com usando le informazioni disponibili e sincronizza di nuovo gli ordini.'],
  ['layers', 'Prezzo o stock non sono quelli attesi', 'Confronta valori locali e risultato.', 'Apri la scheda prodotto e controlla il valore destinato a Base.com, le modifiche manuali e Stock automatico massimo in Impostazioni. Confronta il risultato dell’importazione.'],
];

function Accordion({ items, initialItem }) {
  const [open, setOpen] = useState(() => initialItem ? items.findIndex(([, title]) => title === initialItem) : null);
  return <div className="help-accordion">{items.map(([icon, title, summary, detail], index) => <article className={`help-accordion-item${open === index ? ' is-open' : ''}`} key={title}>
    <h3><button type="button" aria-expanded={open === index} aria-controls={`help-detail-${index}`} onClick={() => setOpen(open === index ? null : index)}><span className="help-mini-icon"><Icon name={icon} size={18} /></span><span className="help-accordion-label"><strong>{title}</strong><small>{summary}</small></span><span className="help-chevron" aria-hidden="true">⌄</span></button></h3>
    {open === index && <div className="help-accordion-detail" id={`help-detail-${index}`}><p>{detail}</p></div>}
  </article>)}</div>;
}
function Reference({ title, description, icon, items, initialItem }) { return <section className="help-reference"><header><span className="help-panel-icon"><Icon name={icon} /></span><div><h2>{title}</h2><p>{description}</p></div></header><Accordion items={items} initialItem={initialItem} /></section>; }
function Start({ onTab }) { return <>
  <div className="help-start-grid"><section className="help-workflow"><header><h2>Il tuo primo import</h2><p>Segui questi passaggi per portare un prodotto da Vudoo a Base.com.</p></header><ol className="help-steps">{helpSteps.map(([icon, title, detail], index) => <li key={title}><div className="help-step"><span className="help-step-number">{index + 1}</span><span className={`help-step-icon help-step-icon--${index + 1}`}><Icon name={icon} size={25} /></span><h3>{title}</h3><p>{detail}</p></div></li>)}</ol><p className="help-workflow-note">I produttori già usati restano in Produttori; dopo il caricamento gli articoli sono in Prodotti. Simulazione non modifica Base.com; Reale può creare o aggiornare.</p></section>
    <aside className="help-side"><section className="help-after"><div className="help-after-art" aria-hidden="true"><div className="help-art-window"><span>● ● ●</span><strong>Base.com</strong></div><span className="help-art-check"><Icon name="check" size={27} /></span></div><h2>Dopo l'importazione</h2><p>Vai su Base.com → Products → Product List e seleziona l’inventario utilizzato per visualizzare i prodotti creati o aggiornati.</p></section><section className="help-tips"><h2><Icon name="help" size={19} /> Suggerimenti rapidi</h2><ul><li>Controlla la modalità Reale o Simulazione prima di importare.</li><li>Usa Diagnostica al primo avvio o se Base.com non risponde.</li><li>Usa Categorie per assegnare le categorie Base.com.</li><li>Configura i parametri disponibili in Impostazioni.</li></ul></section></aside></div>
  <div className="help-preview-grid">{[['Funzioni', 'Scopri le sezioni del gestionale.', 'functions', functions, 'grid'], ['Impostazioni', 'Capisci quando cambiare un parametro.', 'settings', settings, 'settings'], ['Problemi comuni', 'Trova una soluzione alle difficoltà più frequenti.', 'problems', problems, 'help']].map(([title, summary, tab, items, icon]) => <section className="help-preview" key={tab}><button type="button" className="help-preview-heading" onClick={() => onTab(tab)}><span className="help-panel-icon"><Icon name={icon} /></span><span><strong>{title}</strong><small>{summary}</small></span><span aria-hidden="true">›</span></button><div className="help-preview-list">{items.map(([itemIcon, name, description]) => <button type="button" key={name} onClick={() => onTab(tab, name)}><span className="help-mini-icon"><Icon name={itemIcon} size={16} /></span><strong>{name}</strong><small>{description}</small><span aria-hidden="true">›</span></button>)}</div></section>)}</div>
  </>; }

export default function HelpPage() { const [tab, setTab] = useState('start'); const [selectedItem, setSelectedItem] = useState(null); const changeTab = (next, item = null) => { setSelectedItem(item); setTab(next); }; return <div className="page-stack help-page"><div className="page-heading"><div><h1>Guida</h1><p>Percorso operativo e spiegazioni chiare per usare Vudoo Product Manager.</p></div></div><nav className="help-tabs" aria-label="Sezioni della guida">{helpTabs.map(([id, label, icon]) => <button type="button" key={id} className={tab === id ? 'is-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => changeTab(id)}><Icon name={icon} size={19} />{label}</button>)}</nav>
  {tab === 'start' && <Start onTab={changeTab} />}{tab === 'functions' && <Reference key={`${tab}-${selectedItem}`} title="Funzioni" description="Scopri cosa puoi fare in ogni sezione." icon="grid" items={functions} initialItem={selectedItem} />}{tab === 'settings' && <Reference key={`${tab}-${selectedItem}`} title="Impostazioni" description="Capisci che cosa cambia quando regoli le preferenze." icon="settings" items={settings} initialItem={selectedItem} />}{tab === 'problems' && <Reference key={`${tab}-${selectedItem}`} title="Problemi comuni" description="Trova una risposta alle situazioni più frequenti." icon="help" items={problems} initialItem={selectedItem} />}
  </div>; }
