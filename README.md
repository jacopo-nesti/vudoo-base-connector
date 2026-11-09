# Vudoo Base Connector

## 📋 Descrizione del Progetto

**Vudoo Product Manager 1.4.0** è un'applicazione desktop Windows basata su Electron, React e Node.js. Carica cataloghi prodotto dal feed Vudoo, permette di controllare e modificare localmente i dati e prepara l'importazione in **Base.com**. Il repository, denominato `vudoo-base-connector`, comprende anche una CLI e la logica condivisa di normalizzazione, preflight e importazione.

La sezione **Ordini (Beta)** legge gli ordini da Base.com, li sincronizza in un archivio SQLite locale e consente di cercarli e consultarli. Non invia automaticamente gli ordini al gestionale Vudoo. Le integrazioni dirette con altri marketplace non fanno parte dell'applicazione attuale.

## ⚙️ Requisiti Principali

Per sviluppare o avviare il progetto dal sorgente sono necessari:

* **Node.js**: versione 22 o superiore;
* **npm**: gestore di pacchetti incluso con Node.js;
* un token API valido per **Base.com** per le funzioni che ne leggono o modificano i dati;
* accesso al feed remoto Vudoo per caricare i cataloghi;
* i file di configurazione locale necessari ai mapping, quando richiesti dal flusso usato.

Gli eseguibili Windows includono il runtime: sul PC dell'operatore non è richiesta un'installazione separata di Node.js.

## 📥 Installazione

Clona il repository e installa le dipendenze locali:

```bash
git clone https://github.com/jacopo-nesti/vudoo-base-connector.git
cd vudoo-base-connector
npm install
```

Copia il file di configurazione di esempio senza eliminarlo o rinominarlo:

```powershell
Copy-Item .env.example .env
```

Su macOS o Linux:

```bash
cp .env.example .env
```

Il file `.env.example` rimane versionato; il file `.env` è locale e non deve contenere credenziali destinate al repository. Anche `config/` e `tools/legacy/` sono esclusi dal versionamento: una nuova copia del repository non li contiene e gli eventuali file locali necessari vanno predisposti separatamente. Non includere token o configurazioni riservate nei commit.

## ⚙️ Configurazione (`.env`)

Prima di usare le funzioni Base.com configura `BASE_API_TOKEN` e verifica `TEST_MODE` e `DRY_RUN` in `.env`. Nell'app desktop il token può anche essere inserito, sostituito o rimosso da **Impostazioni → Base.com**: il valore viene salvato nel file `.env` locale, senza essere mostrato nuovamente nell'interfaccia. Gli ID di inventory e warehouse possono essere indicati quando serve una selezione esplicita; altrimenti intervengono i controlli sulle risorse disponibili. I mapping locali, quando necessari, si trovano in `config/` e non sono distribuiti dal repository.

Per il dettaglio completo consulta la [Guida alla Configurazione](./docs/configurazione.md).

### Impostazioni dell'app desktop

La CLI legge `.env` nella radice del progetto. L'app Electron lo legge nella radice durante lo sviluppo, accanto all'eseguibile **portable** oppure nella directory dati dell'app (`app.getPath('userData')`) quando è installata. Le altre impostazioni persistono in `settings.json` nella stessa directory dati e non contengono il token Base.com. La modalità **Simulazione/Reale** è visibile nell'interfaccia; le impostazioni che richiedono un riavvio lo segnalano. Il ripristino delle impostazioni torna ai valori di `.env` o ai default applicativi.

## 📂 Struttura Attuale delle Cartelle e dei Moduli

Il progetto è organizzato in modo modulare: l'app desktop usa `electron/` e `renderer/`, la CLI resta in `cli.js` e la logica condivisa è in `src/`. La struttura seguente mostra le parti principali versionate:

```text
vudoo-base-connector/
├── cli.js
├── check.js
├── electron/
│   ├── main.js
│   ├── preload.cjs
│   ├── productOverrides.js
│   ├── manualProductImages.js
│   ├── orderStore.js
│   └── settingsManager.js
├── renderer/
│   └── src/
│       ├── components/
│       └── pages/
│           ├── CatalogPage.jsx
│           ├── BaseCategoriesPage.jsx
│           ├── OperationsPage.jsx
│           ├── OrdersBetaPage.jsx
│           └── ProblemsPage.jsx
├── src/
│   ├── baseApi.js
│   ├── categoryNormalizer.js
│   ├── importer.js
│   ├── preflight.js
│   ├── products.js
│   ├── marketplaces/base/localPreview.js
│   └── orders/
│       ├── baseOrderReader.js
│       ├── orderSync.js
│       └── orderModel.js
├── tests/
├── docs/
├── .env.example
├── package.json
└── README.md
```

