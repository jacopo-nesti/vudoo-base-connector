# Roadmap — Vudoo → Base.com

Sviluppi e miglioramenti previsti per il progetto.

## Stato attuale

Il flusso attuale della versione 1.1.0 permette di:

```text
Vudoo XML
    ↓
Conversione JSON
    ↓
Preflight e normalizzazione
    ↓
Produttori e categorie
    ↓
Controllo SKU e confronto dati
    ↓
CREATE / UPDATE / SKIP su Base.com
```

Sono già disponibili:

- CLI interattiva e comandi diretti;
- `TEST_MODE` e protezione centralizzata `DRY_RUN`;
- selezione e verifica di inventory, gruppo prezzi e warehouse;
- deduplicazione del feed e blocco degli SKU ambigui;
- aggiornamenti selettivi dei prodotti esistenti;
- creazione controllata di categorie e produttori;
- sincronizzazione stock con precedenza alla quantità reale e fallback da `availability`;
- sanitizzazione dei testi Unicode incompatibili;
- rate limiting adattivo, retry controllati delle letture e gestione delle scritture con esito incerto;
- report con errori ed esiti incerti separati;
- suite automatica offline.

---

# Obiettivi

## 1. Connessione diretta alle API Vudoo

Sostituire il download e la conversione manuale del file XML con una chiamata diretta ai dati o alle API Vudoo.

```text
Vudoo API
    ↓
GET prodotti
    ↓
JSON
    ↓
Normalizzazione
    ↓
Base.com
```

In questo modo `real_products.json` potrà rimanere principalmente come strumento di test o fallback.

---

## 2. Aggiornamento dei prodotti esistenti — completato nella v1.1.0

Il sistema ricerca i prodotti per SKU, confronta i dati e distingue:

```text
Uguali → SKIP
Modificati → UPDATE selettivo
Assenti → CREATE
```

Gli SKU ambigui vengono bloccati senza scegliere arbitrariamente un prodotto.

---

## 3. Gestione automatica delle categorie — completata nella v1.1.0

Il percorso `product_type` viene usato per associare o creare categorie mantenendo la gerarchia e il `parent_id`. Le mappe vengono aggiornate durante l'esecuzione per evitare creazioni duplicate.

---

## 4. Gestione automatica dei produttori — completata nella v1.1.0

Il campo `brand` viene normalizzato per associare o creare il produttore. Nomi ambigui associati a ID differenti bloccano la scelta automatica.

---

## 5. Sincronizzazione stock — completata nella v1.1.0

La quantità numerica reale ha precedenza. Quando manca:

```text
in stock → 10
out of stock → 0
```

Il valore 10 è un default operativo e non un limite massimo. Il warehouse viene verificato rispetto all'inventory selezionato e lo stock invariato non genera UPDATE.

Rimane utile ricevere da Vudoo una quantità di vendita sempre valorizzata e affidabile, così da ridurre il ricorso al fallback.

---

## 6. Miglioramento continuo della validazione prodotti

Estendere i controlli quando il feed Vudoo renderà disponibili nuovi campi, mantenendo la segnalazione per SKU senza interrompere gli altri prodotti.

Campi futuri da valutare includono dimensioni, dati marketplace e ulteriori informazioni aziendali già tracciate nella documentazione dei dati da recuperare.

---

## 7. Report finale avanzato

Valutare un report operativo esportabile che raccolga SKU creati, aggiornati, invariati, errati e incerti, senza sostituire il riepilogo terminale già disponibile.

---

## 8. Connessione e immagini

Verificare il comportamento delle immagini remote quando saranno disponibili autenticazione o requisiti Vudoo definitivi, senza inventare trasformazioni o credenziali non fornite dalla sorgente.

---

# Obiettivo finale

Trasformare lo script da connettore basato su file a sincronizzazione integrata con Vudoo:

```text
Database / API Vudoo
      ↓
Node.js
      ↓
Normalizzazione
      ↓
Confronto con Base.com
      ↓
CREATE / UPDATE / SKIP
      ↓
Base.com
```

L'obiettivo è ridurre progressivamente gli interventi manuali e mantenere sincronizzati i cataloghi Vudoo e Base.com.
