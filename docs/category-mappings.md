# Categorie canoniche

Il connettore separa tre valori: categoria originale Vudoo → categoria canonica interna → percorso categoria Base.com. Il valore sorgente resta disponibile nel prodotto. Le associazioni alle tassonomie marketplace si configurano direttamente in Base.com.

## Configurazione

`config/canonical-categories.json` è l'unica fonte dei percorsi Base. Ogni chiave è un ID canonico e `base_path` elenca i livelli dalla radice alla foglia:

```json
{
  "EXAMPLE_CATEGORY": {
    "base_path": ["Categoria Base", "Sottocategoria Base"]
  }
}
```

Ogni file JSON in `config/suppliers/` descrive un fornitore. I file vengono caricati automaticamente, senza modifiche JavaScript:

```json
{
  "supplier_id": "EXAMPLE_SUPPLIER",
  "source_titles": ["Titolo pubblico del feed"],
  "categories": {
    "Categoria originale": "EXAMPLE_CATEGORY"
  }
}
```

Gli esempi sono fittizi. Il connettore identifica il profilo dal `channel.title` del feed, ignorando soltanto differenze di maiuscole/minuscole e spazi. Non usa il codice azienda, non fa fuzzy matching e blocca titoli ambigui o ID canonici inesistenti. Il codice azienda continua a essere richiesto dalla CLI senza essere salvato.

## Aggiungere un fornitore

Esegui il preflight (voce `1` della CLI). Se il `channel.title` non corrisponde ad alcun profilo, il connettore crea una bozza con nome file deterministico in `config/suppliers/`, elencando le categorie sorgente reali con valore `null`, e blocca l'import. Non sovrascrive un file già presente. Per importare tutte le categorie, sostituisci ogni `null` con un ID esistente in `config/canonical-categories.json`, oppure aggiungi prima un ID canonico e il suo `base_path`. Se vuoi importare solo le categorie già mappate, imposta `UNMAPPED_CATEGORY_POLICY=skip` e ripeti il preflight.

Se un fornitore già configurato introduce una nuova categoria, il preflight ne mostra nome e numero di prodotti e indica il file supplier da aggiornare. Il programma non sceglie automaticamente una categoria. La configurazione Wally già esistente si trova in `config/suppliers/wally-1925.json`.

## Prodotti senza categoria e categorie non mappate

`product_type` assente, vuoto o equivalente a `No name > No name` significa categoria sorgente mancante. Questi prodotti sono sempre esclusi dall'import, anche con `UNMAPPED_CATEGORY_POLICY=block`. Il registro cumulativo `reports/no_name_products.json` conserva un record per `supplier_id` e `g:id`, con prima e ultima osservazione; è locale e ignorato da Git. Se manca anche `g:id`, il prodotto viene comunque escluso, non riceve un'identità fittizia nel registro e compare nel conteggio separato dei prodotti non registrabili. `g:id` resta obbligatorio per tutti i prodotti importabili. Il report dell'import mostra soltanto i conteggi aggregati.

Una categoria sorgente reale ma priva di mapping è diversa. Anche un valore `null` nel file di un supplier già configurato indica una categoria conosciuta ma non ancora mappata. `UNMAPPED_CATEGORY_POLICY=block` (default) ferma preflight/import prima delle scritture Base; `skip` esclude solo i prodotti interessati. In entrambi i casi il preflight mostra tutte le categorie reali non mappate e i relativi conteggi. La prima scoperta di un supplier genera lo scaffold e blocca sempre l'import; dalle esecuzioni successive i suoi valori `null` seguono la policy.

Per i prodotti importabili il connettore riusa la gerarchia esistente: cerca i livelli Base già presenti e crea soltanto quelli mancanti. La sincronizzazione separata dei produttori non dipende dai mapping categoria.