Le directory locali `config/` e `tools/legacy/`, se presenti, sono ignorate da Git e non compaiono nella struttura versionata.

## 🛠️ Ruolo dei Principali File

### 1. Entry point e orchestrazione

* **`electron/main.js`** e **`electron/preload.cjs`**: avvio dell'app desktop e collegamento controllato tra interfaccia e core;
* **`renderer/src/`**: interfaccia per panoramica, produttori, prodotti, categorie Base.com, operazioni, ordini, diagnostica, impostazioni e guida; include ricerca, filtri, viste salvate, colonne configurabili, modifica singola e massiva e pannello ispettore;
* **`cli.js`**: apre il menu interattivo eseguito da `npm start`;
* **`check.js`**: verifica ambiente e configurazione;
* **`tools/legacy/`**, se presente localmente: raccoglie le utility del precedente flusso basato su file; non è più versionata.

### 2. Moduli applicativi (`src/`)

* **`src/baseApi.js`**: chiamate Base.com, inventory, gruppi prezzo, warehouse, ricerca SKU, CREATE/UPDATE, rate limiting ed esiti incerti;
* **`src/products.js`**: normalizzazione, validazione, deduplicazione e payload prodotti;
* **`src/preflight.js`**: controlli preliminari prima dell'importazione;
* **`src/categories.js`** e **`src/manufacturers.js`**: associazione e creazione controllata di categorie e produttori;
* **`src/categoryNormalizer.js`**: risoluzione del supplier e mapping categoria sorgente → canonical → Base path;
* **`src/converter.js`**: parsing XML e composizione del titolo condivisi;
* **`src/vudooXml.js`** e **`src/vudooImport.js`**: fetch, parsing, normalizzazione e orchestrazione del catalogo remoto Vudoo;
* **`src/marketplaces/base/localPreview.js`**: anteprima e controlli locali dei dati destinati a Base.com;
* **`src/orders/`** ed **`electron/orderStore.js`**: lettura, normalizzazione e sincronizzazione degli ordini Base.com, con consultazione dell'archivio SQLite locale;
* **`src/operations.js`**: operazioni condivise dalla CLI;
* **`src/checker.js`**, **`src/config.js`** e **`src/logger.js`**: diagnostica, configurazione e log.

## 🔄 Flusso Vudoo remoto → Base.com

```text
Catalogo Vudoo caricato nel Product Manager o tramite CLI
    ↓
GET ProductCatalog.ashx e parsing XML in memoria
    ↓
Consultazione e selezione facoltativa dei prodotti
    ↓
Normalizzazione, validazione e override locali
    ↓
Deduplicazione feed e ricerca SKU nell'inventory selezionato
    ↓
Risoluzione della categoria Base.com, quando disponibile
    ↓
Preflight: configurazione, metadati, inventory, price group e warehouse
    ↓
Confronto con Base.com
    ↓
CREATE / UPDATE selettivo / SKIP, secondo la modalità attiva
    ↓
Report finale
```

### 🗂️ Categorie Base.com e mapping

Nel Product Manager si può assegnare manualmente una categoria Base.com a un prodotto o salvare un mapping locale fra categoria Vudoo e categoria Base.com. La pagina **Categorie** legge l'albero da Base.com e, in modalità Reale e con conferme dedicate, espone creazione, modifica/spostamento ed eliminazione. La categoria scelta viene verificata rispetto all'albero corrente. Se non è disponibile una categoria valida, il preflight locale produce un warning e il payload omette `category_id`: la categoria non è un blocker locale per l'importazione. L'accettazione effettiva di un prodotto privo di `category_id` dipende dalla risposta dell'API Base.com.

La CLI conserva anche il percorso storico di categorie canoniche: `config/canonical-categories.json` e i profili in `config/suppliers/` traducono le categorie del feed quando sono presenti. In quel percorso `UNMAPPED_CATEGORY_POLICY` governa il trattamento delle categorie sorgente non mappate; non va confuso con la regola della categoria Base.com opzionale nel Product Manager. `config/` è esclusa da Git e va predisposta localmente quando richiesta.

