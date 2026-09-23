# vudoo-base-connector — v1.2.0

La versione 1.2.0 introduce l'importazione diretta dei cataloghi Vudoo tramite Web Service e aggiorna il flusso operativo del connettore verso Base.com. Il catalogo XML viene elaborato in memoria, senza dipendere da un file JSON intermedio nel normale utilizzo dell'applicazione.

## Novità principali

- Integrazione diretta con `ProductCatalog.ashx` per il recupero del catalogo Vudoo.
- Preflight sul catalogo remoto e sincronizzazione dei produttori dal feed Vudoo.
- Importazione e aggiornamento su Base.com con gestione `CREATE / UPDATE / SKIP`.
- Controlli di deduplicazione e collisione più robusti e verifica preventiva dei Parameters e degli Additional Fields Base.

## Identità prodotto e configurazioni

Il nuovo modello distingue l'identità tecnica del prodotto dai relativi attributi Vudoo:

| Campo Vudoo | Destinazione Base.com |
| --- | --- |
| `g:id` | SKU tecnico, trattato come stringa |
| `g:sku` | Parameter `Vudoo SKU` |
| `g:size` | Parameter `Size` |
| `g:color` | Parameter `Color` |

Ogni configurazione con un `g:id` distinto viene gestita come prodotto Base indipendente, senza creare varianti, prodotti padre o relazioni tramite `parent_id`.

Il titolo viene composto secondo lo schema `Titolo originale - Brand - Size - Color`, includendo soltanto i componenti presenti.

## Mapping verso Base.com

Il mapping comprende EAN, MPN, prezzo, IVA, stock, peso, dimensioni, categorie, produttori, Parameters e Additional Fields.

- EAN e MPN rimangono opzionali; MPN viene riportato nel Parameter dedicato.
- `g:image_link` viene utilizzato come immagine principale.
- `g:price` alimenta il prezzo Base; `sale_price` viene conservato nell'Additional Field `Vudoo Sale Price`.
- Una quantità presente e valida viene mantenuta esattamente. In assenza di quantità, il fallback è `10` per `in stock` e `0` per `out of stock`.
- L'IVA utilizza `tax_rate` quando presente; se assente o vuoto, il valore predefinito è `22`.
- Le categorie derivano da `g:product_type`, separando la gerarchia soltanto su `>` e preservando le virgole nei nomi.
- I produttori derivano da `g:brand`.

### Fallback delle dimensioni

Per altezza, larghezza e lunghezza mancanti o non valide viene applicato un fallback di **15 cm**. Il fallback opera indipendentemente su ciascuna dimensione.

## Nuova CLI

Il menu principale è stato semplificato e allineato al flusso basato sul catalogo remoto:

```text
0. Verifica ambiente e configurazione
1. Preflight catalogo Vudoo
2. Sincronizza produttori da Vudoo
3. Importa / aggiorna catalogo Vudoo su Base.com
4. Esegui test automatici
5. Esci
```

Le operazioni del flusso principale non dipendono più dal JSON locale. Le utility del precedente workflow XML/JSON restano disponibili e versionate in `tools/legacy/`, separate dal menu principale.

## Rate limit configurabile

Il limite applicativo delle richieste API verso Base.com è configurabile tramite la variabile d'ambiente:

```env
BASE_API_REQUESTS_PER_MINUTE=100
```

Se la variabile è assente o vuota, il valore predefinito è **100 richieste al minuto**. Il valore configurato deve essere un intero positivo; un valore esplicitamente non valido genera un errore di configurazione.

## Qualità e test

La validazione riportata per questa release comprende **243 test automatici superati**, con **0 falliti** e **0 saltati**.

## Assunzioni aperte e limiti

- **Stabilità di `g:id`:** la sincronizzazione assume che `g:id` sia stabile nel tempo e utilizzabile come SKU tecnico. Questa rimane un'assunzione aperta.
- **Prodotti rimossi dal feed:** la gestione automatica resta fuori scope. La sola assenza di un prodotto dal catalogo corrente non comporta cancellazione, disattivazione, azzeramento dello stock o altre modifiche automatiche.
