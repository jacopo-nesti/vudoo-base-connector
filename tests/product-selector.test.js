import test from 'node:test';
import assert from 'node:assert/strict';
import { getVudooResultsConfig, getVudooResultsLimit } from '../src/config.js';
import { buildVudooCatalogUrl } from '../src/vudooXml.js';
import {
  findCategories, findByCategory, findByCode, findByKeyword,
  addToSelection, selectedProducts, selectionSummary,
  findSelectedByCode, removeFromSelection,
} from '../src/productSelector.js';
import { chooseVudooProducts } from '../src/productSelectionCli.js';

const products = [
  { id: '100', sku: 'FAMILY', title: 'Musei Vaticani', description: 'Profumo fresco', brand: 'Marca', product_type: 'Bellezza > Fragranze' },
  { id: '101', sku: 'FAMILY', title: 'Giardino', description: 'Acqua', brand: 'Marca', product_type: 'Bellezza > Fragranze' },
  { id: '102', sku: 'OTHER', title: 'Sapone', description: 'Casa', brand: 'Altro', product_type: 'Casa > Fragranze' },
  { id: '103', sku: 'MISSING', title: 'No name', product_type: 'No name > No name' },
  { id: '104', sku: 'NONE', title: 'Senza categoria' },
];

function dialogue(answers) {
  const prompts = [], output = [];
  const queue = [...answers];
  return {
    ask: async prompt => { prompts.push(prompt); return queue.length ? queue.shift() : null; },
    log: line => output.push(line), prompts, output,
  };
}

test('Vudoo risultati: default 3000, override env e fallback su valore non valido', () => {
  assert.deepEqual(getVudooResultsConfig(null), { limit: 3000, invalid: false });
  assert.deepEqual(getVudooResultsConfig(''), { limit: 3000, invalid: false });
  for (const value of ['1', '5000', '3000']) {
    assert.equal(buildVudooCatalogUrl('azienda', Number(value)).searchParams.get('risultati'), value);
    assert.equal(getVudooResultsLimit(value), Number(value));
  }
  for (const value of ['0', '-1', 'abc', '1.5']) {
    assert.deepEqual(getVudooResultsConfig(value), { limit: 3000, invalid: true });
    assert.equal(getVudooResultsLimit(value), 3000);
  }
  for (const value of [0, -1, 1.5]) assert.throws(() => buildVudooCatalogUrl('azienda', value), /limite risultati/);
});

test('Categorie: ricerca parziale case-insensitive, scelta sul path completo e No Name escluso', () => {
  assert.deepEqual(findCategories(products, '  FRAGRANZE ').map(entry => [entry.path, entry.count]), [
    ['Bellezza > Fragranze', 2], ['Casa > Fragranze', 1],
  ]);
  assert.deepEqual(findByCategory(products, 'Bellezza > Fragranze').map(product => product.id), ['100', '101']);
  assert.deepEqual(findCategories(products, 'sconosciuta'), []);
  assert.deepEqual(findCategories(products, 'No name'), []);
});

test('Codici: g:id esatto, g:sku esatto case-insensitive e famiglia con più configurazioni', () => {
  assert.deepEqual(findByCode(products, ' 100 ').map(product => product.id), ['100']);
  assert.deepEqual(findByCode(products, 'family').map(product => product.id), ['100', '101']);
  assert.deepEqual(findByCode(products, '10'), []);
  assert.deepEqual(findByCode(products, 'missing-code'), []);
});

test('Keyword: title, description, product_type e brand; nessun match inventato', () => {
  for (const [query, ids] of [[' MUSEI VATICANI ', ['100']], ['fresco', ['100']],
    ['Casa >', ['102']], ['Altro', ['102']], ['inesistente', []]]) {
    assert.deepEqual(findByKeyword(products, query).map(product => product.id), ids);
  }
});

test('Union: categorie, codice e keyword non duplicano g:id; record duplicati restano nella pipeline', () => {
  const duplicate = { ...products[0] };
  const feed = [...products, duplicate];
  let selection = new Set();
  selection = addToSelection(selection, findByCategory(feed, 'Bellezza > Fragranze')).selection;
  selection = addToSelection(selection, findByCode(feed, '100')).selection;
  selection = addToSelection(selection, findByKeyword(feed, 'Musei')).selection;
  assert.deepEqual(selectionSummary(feed, selection), { total: 5, selected: 2, excluded: 3 });
  assert.deepEqual(selectedProducts(feed, selection).map(product => product.id), ['100', '101', '100']);
});

test('Selettore CLI: categoria precisa, keyword e codice formano una union con conferma', async () => {
  const ui = dialogue(['1', 'fragranze', '1', '2', '100', '0', '3', 'sapone', '1', '6', '1']);
  const selected = await chooseVudooProducts(products, ui.ask, ui.log);
  assert.deepEqual(selected.map(product => product.id), ['100', '101', '102']);
  assert.ok(ui.output.some(line => line.includes('Prodotti selezionati: 3')));
  assert.ok(ui.output.some(line => line.includes('categorie 1, codici 1, keyword 1')));
});

test('Selettore CLI: più categorie omonime richiedono la scelta del percorso completo', async () => {
  const ui = dialogue(['1', 'fragranze', '2', '6', '1']);
  assert.deepEqual((await chooseVudooProducts(products, ui.ask, ui.log)).map(product => product.id), ['102']);
  assert.ok(ui.output.some(line => line.includes('Bellezza > Fragranze')));
  assert.ok(ui.output.some(line => line.includes('Casa > Fragranze')));
});

