# Vudoo Base Connector

## 📋 Descrizione del Progetto

**Vudoo Base Connector** è un progetto Node.js per la sincronizzazione dei cataloghi prodotto da Vudoo verso **Base.com**, con normalizzazione e validazione dei dati, aggiornamenti selettivi, gestione stock, protezioni API e test automatici.

## ⚙️ Requisiti Principali

Per eseguire e sviluppare il progetto sono necessari:

* **Node.js**: versione 22 o superiore;
* **npm**: gestore di pacchetti incluso con Node.js;
* un token API valido per **Base.com**;
* il feed XML Vudoo disponibile localmente come `VUDOO.xml`.

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

Il file `.env.example` rimane versionato; il file `.env` è locale e non deve contenere credenziali destinate al repository.

## ⚙️ Configurazione (`.env`)

Prima di avviare lo script configura almeno `BASE_API_TOKEN`, `TEST_MODE` e `DRY_RUN`. Gli ID di inventory e warehouse possono essere indicati quando serve una selezione esplicita; in loro assenza il progetto applica le verifiche previste sul catalogo predefinito e sulle risorse associate.

Per il dettaglio completo consulta la [Guida alla Configurazione](./docs/configurazione.md).

## 📂 Struttura Attuale delle Cartelle e dei Moduli

Il progetto è organizzato in modo modulare: la CLI è l'entry point principale, la logica runtime è in `src/` e le utility del precedente flusso locale sono in `tools/legacy/`:

```text
vudoo-base-connector/
├── cli.js
├── check.js
├── src/
│   ├── baseApi.js
│   ├── categories.js
│   ├── checker.js
│   ├── config.js
│   ├── converter.js
│   ├── importer.js
│   ├── logger.js
│   ├── manufacturers.js
│   ├── operations.js
│   ├── preflight.js
│   ├── productor.js
│   ├── products.js
│   ├── vudooBaseFields.js
│   ├── vudooImport.js
│   └── vudooXml.js
├── tools/
│   └── legacy/
│       ├── convert-json.js
│       ├── import-json.js
│       ├── productor-json.js
│       ├── sync-json.js
│       └── xml-to-json.js
├── tests/
│   ├── cli.test.js
│   ├── integration-review.test.js
│   └── read-only-base.mjs
├── docs/
├── .env.example
├── package.json
└── README.md
```

## 🛠️ Ruolo dei Principali File

### 1. Entry point e orchestrazione

* **`cli.js`**: apre il menu interattivo eseguito da `npm start`;
* **`check.js`**: verifica ambiente e configurazione;
* **`tools/legacy/`**: conserva conversione, import, sync e produttori basati sui file locali, separati dal normale flusso remoto.

### 2. Moduli applicativi (`src/`)

* **`src/baseApi.js`**: chiamate Base.com, inventory, gruppi prezzo, warehouse, ricerca SKU, CREATE/UPDATE, rate limiting ed esiti incerti;
* **`src/products.js`**: lettura JSON, normalizzazione, validazione, deduplicazione e payload prodotti;
* **`src/preflight.js`**: controlli preliminari prima dell'importazione;
* **`src/categories.js`** e **`src/manufacturers.js`**: associazione e creazione controllata di categorie e produttori;
* **`src/converter.js`**: parsing XML e composizione del titolo condivisi;
* **`src/vudooXml.js`** e **`src/vudooImport.js`**: fetch, parsing, normalizzazione e orchestrazione del catalogo remoto Vudoo;
* **`src/operations.js`**: operazioni condivise dalla CLI;
* **`src/checker.js`**, **`src/config.js`** e **`src/logger.js`**: diagnostica, configurazione e log.

## 🔄 Flusso Vudoo remoto → Base.com

```text
codiceAzienda inserito nella CLI
    ↓
GET ProductCatalog.ashx e parsing XML in memoria
    ↓
Normalizzazione e validazione prodotti
    ↓
Deduplicazione feed e ricerca SKU nell'inventory selezionato
    ↓
Preflight: configurazione, metadati, inventory, price group e warehouse
    ↓
Confronto con Base.com
    ↓
CREATE / UPDATE selettivo / SKIP
    ↓
Report finale
```

