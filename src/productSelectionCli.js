import {
  findCategories, findByCategory, findByCode, findByKeyword,
  addToSelection, selectedProducts, selectionSummary, sourceIdentity, uniqueProductCount,
  findSelectedByCode, removeFromSelection,
} from './productSelector.js';

function preview(products, log) {
  const unique = [...new Map(products.map(product => [sourceIdentity(product), product])).values()];
  for (const product of unique.slice(0, 5)) {
    log(`- ${product.title || '(senza titolo)'} | g:id ${product.id || '(assente)'} | g:sku ${product.sku || '(assente)'}`);
  }
  if (unique.length > 5) log(`... e altri ${unique.length - 5} prodotti.`);
}

async function chooseCategory(products, ask, log) {
  const search = await ask('Cerca categoria: ');
  if (search === null) return null;
  const matches = findCategories(products, search);
  if (!matches.length) { log('Nessuna categoria trovata.'); return []; }
  let chosen;
  if (matches.length === 1) {
    chosen = matches[0];
    log(`${chosen.path} (${chosen.count} prodotti)`);
    if (await ask('1. Aggiungi questi prodotti  2. Annulla: ') !== '1') return [];
  } else {
    log('Categorie trovate:');
    matches.forEach((entry, index) => log(`${index + 1}. ${entry.path} (${entry.count} prodotti)`));
    const choice = await ask(`${matches.length + 1}. Annulla\nSeleziona categoria: `);
    chosen = matches[Number(choice) - 1];
    if (!chosen || !/^\d+$/.test(choice ?? '')) return [];
  }
  return findByCategory(products, chosen.path);
}

async function chooseCodes(products, selection, ask, log) {
  let current = selection;
  let criteria = 0;
  while (true) {
    const code = await ask('Inserisci g:id o g:sku (0 per terminare): ');
    if (code === null || code === '0') return { selection: current, criteria };
    const matches = findByCode(products, code);
    if (!matches.length) { log('Nessun prodotto trovato.'); continue; }
    log(`Trovati ${uniqueProductCount(matches)} prodotti per il codice inserito.`);
    preview(matches, log);
    const result = addToSelection(current, matches);
    current = result.selection;
    criteria++;
    log(`Aggiunti ${result.added} prodotti. Prodotti selezionati totali: ${current.size}`);
  }
}

function showSummary(products, selection, criteria, log) {
  const summary = selectionSummary(products, selection);
  log(`\n[SELEZIONE PRODOTTI]\nProdotti totali catalogo: ${summary.total}\nProdotti selezionati: ${summary.selected}\nProdotti esclusi: ${summary.excluded}`);
  log(`Criteri utilizzati: categorie ${criteria.categories}, codici ${criteria.codes}, keyword ${criteria.keywords}`);
  preview(selectedProducts(products, selection), log);
}

function uniqueSelectedProducts(products, selection) {
  return [...new Map(selectedProducts(products, selection)
    .map(product => [sourceIdentity(product), product])).values()];
}

