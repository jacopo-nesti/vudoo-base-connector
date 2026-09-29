import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterCatalogProducts, filterOptions, isSelectableId,
  toggleSelectedId, selectFilteredIds, deselectFilteredIds,
  clearSelectedIds, resetCatalogControls, getSelectedProducts,
  selectionChange, undoSelectionChange, isSelectionUndoShortcut, variantDetails,
} from '../renderer/src/catalogFilters.js';
import { toCatalogProductDto } from '../electron/catalogDto.js';
import { parseCatalog } from '../src/converter.js';
import { catalogXml, itemXml } from './fixtures/vudoo.js';

const products = [
  { id: '283813', sku: 'FAM-A', title: 'Bastoncini Wally', brand: 'Wally',
    category: 'Casa > Profumi', mpn: 'MPN-ONE' },
  { id: '283814', sku: 'FAM-A', title: 'Diffusore', brand: 'Wally',
    category: 'Casa > Profumi', mpn: 'MPN-TWO' },
  { id: '283815', sku: 'FAM-B', title: 'Crema', brand: 'Alba',
    category: 'Bellezza > Cura', mpn: 'MPN-THREE' },
  { id: '', sku: 'NO-ID', title: 'Campione', brand: 'Alba',
    category: 'Bellezza > Cura', mpn: '' },
  { id: '283816', sku: 'FAM-C', title: 'Sapone', brand: '', category: ' ', mpn: '' },
];

function ids(rows) {
  return rows.map(({ product }) => product.id);
}

test('Ricerca locale trova titolo, SKU, g:id, brand, categoria e MPN senza distinguere case', () => {
  for (const [query, expected] of [
    [' BASTONCINI ', ['283813']],
    ['fam-b', ['283815']],
    ['283814', ['283814']],
    ['alba', ['283815', '']],
    ['profumi', ['283813', '283814']],
    ['mpn-three', ['283815']],
  ]) {
    assert.deepEqual(ids(filterCatalogProducts(products, { searchQuery: query })), expected);
  }
  assert.deepEqual(ids(filterCatalogProducts(products, { searchQuery: '   ' })), products.map(product => product.id));
});

test('Categorie e brand sono opzioni ordinate, senza vuoti o duplicati', () => {
  assert.deepEqual(filterOptions(products, 'category'), ['Bellezza > Cura', 'Casa > Profumi']);
  assert.deepEqual(filterOptions(products, 'brand'), ['Alba', 'Wally']);
});

test('Filtri categoria completa, brand e query si combinano senza alterare il catalogo', () => {
  const snapshot = structuredClone(products);
  assert.deepEqual(ids(filterCatalogProducts(products, { categoryFilter: 'Casa > Profumi' })), ['283813', '283814']);
  assert.deepEqual(ids(filterCatalogProducts(products, { brandFilter: 'Alba' })), ['283815', '']);
  assert.deepEqual(ids(filterCatalogProducts(products, {
    categoryFilter: 'Casa > Profumi', brandFilter: 'Wally',
  })), ['283813', '283814']);
  assert.deepEqual(ids(filterCatalogProducts(products, {
    searchQuery: 'diffusore', categoryFilter: 'Casa > Profumi', brandFilter: 'Wally',
  })), ['283814']);
  assert.deepEqual(ids(filterCatalogProducts(products, { categoryFilter: 'Profumi' })), []);
  assert.deepEqual(ids(filterCatalogProducts(products, { searchQuery: 'inesistente' })), []);
  assert.deepEqual(products, snapshot);
});

test('Righe filtrate conservano la posizione originale per una key React stabile', () => {
  assert.deepEqual(filterCatalogProducts(products, { searchQuery: 'crema' }).map(row => row.index), [2]);
});