Consulta [Categorie canoniche](./docs/category-mappings.md) per aggiungere supplier e mapping senza usare o salvare il codice azienda.

### 🖼️ Immagini dei prodotti

La scheda prodotto mostra gli URL immagine disponibili nel catalogo Vudoo e le eventuali immagini già presenti su Base.com. L'operatore può aggiungere file JPG/PNG come immagini manuali: sono validati e conservati nella directory dati locale, separati dal feed Vudoo. La loro aggiunta non modifica subito Base.com; le immagini locali ancora da inviare vengono preparate per il successivo import del prodotto. La rimozione di un'immagine manuale locale non cancella fotografie già presenti su Base.com.

### 📦 Ordini Base.com (Beta)

L'app può leggere un ordine per ID oppure avviare una sincronizzazione di sola lettura tramite `getOrders`, includendo anche gli ordini non confermati. I dati normalizzati vengono salvati in un database SQLite locale nella directory dati dell'app. La pagina offre elenco paginato, ricerca e filtri per data, origine, stato, importo pagato e completezza; il dettaglio distingue spedizione e fatturazione e segnala i dati provvisori degli ordini non confermati. La sincronizzazione non crea né aggiorna ordini in Base.com e non li trasferisce a Vudoo.

### 🛡️ Regole di Sicurezza, Validazione e Ottimizzazione

* **Aggiornamenti mirati:** vengono inviati soltanto i campi realmente cambiati;
* **Override locali:** le modifiche nel Product Manager restano separate dai dati originali Vudoo e vengono verificate prima dell'importazione;
* **SKU ambigui:** più prodotti Base.com con lo stesso SKU bloccano l'operazione senza scegliere arbitrariamente;
* **Deduplicazione:** i duplicati equivalenti nel feed vengono elaborati una sola volta; dati discordanti vengono segnalati;
* **Protezione `DRY_RUN`:** le scritture Base.com sono bloccate centralmente in modalità simulazione;
* **Sanitizzazione Unicode:** i testi destinati a Base.com vengono privati dei caratteri non-BMP incompatibili, preservando i normali caratteri Unicode supportati;
* **Rate limiting adattivo:** le richieste condividono una finestra mobile e rallentano quando si avvicinano alle soglie configurate;
* **Retry controllati:** soltanto le letture con errori temporanei vengono ritentate in modo limitato;
* **Scritture incerte:** CREATE e UPDATE non vengono ripetuti alla cieca; lo stato viene verificato tramite SKU o product ID e gli SKU non confermabili vengono riportati separatamente;
* **Smoke test read-only:** `tests/read-only-base.mjs` può essere usato come protezione aggiuntiva durante verifiche manuali verso Base.com.

### 📦 Gestione dello stock

La quantità numerica ricevuta dalla sorgente viene mantenuta, anche quando supera 10. Se manca una quantità numerica valida, `availability` viene usato come fallback:

* `in stock` → quantità `10`;
* `out of stock` → quantità `0`.

Il valore `10` è un default operativo, non un limite massimo. Lo stock viene associato al warehouse valido dell'inventory selezionato; se è già uguale al valore desiderato non viene generato un UPDATE inutile.

## 💻 Utilizzo della CLI

```bash
npm start
```

Il comando apre il menu interattivo con verifica ambiente, preflight del catalogo remoto, sincronizzazione produttori, importazione completa o selettiva e test automatici. La CLI chiede il codice azienda e mostra i valori di fetch configurati, senza chiedere né modificare limite o timeout a ogni esecuzione. Il runtime legge `.env`; `.env.example` è solo un template versionato da copiare, non viene letto automaticamente. `VUDOO_RESULTS_LIMIT` usa il default applicativo `3000` e `VUDOO_TIMEOUT_MS` usa `90000` ms: sono valori operativi, non garantiscono la completezza del catalogo. L'import completo elabora tutti i prodotti ricevuti; quello selettivo permette di scegliere localmente per categoria, codice o parola chiave, consultare l'intera selezione a pagine e rimuovere prodotti per `g:id` o `g:sku`. In caso di timeout l'operazione si ferma prima del preflight Base.com. Consulta [Modalità CLI](./docs/cli-modalita.md) per i dettagli.

