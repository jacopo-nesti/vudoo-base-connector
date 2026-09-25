# Modalità della CLI e Comandi Disponibili

Questo documento descrive le modalità di esecuzione del progetto **Vudoo Base Connector**.

## Menu principale

### `npm start`

Apre la CLI interattiva:

0. Verifica ambiente e configurazione;
1. Preflight catalogo Vudoo;
2. Sincronizza produttori da Vudoo;
3. Importa o aggiorna il catalogo completo Vudoo su Base.com;
4. Importa o aggiorna prodotti selezionati da Vudoo su Base.com;
5. Esegue i test automatici;
6. Esce.

Le opzioni 1, 2, 3 e 4 chiedono ogni volta il `codiceAzienda`. Limite risultati e timeout si impostano nel file runtime locale `.env`, non nella CLI; `.env.example` è soltanto il template versionato. I default applicativi sono `VUDOO_RESULTS_LIMIT=3000` e `VUDOO_TIMEOUT_MS=90000`. La CLI mostra i valori usati prima del fetch. Il limite richiesto non garantisce la completezza del catalogo. In caso di timeout l'operazione si ferma e torna al menu, senza elaborare un catalogo parziale né avviare il preflight Base.com. Il catalogo viene elaborato in memoria: non sono necessari `VUDOO.xml` o `real_products.json`. La CLI mostra `DRY_RUN` e `TEST_MODE` senza modificare `.env`.

L'opzione 3 importa tutto il catalogo ricevuto senza mostrare il selettore. L'opzione 4 apre direttamente la selezione dopo fetch e parsing XML. La selezione è locale: le ricerche per categoria sono parziali, ma aggiungono soltanto il percorso completo scelto; la ricerca per codice usa un `g:id` esatto oppure un `g:sku` esatto ignorando maiuscole/minuscole, includendo tutte le configurazioni della famiglia; le parole chiave cercano in titolo, descrizione, categoria e brand. Si possono combinare più criteri: i risultati vengono uniti e lo stesso `g:id` conta una sola volta. Ogni aggiunta per categoria o keyword richiede una conferma e la selezione finale non può essere vuota. La voce «Visualizza / gestisci prodotti selezionati» mostra 25 prodotti per pagina (`N` avanti, `P` indietro, `0` ritorno); con `R` si rimuove un singolo `g:id` oppure tutte le configurazioni selezionate di un `g:sku`, previa conferma se sono più di una. La rimozione non cerca nel resto del catalogo.

Solo i prodotti selezionati entrano nella normalizzazione, nelle verifiche categorie, nel preflight Base.com e nell'import. Categorie non mappate e prodotti No Name non selezionati non influenzano il report del subset. Le validazioni strutturali dell'XML restano necessariamente globali. Il preflight e la sincronizzazione separata dei produttori continuano a elaborare il catalogo ricevuto senza filtro prodotto.

## Verifica configurazione

### `npm run check`

Controlla configurazione, rate limiter e collegamento read-only alle risorse Base.com necessarie. Non legge cataloghi locali.

## Utility legacy

I comandi seguenti restano disponibili per analisi offline, debug e compatibilità con il precedente flusso locale:

* `npm run convert`: converte `VUDOO.xml` in `real_products.json`;
* `npm run import`: importa il JSON locale;
* `npm run productor`: sincronizza i produttori dal JSON locale;
* `npm run sync`: esegue XML → JSON → preflight → import.

I relativi entry point si trovano in `tools/legacy/` e non fanno parte del menu principale.

## Test

### `npm test`

Esegue la suite automatica offline. Prima di verifiche manuali verso Base.com è consigliato mantenere `DRY_RUN=true`; per smoke test read-only è disponibile anche `tests/read-only-base.mjs`.