async function manageSelection(products, selection, ask, log) {
  if (!selection.size) { log('Nessun prodotto selezionato.'); return selection; }
  let current = selection;
  let page = 0;
  const pageSize = 25;
  while (true) {
    const selected = uniqueSelectedProducts(products, current);
    if (!selected.length) { log('Nessun prodotto selezionato.'); return current; }
    const pageCount = Math.ceil(selected.length / pageSize);
    page = Math.min(page, pageCount - 1);
    log(`\n[PRODOTTI SELEZIONATI]\nPagina ${page + 1}/${pageCount} — ${selected.length} prodotti`);
    for (const [index, product] of selected.slice(page * pageSize, (page + 1) * pageSize).entries()) {
      log(`${page * pageSize + index + 1}. ${product.title || '(senza titolo)'}\n   g:id: ${product.id || '(assente)'}\n   g:sku: ${product.sku || '(assente)'}`);
    }
    const action = await ask('N. Successiva  P. Precedente  R. Rimuovi  0. Torna al menu: ');
    if (action === null) return null;
    const command = action.toUpperCase();
    if (command === '0') return current;
    if (command === 'N') {
      if (page + 1 < pageCount) page++;
      else log('Ultima pagina.');
    } else if (command === 'P') {
      if (page > 0) page--;
      else log('Prima pagina.');
    } else if (command === 'R') {
      const code = await ask('Inserisci g:id o g:sku da rimuovere: ');
      if (code === null) return null;
      const { kind, matches } = findSelectedByCode(products, current, code);
      const count = uniqueProductCount(matches);
      if (!count) { log('Nessun prodotto selezionato trovato con questo codice.'); continue; }
      if (kind === 'sku' && count > 1) {
        log(`SKU trovato in ${count} prodotti selezionati.`);
        if (await ask(`Rimuovere tutte le ${count} configurazioni? 1. Sì  2. No: `) !== '1') {
          log('Rimozione annullata.');
          continue;
        }
      }
      const result = removeFromSelection(current, matches);
      current = result.selection;
      log(`Rimossi: ${result.removed}. Prodotti selezionati: ${current.size}`);
    } else {
      log('Scelta non valida.');
    }
  }
}

export async function chooseVudooProducts(products, ask, log) {
  log(`Catalogo ricevuto: ${products.length} prodotti`);
  let selection = new Set();
  const criteria = { categories: 0, codes: 0, keywords: 0 };
  while (true) {
    log(`\n[SELEZIONE PRODOTTI]\nCatalogo totale: ${products.length}\nProdotti attualmente selezionati: ${selection.size}\n1. Aggiungi per categoria\n2. Aggiungi tramite codice\n3. Aggiungi tramite parola chiave\n4. Visualizza / gestisci prodotti selezionati\n5. Svuota selezione\n6. Conferma selezione\n7. Annulla`);
    const choice = await ask('Seleziona operazione: ');
    if (choice === null || choice === '7') return null;
    if (choice === '1') {
      const matches = await chooseCategory(products, ask, log);
      if (matches === null) return null;
      if (matches.length) {
        const result = addToSelection(selection, matches);
        selection = result.selection;
        criteria.categories++;
        log(`Aggiunti ${result.added} prodotti. Totale: ${selection.size}`);
      }
    } else if (choice === '2') {
      const result = await chooseCodes(products, selection, ask, log);
      selection = result.selection;
      criteria.codes += result.criteria;
    } else if (choice === '3') {
      const keyword = await ask('Inserisci parola chiave: ');
      if (keyword === null) return null;
      const matches = findByKeyword(products, keyword);
      if (!matches.length) { log('Nessun prodotto trovato.'); continue; }
      log(`Trovati ${uniqueProductCount(matches)} prodotti.`);
      preview(matches, log);
      if (await ask('1. Aggiungi tutti i risultati  2. Annulla: ') === '1') {
        const result = addToSelection(selection, matches);
        selection = result.selection;
        criteria.keywords++;
        log(`Aggiunti ${result.added} prodotti. Totale: ${selection.size}`);
      }
    } else if (choice === '4') {
      const managed = await manageSelection(products, selection, ask, log);
      if (managed === null) return null;
      selection = managed;
    } else if (choice === '6') {
      showSummary(products, selection, criteria, log);
      if (!selection.size) { log('Nessun prodotto selezionato.'); continue; }
      const confirm = await ask('1. Conferma selezione  2. Torna al menu  3. Annulla: ');
      if (confirm === '1') return selectedProducts(products, selection);
      if (confirm === '3' || confirm === null) return null;
    } else if (choice === '5') {
      selection = new Set();
      criteria.categories = criteria.codes = criteria.keywords = 0;
      log('Selezione svuotata.');
    } else {
      log('Scelta non valida.');
    }
  }
}
