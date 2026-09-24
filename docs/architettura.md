# Architettura di Sistema

Questo documento descrive l'architettura dei componenti e il ruolo dei singoli file e moduli all'interno del progetto **Vudoo Base Connector**.

---

## 1. Panoramica della Struttura

Il progetto adotta un'architettura modulare, separando la CLI nella root, i moduli runtime in `src/` e le utility locali precedenti in `tools/legacy/`.

Il flusso principale recupera il catalogo XML remoto Vudoo, lo elabora in memoria e sincronizza i dati verso Base.com dopo normalizzazione, validazione, deduplicazione e preflight.

---

## 2. Moduli alla Radice

* **`cli.js`**: menu interattivo principale;
* **`check.js`**: diagnostica dell'ambiente e della configurazione;
* **`tools/legacy/`**: entry point versionati per conversione, import, sync e produttori basati sui file locali.

---

## 3. Moduli nella cartella `src/`

* **`src/baseApi.js`**: comunicazione con Base.com, selezione delle risorse, ricerca SKU, CREATE/UPDATE, rate limiting, retry delle letture e verifica delle scritture incerte;
* **`src/products.js`**: lettura prodotti, normalizzazione, validazione, deduplicazione e costruzione dei payload;
* **`src/preflight.js`**: controlli preliminari su configurazione, dati e risorse Base.com;
* **`src/categories.js`**: recupero, associazione e creazione controllata delle categorie;
* **`src/categoryNormalizer.js`**: validazione dei mapping, risoluzione supplier e conversione categoria sorgente → canonical → Base path;
* **`src/noNameReport.js`**: registro locale cumulativo dei prodotti con categoria sorgente mancante, separato dalle categorie reali non mappate;
* **`src/manufacturers.js`**: recupero, associazione e creazione controllata dei produttori;
* **`src/productor.js`**: sincronizzazione separata dei produttori usando la logica condivisa;
* **`src/converter.js`**: parsing XML e composizione del titolo condivisi dal runtime remoto e dal convertitore legacy;
* **`src/vudooXml.js`**: fetch, parsing e normalizzazione del catalogo remoto;
* **`src/vudooImport.js`**: preflight, produttori e import del catalogo remoto;
* **`src/vudooBaseFields.js`**: risoluzione read-only di Parameters e Additional Fields Base.com;
* **`src/importer.js`**: CREATE, UPDATE, SKIP e report;
* **`src/operations.js`**: orchestrazione delle operazioni richiamate dalla CLI;
* **`src/checker.js`**: controlli diagnostici;
* **`src/config.js`** e **`src/logger.js`**: configurazione e log condivisi.

---

## 4. Sicurezza e test

Le scritture passano dal gate centralizzato `DRY_RUN` in `src/baseApi.js`. Le letture temporaneamente fallite possono essere ritentate; le scritture con esito incerto vengono verificate senza retry ciechi.

La suite è contenuta in `tests/integration-review.test.js`, `tests/cli.test.js` e `tests/vudoo-xml.test.js`. Il file `tests/read-only-base.mjs` offre una guardia aggiuntiva per smoke test manuali read-only.
