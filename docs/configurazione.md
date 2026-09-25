# ⚙️ Configurazione

Il comportamento dell'applicazione viene configurato tramite le variabili d'ambiente definite nel file `.env`. Usa `.env.example` come modello e copialo in `.env`: il file di esempio deve rimanere versionato e non deve contenere token reali.

## Variabili d'Ambiente Principali

* **`BASE_API_TOKEN`**: token di autenticazione Base.com obbligatorio;
* **`BASE_INVENTORY_ID`**: inventory da usare quando si desidera una selezione esplicita. Se assente, il progetto richiede un inventory predefinito identificabile in modo univoco;
* **`BASE_WAREHOUSE_ID`**: warehouse da usare per lo stock quando è necessaria una selezione esplicita. Il valore viene verificato rispetto all'inventory selezionato;
* **`DRY_RUN`**: con `true` blocca tutte le scritture verso Base.com;
* **`TEST_MODE`**: con `true` limita l'elaborazione al primo prodotto selezionato;
* **`UNMAPPED_CATEGORY_POLICY`**: `block` (predefinito) blocca il catalogo se manca il mapping di una categoria sorgente reale; `skip` importa soltanto i prodotti mappati. I prodotti con categoria assente, vuota o `No name > No name` sono sempre esclusi, indipendentemente dalla policy. Quelli con `g:id` sono registrati in `reports/no_name_products.json`; quelli senza `g:id` sono conteggiati separatamente.
* **`VUDOO_RESULTS_LIMIT`**: numero di risultati richiesti al Web Service Vudoo, default applicativo `3000`. Deve essere un intero positivo; un valore non valido produce un avviso e usa il default. Il valore è letto da `.env`/ambiente all'avvio, non richiesto dalla CLI e non garantisce la completezza del catalogo;
* **`VUDOO_TIMEOUT_MS`**: timeout della richiesta e della lettura del catalogo XML, default applicativo `90000` ms. Deve essere un intero positivo; un valore non valido produce un avviso e usa il default. Dopo un timeout l'import non prosegue e si può ridurre il limite risultati oppure aumentare questo timeout nel file locale `.env`, riavviando il programma.

## Protezione delle API

Le seguenti impostazioni configurano le protezioni del client Base.com:

* **`BASE_API_REQUESTS_PER_MINUTE`**: numero massimo di richieste avviate in una finestra mobile di 60 secondi. Se assente o vuoto usa `100`; un valore esplicito deve essere un intero maggiore di zero;
* **`BASE_API_READ_ATTEMPTS`**: tentativi totali consentiti per una lettura temporaneamente fallita;
* **`BASE_API_RETRY_DELAY_MS`**: attesa iniziale tra i retry delle letture;
* **`BASE_API_RATE_LIMIT_DELAY_MS`**: pausa condivisa usata per rate limit reattivi quando non è disponibile un'attesa più lunga tramite `Retry-After`.

Il rallentamento preventivo inizia internamente all'80% del valore configurato. Il valore deve essere impostato in modo compatibile con il piano Base.com usato dall'account.

## Configurazione iniziale

```powershell
Copy-Item .env.example .env
```

Su macOS o Linux:

```bash
cp .env.example .env
```

Inserisci il token esclusivamente nel file locale `.env`. Per il primo controllo usa `DRY_RUN=true` e `TEST_MODE=true`.
