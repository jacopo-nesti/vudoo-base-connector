# Manuale operativo — Importazione catalogo Vudoo → Base.com

Questo script permette di importare un catalogo prodotti da **Vudoo** a **Base.com**.

## Flusso attuale

```text
CLI → codiceAzienda
        ↓
Catalogo XML remoto
        ↓
Parsing, normalizzazione e preflight in memoria
        ↓
Confronto SKU → CREATE / UPDATE / SKIP
        ↓
API Base.com
        ↓
Catalogo Base.com
```

---

# 1. Requisiti

Sul PC devono essere installati:

```text
Node.js >= 22
npm
VS Code
```

`npm` viene installato insieme a Node.js.

Verifica dal terminale:

```bash
node -v
npm -v
```

Se entrambi restituiscono una versione, puoi procedere.

---

# 2. Apri il progetto

Apri la cartella del progetto con VS Code:

```text
File → Open Folder
```

Poi apri il terminale integrato:

```text
Terminal → New Terminal
```

---

# 3. Installa le dipendenze

La prima volta che utilizzi il progetto esegui:

```bash
npm install
```

Questo comando installa le dipendenze indicate nel `package.json`.

Attualmente il progetto utilizza:

```text
fast-xml-parser
```

Non è necessario ripetere `npm install` a ogni avvio.

Va rieseguito principalmente:

- dopo aver clonato/coperto il progetto su un nuovo PC;
- quando vengono aggiunte o modificate dipendenze.

---

# 4. Configura `.env`

Nel progetto è presente:

```text
.env.example
```

Questo file contiene le variabili necessarie allo script, ma **non contiene credenziali reali**.

Esempio:

```env
BASE_API_TOKEN=
BASE_INVENTORY_ID=
BASE_WAREHOUSE_ID=
TEST_MODE=true
DRY_RUN=true
```

Crea una copia di:

```text
.env.example
```

e rinominala:

```text
.env
```

Lo script utilizzerà il file `.env` locale.

---

## `BASE_API_TOKEN`

Inserisci un token API Base.com valido:

```env
BASE_API_TOKEN=INSERISCI_TOKEN_BASE
```

Ogni collaboratore dovrebbe utilizzare, quando possibile, il proprio token API.

```text
Collaboratore A → proprio .env → proprio token
Collaboratore B → proprio .env → proprio token
Collaboratore C → proprio .env → proprio token
```

Il token:

- non deve essere inserito nella repository;
- non deve essere scritto in `.env.example`;
- non deve essere condiviso dentro file versionati.

Se un token viene accidentalmente pubblicato o inserito nella cronologia Git, deve essere sostituito/revocato.

---

## `BASE_INVENTORY_ID`

Indica l'inventory Base.com nel quale verranno importati i prodotti.

Se vuoi selezionare esplicitamente un inventory:

```env
BASE_INVENTORY_ID=ID_INVENTORY
```

Lo script verifica tramite API che l'inventory esista e recupera automaticamente il gruppo prezzi associato.

---

## `BASE_WAREHOUSE_ID`

Indica il warehouse Base.com da utilizzare quando è necessario gestire quantità di stock.

```env
BASE_WAREHOUSE_ID=
```

Il warehouse è necessario anche quando la quantità viene ricavata da `availability`. Lo script verifica tramite API che appartenga all'inventory selezionato; non vengono usati ID hardcoded.

---

## `TEST_MODE`

Decide **quanti prodotti vengono processati**.

```env
TEST_MODE=true
```

→ processa solamente il primo prodotto.

```env
TEST_MODE=false
```

→ processa tutti i prodotti.

---

## `DRY_RUN`

Decide **se effettuare realmente modifiche su Base.com**.

```env
DRY_RUN=true
```

→ esegue controlli e genera il payload, ma **non crea né aggiorna risorse su Base.com**.

```env
DRY_RUN=false
```

→ esegue realmente le chiamate API e può creare prodotti su Base.com.

---

## Sicurezza `.env`

Il file:

```text
.env
```

contiene dati sensibili e **non deve essere caricato su GitHub**.

Nel `.gitignore` deve essere presente:

```gitignore
.env
```

Il file:

```text
.env.example
```

deve invece rimanere nella repository.

```text
.env.example → GitHub ✅
.env         → GitHub ❌
```

---

# 5. Usa il catalogo remoto Vudoo

Avvia la CLI:

```bash
npm start
```

Le operazioni sul catalogo remoto chiedono ogni volta il `codiceAzienda`. Il codice viene usato per la singola richiesta e non viene salvato.

Il flusso principale recupera il catalogo XML da Vudoo, lo analizza e lo normalizza in memoria. Non richiede `VUDOO.xml` o `real_products.json`.

---

# 6. Verifica ambiente e configurazione

Seleziona la voce `0` della CLI oppure esegui:

```bash
npm run check
```

Il controllo verifica configurazione, rate limiter e risorse Base.com tramite sole letture.

---

# 7. Preflight catalogo Vudoo

Seleziona la voce `1`, quindi inserisci il codice azienda.

Il preflight esegue:

```text
fetch XML remoto
→ parsing e normalizzazione
→ validazione e deduplicazione
→ report e normalizzazione categorie canoniche
→ verifica inventory, price group e warehouse
→ verifica Parameters e Additional Fields
```