test('Selezione singola accetta solo ID utilizzabili e il toggle è reversibile', () => {
  assert.equal(isSelectableId('283813'), true);
  assert.equal(isSelectableId('  '), false);
  assert.equal(isSelectableId(undefined), false);
  const chosen = toggleSelectedId([], '283813');
  assert.deepEqual(chosen, ['283813']);
  assert.deepEqual(toggleSelectedId(chosen, '283813'), []);
  assert.equal(toggleSelectedId(chosen, ''), chosen);
});

test('Seleziona risultati fa union senza duplicati e conserva selezioni fuori filtro', () => {
  const visible = filterCatalogProducts(products, { categoryFilter: 'Casa > Profumi' });
  const chosen = selectFilteredIds(['283815'], visible);
  assert.deepEqual(chosen, ['283815', '283813', '283814']);
  assert.equal(selectFilteredIds(chosen, visible), chosen);
  assert.deepEqual(selectFilteredIds([], filterCatalogProducts(products, { brandFilter: 'Alba' })), ['283815']);
});

test('Deseleziona risultati rimuove solo ID visibili, svuotare la selezione resta indipendente dai filtri', () => {
  const chosen = ['283815', '283813', '283814'];
  const visible = filterCatalogProducts(products, { categoryFilter: 'Casa > Profumi' });
  assert.deepEqual(deselectFilteredIds(chosen, visible), ['283815']);
  assert.equal(deselectFilteredIds(['283815'], visible).length, 1);
  assert.deepEqual(clearSelectedIds(chosen), []);
  const empty = [];
  assert.equal(clearSelectedIds(empty), empty);
});

test('Cambiare filtro non cambia la selezione; una selezione nuova ha un riferimento distinto', () => {
  const selectedIds = ['283813'];
  filterCatalogProducts(products, { brandFilter: 'Alba' });
  assert.deepEqual(selectedIds, ['283813']);
  assert.equal(selectFilteredIds(selectedIds, []), selectedIds);
  assert.notEqual(selectFilteredIds(selectedIds, filterCatalogProducts(products, { brandFilter: 'Alba' })), selectedIds);
});

test('Catalogo nuovo può ripartire con filtri e selezione vuoti senza mutare il precedente', () => {
  const previous = { searchQuery: 'wally', categoryFilter: 'Casa > Profumi',
    brandFilter: 'Wally', selectedIds: ['283813'] };
  const reset = resetCatalogControls();
  assert.deepEqual(reset, { searchQuery: '', categoryFilter: '', brandFilter: '', selectedIds: [] });
  assert.deepEqual(ids(filterCatalogProducts(products, reset)), products.map(product => product.id));
  assert.deepEqual(previous.selectedIds, ['283813']);
});

test('DTO renderer conserva Size, Color e Item Group ID dal prodotto sorgente', () => {
  const source = parseCatalog(catalogXml(itemXml)).products[0];
  const dto = toCatalogProductDto(source);
  assert.equal(dto.size, '3000 ml.');
  assert.equal(dto.color, 'Bottone Oro');
  assert.equal(dto.itemGroupId, 'GROUP-A');
  assert.equal(dto.id, source.id);
  assert.equal(dto.category, source.product_type);
  assert.equal(Object.hasOwn(dto, 'item_group_id'), false);
});

test('Size e Color compaiono solo se valorizzati, senza righe vuote', () => {
  assert.deepEqual(variantDetails({ size: ' 50 ml ', color: ' Oro ' }), [
    ['Formato / Dimensione', ' 50 ml '], ['Colore', ' Oro '],
  ]);
  for (const empty of [undefined, null, '', '  ', {}]) {
    assert.deepEqual(variantDetails({ size: empty, color: empty }), []);
  }
  assert.deepEqual(variantDetails({ size: 'XL', color: '' }), [['Formato / Dimensione', 'XL']]);
  assert.deepEqual(variantDetails({ size: null, color: 'Nero' }), [['Colore', 'Nero']]);
});

