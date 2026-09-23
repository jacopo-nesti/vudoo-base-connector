# Modalità della CLI e Comandi Disponibili

Questo documento descrive le modalità di esecuzione del progetto **Vudoo Base Connector**.

## Menu principale

### `npm start`

Apre la CLI interattiva:

0. Verifica ambiente e configurazione;
1. Preflight catalogo Vudoo;
2. Sincronizza produttori da Vudoo;
3. Importa o aggiorna il catalogo Vudoo su Base.com;
4. Esegue i test automatici;
5. Esce.

Le opzioni 1, 2 e 3 chiedono ogni volta il `codiceAzienda`, recuperano il catalogo remoto e lo elaborano in memoria. Non richiedono `VUDOO.xml` o `real_products.json`. La CLI mostra `DRY_RUN` e `TEST_MODE` senza modificare il file `.env`.

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
