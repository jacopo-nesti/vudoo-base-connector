# Categorie canoniche

Il connettore separa tre valori: categoria originale Vudoo → categoria canonica interna → percorso categoria Base.com. Il valore sorgente resta disponibile nel prodotto. Un mapping Etsy locale, separato e privato associa ora le categorie canoniche alla tassonomia Etsy; non modifica ancora le associazioni marketplace configurate in Base.com e non effettua chiamate Etsy.

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

Esegui il preflight (voce `1` della CLI). Se il `channel.title` non corrisponde ad alcun profilo, il connettore crea una bozza con nome file deterministico in `config/suppliers/` e blocca l'import. La bozza riusa una categoria canonica soltanto se tutti i supplier che hanno già approvato lo stesso percorso sorgente normalizzato concordano, oppure se il percorso sorgente coincide esattamente con un unico `base_path` canonico. Un conflitto tra le due fonti lascia il valore `null`. Il confronto usa l'intero percorso, senza corrispondenze parziali o semantiche. Le categorie sconosciute o ambigue restano `null`; quelle senza categoria sorgente sono escluse dalla bozza. Il riepilogo indica quante categorie sono state auto-mappate e quante richiedono configurazione manuale. Verifica le associazioni proposte prima di procedere: il file già presente non viene sovrascritto. Per importare tutte le categorie, sostituisci ogni `null` con un ID esistente in `config/canonical-categories.json`, oppure aggiungi prima un ID canonico e il suo `base_path`. Se vuoi importare solo le categorie già mappate, imposta `UNMAPPED_CATEGORY_POLICY=skip` e ripeti il preflight.

Se un fornitore già configurato introduce una nuova categoria, il preflight ne mostra nome e numero di prodotti e indica il file supplier da aggiornare. Il programma non sceglie automaticamente una categoria. La configurazione Wally già esistente si trova in `config/suppliers/wally-1925.json`.

## Prodotti senza categoria e categorie non mappate

`product_type` assente, vuoto o equivalente a `No name > No name` significa categoria sorgente mancante. Questi prodotti sono sempre esclusi dall'import, anche con `UNMAPPED_CATEGORY_POLICY=block`. Il registro cumulativo `reports/no_name_products.json` conserva un record per `supplier_id` e `g:id`, con prima e ultima osservazione; è locale e ignorato da Git. Se manca anche `g:id`, il prodotto viene comunque escluso, non riceve un'identità fittizia nel registro e compare nel conteggio separato dei prodotti non registrabili. `g:id` resta obbligatorio per tutti i prodotti importabili. Il report dell'import mostra soltanto i conteggi aggregati.

Una categoria sorgente reale ma priva di mapping è diversa. Anche un valore `null` nel file di un supplier già configurato indica una categoria conosciuta ma non ancora mappata. `UNMAPPED_CATEGORY_POLICY=block` (default) ferma preflight/import prima delle scritture Base; `skip` esclude solo i prodotti interessati. In entrambi i casi il preflight mostra tutte le categorie reali non mappate e i relativi conteggi. La prima scoperta di un supplier genera lo scaffold e blocca sempre l'import; dalle esecuzioni successive i suoi valori `null` seguono la policy.

Per i prodotti importabili il connettore riusa la gerarchia esistente: cerca i livelli Base già presenti e crea soltanto quelli mancanti. La sincronizzazione separata dei produttori non dipende dai mapping categoria.

## Associazioni canoniche verso Etsy

`config/marketplaces/etsy/categories.json` è la tassonomia locale privata. `config/marketplaces/etsy/canonical-mapping.json` conserva una decisione per ogni categoria canonica: `mapped` con `etsy_category_id` e `etsy_path` identici a un record della tassonomia, `pending` se la destinazione richiede revisione, oppure `not_applicable` se la categoria non deve essere associata. L'assenza di una decisione è un errore di configurazione, non un mapping implicito.

Entrambi i file Etsy sono ignorati da Git. Il modulo `src/marketplaces/etsyCategories.js` li legge e valida insieme a `config/canonical-categories.json`, poi restituisce uno stato strutturato per una categoria canonica. Non cerca somiglianze, non sceglie categorie automaticamente, non scrive file e non è ancora collegato all'import Base.com. Quando si aggiunge una categoria canonica, occorre assegnarle esplicitamente uno dei tre stati nel file privato.