test('La ricerca include Size e Color senza distinguere maiuscole o spazi esterni', () => {
  const variants = [
    { id: 'A', size: '50 ml', color: '' },
    { id: 'B', size: '250 ml', color: 'Nero' },
    { id: 'C', size: 'XL', color: 'Bottone Oro' },
  ];
  assert.deepEqual(ids(filterCatalogProducts(variants, { searchQuery: ' 50 ML ' })), ['A', 'B']);
  assert.deepEqual(ids(filterCatalogProducts(variants, { searchQuery: '250 ml' })), ['B']);
  assert.deepEqual(ids(filterCatalogProducts(variants, { searchQuery: 'NERO' })), ['B']);
  assert.deepEqual(ids(filterCatalogProducts(variants, { searchQuery: 'oro' })), ['C']);
});

test('Checkbox singola aggiunge il nuovo risultato senza perdere tre selezioni fuori filtro', () => {
  const selection = ['A', 'B', 'C'];
  const visible = filterCatalogProducts([
    { id: 'D', title: 'Visibile' }, { id: 'E' }, { id: 'F' },
  ], { searchQuery: 'visibile' });
  assert.deepEqual(ids(visible), ['D']);
  const change = selectionChange(selection, toggleSelectedId(selection, visible[0].product.id));
  assert.deepEqual(change.selectedIds, ['A', 'B', 'C', 'D']);
  assert.deepEqual(change.previousSelectedIds, selection);
});

test('Pannello selezionati recupera tutti gli ID anche se il filtro corrente ne nasconde alcuni', () => {
  const selection = ['283813', '283815'];
  const visible = filterCatalogProducts(products, { brandFilter: 'Alba' });
  assert.deepEqual(ids(visible), ['283815', '']);
  assert.deepEqual(getSelectedProducts(products, selection).map(product => product.id), selection);
  assert.deepEqual(getSelectedProducts(products, []).map(product => product.id), []);
  assert.deepEqual(getSelectedProducts([{ id: 'X' }, { id: 'X' }], ['X']).map(product => product.id), ['X']);
});

test('Rimozione specifica e undo ripristinano esattamente la selezione precedente', () => {
  const selection = ['A', 'B', 'C'];
  const change = selectionChange(selection, toggleSelectedId(selection, 'B'));
  assert.deepEqual(change.selectedIds, ['A', 'C']);
  assert.deepEqual(undoSelectionChange(change.previousSelectedIds), {
    selectedIds: selection, previousSelectedIds: null,
  });
  assert.equal(undoSelectionChange(null), null);
});

test('Undo a un livello copre select-all, deselect-results e clear', () => {
  const visible = [{ product: { id: 'B' } }, { product: { id: 'C' } }];
  const start = ['A'];
  for (const nextIds of [
    selectFilteredIds(start, visible),
    deselectFilteredIds(['A', 'B', 'C'], visible),
    clearSelectedIds(['A', 'B', 'C']),
  ]) {
    const before = nextIds.length === 1 && nextIds[0] === 'A' ? ['A', 'B', 'C'] : start;
    const change = selectionChange(before, nextIds);
    assert.deepEqual(undoSelectionChange(change.previousSelectedIds).selectedIds, before);
  }
  assert.equal(selectionChange(start, start), null);
  assert.equal(selectionChange(start, ['A']), null);
});

test('Ctrl+Z non intercetta input, select, textarea o contenuti editabili', () => {
  const event = (target, extras = {}) => ({
    key: 'z', ctrlKey: true, altKey: false, metaKey: false, shiftKey: false,
    defaultPrevented: false, target, ...extras,
  });
  assert.equal(isSelectionUndoShortcut(event({ closest: () => null })), true);
  for (const tag of ['input', 'select', 'textarea', 'contenteditable']) {
    assert.equal(isSelectionUndoShortcut(event({ closest: selector => selector.includes(tag) ? {} : null })), false);
  }
  assert.equal(isSelectionUndoShortcut(event({ isContentEditable: true })), false);
  assert.equal(isSelectionUndoShortcut(event({ closest: () => null }, { ctrlKey: false })), false);
  assert.equal(isSelectionUndoShortcut(event({ closest: () => null }, { defaultPrevented: true })), false);
});