Non crea o aggiorna prodotti. Mostra tutte le categorie sorgente reali e quanti prodotti sono senza categoria. Un supplier non configurato produce una bozza in `config/suppliers/` e blocca l'import finché i mapping non sono completati. I prodotti senza categoria, inclusa `No name > No name`, sono sempre esclusi: quelli con `g:id` vengono registrati in `reports/no_name_products.json`, quelli senza `g:id` sono conteggiati separatamente. Le categorie reali senza mapping seguono `UNMAPPED_CATEGORY_POLICY`: `block` interrompe l'operazione, `skip` continua soltanto con i prodotti classificati e riporta gli esclusi. Consulta [Categorie canoniche](./category-mappings.md).

---

# 8. Sincronizza produttori

La voce `2` recupera il catalogo remoto e sincronizza i produttori effettivamente presenti usando la logica Base.com condivisa.

Con `DRY_RUN=true` le eventuali creazioni rimangono simulate.

---

# 9. Primo test — Nessuna scrittura su Base.com

Configura:

```env
TEST_MODE=true
DRY_RUN=true
```

Avvia `npm start`, scegli la voce `3` e inserisci il codice azienda.

Viene selezionato un prodotto dopo la validazione completa del catalogo; il payload viene costruito, ma nessuna scrittura viene inviata a Base.com.

---

# 10. Importazione di un prodotto

Dopo aver verificato il DRY_RUN, configura:

```env
TEST_MODE=true
DRY_RUN=false
```

Avvia nuovamente la voce `3`. Viene elaborato realmente un solo prodotto.

---

# 11. Importazione completa

Quando il test sul singolo prodotto è corretto, configura:

```env
TEST_MODE=false
DRY_RUN=false
```

La voce `3` elabora tutti i prodotti validi e deduplicati del catalogo remoto.

Le utility locali precedenti restano disponibili in `tools/legacy/` tramite `npm run convert`, `npm run import`, `npm run productor` e `npm run sync`.

---
# Controllo duplicati

Prima di creare un prodotto, lo script controlla se lo stesso SKU è già presente nell'inventory Base.com selezionato.

Flusso:

```text
Prodotto
    ↓
SKU
    ↓
Ricerca su Base.com
    ↓
SKU presente?
├── SÌ → confronto → UPDATE oppure SKIPPED
└── NO → CREATE
```

Se lo SKU esiste e i dati sono invariati:

```text
SKIPPED
```

Il prodotto non viene creato nuovamente.

Se lo SKU non esiste, viene effettuata normalmente l'importazione.

Il controllo viene effettuato esclusivamente nell'inventory specificato in:

```env
BASE_INVENTORY_ID=
```

Questo permette di rilanciare lo script senza creare duplicati dello stesso SKU.

Se lo SKU esiste, il prodotto viene confrontato con Base.com: i campi modificati generano un UPDATE selettivo, mentre un prodotto invariato viene saltato. Se lo stesso SKU identifica più prodotti Base.com, l'operazione viene bloccata come ambigua.

---

# Stati principali

## `SUCCESS`

Il prodotto è stato creato correttamente su Base.com.

## `SKIPPED`

Il prodotto possiede uno SKU già presente nell'inventory selezionato e non presenta modifiche da inviare.

## `ERROR`

Si è verificato un errore durante elaborazione, controllo o invio.

L'errore di un singolo prodotto non blocca necessariamente l'elaborazione degli altri.

## `DRY_RUN`

Il prodotto è stato controllato e il payload è stato generato, ma non è stato inviato a Base.com.

---

# Configurazioni rapide

## Controlla 1 prodotto senza importare

```env
TEST_MODE=true
DRY_RUN=true
```

## Importa realmente 1 prodotto

```env
TEST_MODE=true
DRY_RUN=false
```

## Controlla tutto il catalogo senza importare

```env
TEST_MODE=false
DRY_RUN=true
```

## Importa realmente tutto il catalogo

```env
TEST_MODE=false
DRY_RUN=false
```

---

# Gestione stock

La quantità numerica presente nel prodotto viene mantenuta, anche se superiore a 10. Quando la quantità manca, è `null` o è una stringa vuota, viene usata `availability`:

```text
in stock → 10
out of stock → 0
```

Il valore 10 è un fallback operativo, non una quantità massima. Lo stock viene associato al warehouse verificato dell'inventory selezionato. Se il valore su Base.com è già corretto non viene inviato un UPDATE stock.

---

# Comandi principali

## Installazione dipendenze

```bash
npm install
```

## Conversione XML → JSON

```bash
npm run convert
```

## Avvio importazione

```bash
npm run import
```

## Menu interattivo

```bash
npm start
```

## Verifica configurazione

```bash
npm run check
```

## Sincronizzazione completa

```bash
npm run sync
```

## Sincronizzazione produttori

```bash
npm run productor
```

## Test automatici

```bash
npm test
```

## Versione Node.js

```bash
node -v
```

## Versione npm

```bash
npm -v
```

---

# Procedura rapida completa

Per un nuovo utilizzo del progetto:

```text
1. Apri il progetto
        ↓
2. npm install
        ↓
3. Copia .env.example → .env
        ↓
4. Configura token e inventory
        ↓
5. Scarica XML da Vudoo
        ↓
6. Salva il feed come VUDOO.xml
        ↓
7. npm run convert
        ↓
8. TEST_MODE=true + DRY_RUN=true
        ↓
9. npm run import
        ↓
10. TEST_MODE=true + DRY_RUN=false
        ↓
11. npm run import
        ↓
12. Controlla il prodotto su Base.com
        ↓
13. TEST_MODE=false + DRY_RUN=false
        ↓
14. npm run import
```

---

# Sviluppi futuri

Gli sviluppi, le funzionalità pianificate e gli obiettivi futuri del progetto sono raccolti in:

[`ROADMAP.md`](./ROADMAP.md)