test('Selettore CLI: keyword annullata non aggiunge prodotti', async () => {
  const ui = dialogue(['3', 'musei', '2', '6', '7']);
  assert.equal(await chooseVudooProducts(products, ui.ask, ui.log), null);
  assert.ok(ui.output.some(line => line.includes('Nessun prodotto selezionato')));
});

test('Selettore CLI: selezione vuota non confermabile; annullamento keyword e import', async () => {
  const ui = dialogue(['6', '3', 'inesistente', '7']);
  assert.equal(await chooseVudooProducts(products, ui.ask, ui.log), null);
  assert.ok(ui.output.some(line => line.includes('Nessun prodotto selezionato')));
  assert.ok(ui.output.some(line => line.includes('Nessun prodotto trovato')));
  assert.equal(await chooseVudooProducts(products, dialogue(['7']).ask, () => {}), null);
});

test('Selettore CLI: codice può scegliere un prodotto senza g:id, la validazione resta a valle', async () => {
  const withoutId = { sku: 'FAMILY-X', title: 'Senza ID', product_type: 'Bellezza > Fragranze' };
  const ui = dialogue(['2', 'FAMILY-X', '0', '6', '1']);
  assert.deepEqual(await chooseVudooProducts([withoutId], ui.ask, ui.log), [withoutId]);
});

test('Selettore CLI: lista completa paginata, avanti e indietro senza dump unico', async () => {
  const many = Array.from({ length: 52 }, (_, index) => ({
    id: String(index + 1), sku: `F-${index}`, title: `Articolo condiviso ${index + 1}`,
  }));
  const ui = dialogue(['3', 'condiviso', '1', '4', 'N', 'P', '0', '6', '1']);
  const selected = await chooseVudooProducts(many, ui.ask, ui.log);
  assert.equal(selected.length, 52);
  assert.ok(ui.output.some(line => line.includes('Pagina 1/3')));
  assert.ok(ui.output.some(line => line.includes('Pagina 2/3')));
  assert.ok(ui.output.some(line => line.includes('26. Articolo condiviso 26')));
  assert.ok(ui.output.some(line => line.includes('52. Articolo condiviso 52')) === false);
  assert.ok(ui.output.some(line => line.includes('Prodotti selezionati: 52')));
});

test('Selettore CLI: rimozione per g:id toglie solo la configurazione scelta', async () => {
  const ui = dialogue(['2', 'FAMILY', '0', '4', 'R', '100', '0', '6', '1']);
  const selected = await chooseVudooProducts(products, ui.ask, ui.log);
  assert.deepEqual(selected.map(product => product.id), ['101']);
  assert.ok(ui.output.some(line => line.includes('Rimossi: 1. Prodotti selezionati: 1')));
  assert.ok(ui.output.some(line => line.includes('codici 1')));
});

test('Selettore CLI: g:sku condiviso chiede conferma, annullamento non rimuove', async () => {
  const ui = dialogue(['2', 'FAMILY', '0', '4', 'R', 'family', '2', '0', '6', '1']);
  assert.deepEqual((await chooseVudooProducts(products, ui.ask, ui.log)).map(product => product.id), ['100', '101']);
  assert.ok(ui.output.some(line => line.includes('SKU trovato in 2 prodotti selezionati')));
  assert.ok(ui.output.some(line => line.includes('Rimozione annullata')));
});

test('Selettore CLI: g:sku rimuove tutte le configurazioni selezionate e contatori restano esatti', async () => {
  const ui = dialogue(['2', 'FAMILY', '102', '0', '4', 'R', 'FAMILY', '1', '0', '6', '1']);
  const selected = await chooseVudooProducts(products, ui.ask, ui.log);
  assert.deepEqual(selected.map(product => product.id), ['102']);
  assert.ok(ui.output.some(line => line.includes('Rimossi: 2. Prodotti selezionati: 1')));
  assert.ok(ui.output.some(line => line.includes('Prodotti esclusi: 4')));
  assert.ok(ui.output.some(line => line.includes('codici 2')));
});

test('Selettore CLI: rimozione ignora codici del catalogo non selezionati e selezione vuota non si conferma', async () => {
  const ui = dialogue(['2', '100', '0', '4', 'R', '102', 'R', '100', '0', '6', '7']);
  assert.equal(await chooseVudooProducts(products, ui.ask, ui.log), null);
  assert.ok(ui.output.some(line => line.includes('Nessun prodotto selezionato trovato con questo codice')));
  assert.ok(ui.output.some(line => line.includes('Nessun prodotto selezionato')));
});

test('Rimozione pura: precedenza g:id e dedup delle configurazioni', () => {
  let selection = addToSelection(new Set(), products.slice(0, 2)).selection;
  const byId = findSelectedByCode(products, selection, '100');
  assert.equal(byId.kind, 'id');
  assert.equal(byId.matches.length, 1);
  selection = removeFromSelection(selection, byId.matches).selection;
  assert.equal(selectionSummary(products, selection).selected, 1);
  assert.equal(findSelectedByCode(products, selection, 'FAMILY').matches.length, 1);
});