### 🛡️ Regole di Sicurezza, Validazione e Ottimizzazione

* **Aggiornamenti mirati:** vengono inviati soltanto i campi realmente cambiati;
* **SKU ambigui:** più prodotti Base.com con lo stesso SKU bloccano l'operazione senza scegliere arbitrariamente;
* **Deduplicazione:** i duplicati equivalenti nel feed vengono elaborati una sola volta; dati discordanti vengono segnalati;
* **Protezione `DRY_RUN`:** tutte le scritture Base.com sono bloccate centralmente;
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

Il comando apre il menu interattivo con verifica ambiente, preflight del catalogo remoto, sincronizzazione produttori, importazione prodotti e test automatici. Consulta [Modalità CLI](./docs/cli-modalita.md) per l'elenco aggiornato delle opzioni.

## 📦 Elenco Aggiornato dei Comandi npm

* `npm start`: apre la CLI interattiva;
* `npm run check`: verifica ambiente e configurazione;
* `npm run import`: utility legacy per importare `real_products.json`;
* `npm run convert`: utility legacy che converte `VUDOO.xml` in `real_products.json`;
* `npm run productor`: utility legacy per sincronizzare i produttori dal JSON locale;
* `npm run sync`: utility legacy XML → JSON → preflight → import;
* `npm test`: esegue la suite automatica.

Il comando `productor` resta separato dal sync perché l'importazione principale gestisce già i produttori mancanti.

## 🔍 Spiegazione di `DRY_RUN`

Con `DRY_RUN=true` il progetto esegue letture, normalizzazione, confronti e costruzione dei payload, ma blocca CREATE e UPDATE verso Base.com. Solo le utility legacy di conversione possono rigenerare localmente `real_products.json`.

## 🧪 Spiegazione di `TEST_MODE`

Con `TEST_MODE=true` viene selezionato un solo prodotto. Con `TEST_MODE=false` vengono elaborati tutti i prodotti deduplicati del catalogo remoto.

## 🧪 Test Automatici

Esegui la suite configurata con:

```bash
npm test
```

La suite corrente comprende **243 test** dedicati a CLI, parsing, normalizzazione, stock, payload, CREATE/UPDATE/SKIP, DRY_RUN, categorie, produttori, duplicati, Unicode, rate limiting ed esiti incerti.

## 📚 Link alla Documentazione Secondaria

* [Guida operativa](./docs/GUIDA.md)
* [Configurazione](./docs/configurazione.md)
* [Modalità CLI](./docs/cli-modalita.md)
* [Architettura del progetto](./docs/architettura.md)
* [Roadmap](./docs/ROADMAP.md)
* [Workflow Git](./docs/WORKFLOW.md)
* [Commit Guidelines](./docs/COMMIT_GUIDELINES.md)
* [Release Notes v1.1.0](./docs/RELEASE_NOTES_v1.1.0.md)

## 🚧 Evoluzione Prevista

L'evoluzione principale prevista è la sostituzione del passaggio manuale tramite XML con un'integrazione diretta ai dati o alle API Vudoo, mantenendo la normalizzazione e le protezioni Base.com già presenti.

## 👥 Autori e contributi

Il progetto è stato ideato, progettato e coordinato da **Jacopo Nesti**, che ne ha curato anche lo sviluppo principale durante il periodo di stage.

Lo sviluppo è stato portato avanti con il supporto e i contributi del team di stagisti, che ha collaborato su attività specifiche, test, documentazione e miglioramenti del progetto.

### Contributors

- **Davide Baragli** — sviluppo e miglioramenti tecnici
- **Leonardo Roschi** — sviluppo e attività di supporto
- **Ian Cavini** — sviluppo, documentazione e contributi al progetto
- **Hudson (WoodTrue)** — sviluppo e attività di manutenzione
- **Grecia** — sviluppo, test e attività di supporto