Per avviare l'app desktop in sviluppo usa `npm run dev`; `npm run build` prepara il renderer. `npm run dist:win` genera due artefatti Windows x64 in `release/`: **Vudoo Product Manager Setup 1.4.0.exe** (installer NSIS guidato) e **Vudoo-Base-Connector-1.4.0-portable-x64.exe**. Il packaging richiede anche i file locali di configurazione inclusi nelle risorse della build. `release/.env.example` è solo un modello senza credenziali: il token reale deve restare nel `.env` locale dell'operatore. La configurazione NSIS non elimina la directory dati dell'app durante la disinstallazione; l'installazione e la disinstallazione su un altro PC richiedono comunque una verifica manuale.

## 📦 Elenco Aggiornato dei Comandi npm

* `npm start`: apre la CLI interattiva;
* `npm run dev`: avvia renderer ed Electron in sviluppo;
* `npm run build`: genera il renderer;
* `npm run dist:win`: genera installer NSIS e portable Windows x64;
* `npm run check`: verifica ambiente e configurazione;
* `npm test`: esegue la suite automatica.

Nel `package.json` rimangono i comandi storici `import`, `convert`, `productor` e `sync`, che puntano a `tools/legacy/`. Poiché la directory non è più versionata, questi comandi non sono disponibili in una nuova copia del repository senza le utility locali.

## 🔍 Spiegazione di `DRY_RUN`

Con `DRY_RUN=true` il progetto esegue letture, normalizzazione, confronti e costruzione dei payload, ma blocca CREATE e UPDATE verso Base.com. Nell'app desktop la modalità attiva è mostrata come **Simulazione** o **Reale**; verifica sempre questa indicazione prima di avviare un'importazione.

## 🧪 Spiegazione di `TEST_MODE`

Con `TEST_MODE=true` viene selezionato un solo prodotto. Con `TEST_MODE=false` vengono elaborati tutti i prodotti deduplicati del catalogo remoto nel flusso interessato.

## 🧪 Test Automatici

Esegui la suite configurata con:

```bash
npm test
```

La suite configurata copre CLI, parsing e normalizzazione, stock, payload, CREATE/UPDATE/SKIP simulati, DRY_RUN, categorie, produttori, catalogo, interfaccia desktop, ordini e packaging. Il numero dei test può variare con lo sviluppo; questa sezione descrive la copertura prevista dai file di test, non attesta l'esito di una specifica esecuzione.

## 📚 Link alla Documentazione Secondaria

* [Guida operativa](./docs/GUIDA.md)
* [Configurazione](./docs/configurazione.md)
* [Categorie canoniche](./docs/category-mappings.md)
* [Modalità CLI](./docs/cli-modalita.md)
* [Architettura del progetto](./docs/architettura.md)
* [Roadmap](./docs/ROADMAP.md)
* [Workflow Git](./docs/WORKFLOW.md)
* [Commit Guidelines](./docs/COMMIT_GUIDELINES.md)

Alcuni documenti descrivono fasi precedenti del progetto e vanno letti tenendo conto dell'attuale Product Manager V2.

## 🚧 Evoluzione Prevista

Il Product Manager usa già il feed remoto Vudoo e le operazioni Base.com descritte sopra. Restano sviluppi futuri, da non considerare funzioni operative, eventuali estensioni del flusso ordini oltre alla lettura/sincronizzazione locale e altre integrazioni marketplace. Il repository non implementa l'invio automatico degli ordini al gestionale Vudoo.

## 👥 Autori e contributi

**Jacopo Nesti** ha curato progettazione, analisi dei requisiti, specifiche, coordinamento, revisione, test, debugging e workflow Git/GitHub durante il periodo di stage. Lo sviluppo si è avvalso anche di strumenti AI/Codex: il repository documenta il risultato software e la cronologia Git, non la quota di codice scritta manualmente da ciascuna persona.

Lo sviluppo è stato portato avanti con il supporto e i contributi del team di stagisti, che ha collaborato su attività specifiche, test, documentazione e miglioramenti del progetto.

### Contributors

- **Davide Baragli**
- **Leonardo Roschi**
- **Ian Cavini**
- **Hudson (WoodTrue)**
- **Grecia**
