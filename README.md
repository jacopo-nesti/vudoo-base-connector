# Vudoo Base Connector

## 📋 Descrizione del Progetto

**Vudoo Base Connector** è il progetto Node.js alla base di **Vudoo Product Manager V2**, l'app desktop Electron/React per consultare e preparare i cataloghi prodotto Vudoo e importarli in **Base.com**. Comprende normalizzazione e validazione dei dati, modifiche locali ai prodotti, aggiornamenti selettivi, gestione stock, protezioni API e test automatici. La CLI rimane disponibile per le operazioni supportate.

L'integrazione operativa dei prodotti passa da Base.com: le precedenti integrazioni dirette con i marketplace non fanno più parte del progetto. La sezione **Ordini (Beta)** permette di consultare in sola lettura un singolo ordine Base.com tramite ID.

## ⚙️ Requisiti Principali

Per eseguire e sviluppare il progetto sono necessari:

* **Node.js**: versione 22 o superiore;
* **npm**: gestore di pacchetti incluso con Node.js;
* un token API valido per **Base.com** per le funzioni che ne leggono o modificano i dati;
* accesso al feed remoto Vudoo per caricare i cataloghi;
* i file di configurazione locale necessari ai mapping, quando richiesti dal flusso usato.

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

Prima di usare le funzioni Base.com configura `BASE_API_TOKEN` e verifica `TEST_MODE` e `DRY_RUN` in `.env`. Gli ID di inventory e warehouse possono essere indicati quando serve una selezione esplicita; in loro assenza il progetto applica le verifiche previste sul catalogo predefinito e sulle risorse associate. I mapping locali delle categorie e dei fornitori, quando necessari, si trovano in `config/` e non sono distribuiti dal repository.

Per il dettaglio completo consulta la [Guida alla Configurazione](./docs/configurazione.md).

### Impostazioni dell'app desktop

La CLI continua a usare `.env`. L'app Electron carica `.env` all'avvio e poi applica le impostazioni salvate in `settings.json` nella directory dati standard dell'app (`app.getPath('userData')`). Il file rimane fuori dal repository e non contiene il token Base.com. Apri **Impostazioni** nella GUI per usare i valori predefiniti, personalizzare le opzioni o ripristinarle. Le modifiche salvate si applicano al core dopo il riavvio dell'app; la modalità simulazione mostrata durante la sessione indica sempre quella realmente attiva. Il ripristino elimina gli override e torna ai valori di `.env` o ai default applicativi. Valori `.env` non validi restano errori di configurazione del core finché non vengono corretti o sostituiti da impostazioni valide.

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
│   └── settingsManager.js
├── renderer/
│   └── src/
│       ├── components/
│       └── pages/
│           ├── CatalogPage.jsx
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
* **`renderer/src/`**: interfaccia del Product Manager per catalogo, produttori, problemi, operazioni, diagnostica e Ordini (Beta);
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
* **`src/orders/`**: lettura e normalizzazione degli ordini Base.com per la pagina Ordini (Beta);
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
Normalizzazione categorie e report completo
    ↓
Preflight: configurazione, metadati, inventory, price group e warehouse
    ↓
Confronto con Base.com
    ↓
CREATE / UPDATE selettivo / SKIP, secondo la modalità attiva
    ↓
Report finale
```

### 🗂️ Categorie canoniche

Quando è presente nella configurazione locale, `config/canonical-categories.json` definisce i percorsi Base delle categorie canoniche. I file in `config/suppliers/` associano i titoli pubblici dei feed ai profili fornitore e traducono le categorie sorgente in categorie canoniche. Questa directory non è più versionata: occorre predisporre i mapping necessari prima di usarli.

Il preflight elenca tutte le categorie sorgente reali e i relativi conteggi. I prodotti senza categoria, inclusa `No name > No name`, sono esclusi; quelli con `g:id` vengono registrati in `reports/no_name_products.json`, mentre quelli senza `g:id` sono conteggiati separatamente senza bloccare l'import. Per le categorie reali senza mapping, `UNMAPPED_CATEGORY_POLICY=block` mantiene il blocco sicuro predefinito, mentre `skip` importa soltanto i prodotti classificati e riporta separatamente quelli esclusi. Quando il mapping è disponibile, i livelli Base mancanti vengono creati dalla logica gerarchica esistente. Le associazioni ai marketplace vengono gestite in Base.com.

Consulta [Categorie canoniche](./docs/category-mappings.md) per aggiungere supplier e mapping senza usare o salvare il codice azienda.

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

Per avviare l'app desktop in sviluppo usa `npm run dev`; `npm run build` prepara il renderer e `npm run dist:win` crea il pacchetto portable Windows, se sono disponibili anche i file di configurazione locali richiesti dal packaging.

## 📦 Elenco Aggiornato dei Comandi npm

* `npm start`: apre la CLI interattiva;
* `npm run dev`: avvia renderer ed Electron in sviluppo;
* `npm run build`: genera il renderer;
* `npm run dist:win`: prepara il pacchetto portable Windows;
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

La suite corrente copre CLI, parsing, normalizzazione, stock, payload, CREATE/UPDATE/SKIP, DRY_RUN, categorie, produttori, catalogo e interfaccia desktop, oltre alla lettura degli ordini Base.com in Beta. Il numero dei test può variare con lo sviluppo.

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

Il Product Manager V2 usa già il feed remoto Vudoo per il catalogo prodotti e Base.com per le operazioni supportate. L'evoluzione riguarda il consolidamento dei flussi desktop e l'estensione graduale di **Ordini (Beta)**, oggi limitato alla consultazione in sola lettura di un ordine Base.com per ID. Ulteriori funzioni sugli ordini richiedono verifiche specifiche prima di essere considerate disponibili.

## 👥 Autori e contributi

Il progetto è stato ideato, progettato e coordinato da **Jacopo Nesti**, che ne ha curato anche lo sviluppo principale durante il periodo di stage.

Lo sviluppo è stato portato avanti con il supporto e i contributi del team di stagisti, che ha collaborato su attività specifiche, test, documentazione e miglioramenti del progetto.

### Contributors

- **Davide Baragli**
- **Leonardo Roschi**
- **Ian Cavini**
- **Hudson (WoodTrue)**
- **Grecia**
