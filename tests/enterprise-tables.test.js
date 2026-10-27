import test from 'node:test';
import assert from 'node:assert/strict';
import { UI_KEY, defaultColumns, readLayoutPreferences, writeLayoutPreferences, readTableState, writeTableState, sanitizeSnapshot, sortProductRows } from '../renderer/src/uiPreferences.js';
import { statusTone } from '../renderer/src/statusPresentation.js';
const memory = () => { const data = new Map(); return { getItem:key=>data.get(key), setItem:(key,value)=>data.set(key,value) }; };

test('layout preferences survive reopening and table writes without discarding saved views', () => {
  const storage = memory();
  assert.deepEqual(readLayoutPreferences(storage), { sidebarCollapsed: false, pageSize: 50, theme: 'light' });
  assert.equal(writeLayoutPreferences({ sidebarCollapsed: true, pageSize: 80 }, storage), true);
  const state = readTableState('base', storage);
  state.views = [{ id: 'favorite', name: 'Operativa', filters: { search: 'crema' } }];
  state.startup = 'favorite';
  assert.equal(writeTableState('base', state, storage), true);
  assert.deepEqual(readLayoutPreferences(storage), { sidebarCollapsed: true, pageSize: 80, theme: 'light' });
  assert.equal(readTableState('base', storage).startup, 'favorite');
  assert.equal(writeLayoutPreferences({ pageSize: 201 }, storage), false);
  assert.equal(readLayoutPreferences(storage).pageSize, 80);
  assert.equal(writeLayoutPreferences({ sidebarCollapsed: false }, storage), true);
  assert.equal(readTableState('base', storage).views[0].name, 'Operativa');
});

test('Base table columns, density and ordering persist after reopening', () => {
  const storage = memory();
  const state = readTableState('base', storage);
  assert.equal(state.columns.mpn, false);
  state.columns.ean = false; state.density = 'compact'; state.sort = 'quantity:desc';
  assert.equal(writeTableState('base', state, storage), true);
  const reopened = readTableState('base', storage);
  assert.equal(reopened.columns.ean, false);
  assert.equal(reopened.density, 'compact');
  assert.equal(reopened.sort, 'quantity:desc');
  assert.equal(Object.hasOwn(reopened.columns, 'etsy'), false);
  assert.equal(Object.hasOwn(JSON.parse(storage.getItem(UI_KEY)), 'etsy'), false);
});

test('saved Base views survive reload without persisting temporary filters', () => {
  const storage = memory(); const state = readTableState('base', storage);
  state.filters = { search: 'temporary' };
  state.views = [{ id:'my-view', name:'Senza categoria', channel:'base', filters:{search:'profumo',canonicalFilter:'Profumi'}, columns:{price:false}, density:'compact', sort:'ean' }];
  state.startup = 'my-view'; writeTableState('base', state, storage);
  const reopened = readTableState('base', storage);
  assert.deepEqual(reopened.filters, {});
  assert.equal(reopened.startup, 'my-view');
  assert.equal(reopened.views[0].filters.search, 'profumo');
  assert.equal(reopened.views[0].filters.canonicalFilter, 'Profumi');
  assert.equal(reopened.views[0].columns.price, false);
  reopened.views[0].name = 'Nuovo nome'; writeTableState('base', reopened, storage);
  assert.equal(readTableState('base', storage).views[0].name, 'Nuovo nome');
  reopened.views = []; writeTableState('base', reopened, storage);
  assert.equal(readTableState('base', storage).startup, '');
});

test('legacy saved views keep their identity while removed Product Manager filters are ignored', () => {
  const storage = memory();
  storage.setItem(UI_KEY, JSON.stringify({schemaVersion:1,base:{startup:'old',views:[{
    id:'old',name:'Vista storica',filters:{search:'crema',categoryFilter:'Bellezza',
      supplierFilter:'Supplier',brandFilter:'Brand',baseStatusFilter:'BASE_READY',preflightFilter:'BLOCKING_ERROR'},
    density:'compact',sort:'sku',columns:{ean:false},
  }]}}));
  const state = readTableState('base', storage);
  assert.equal(state.startup, 'old');
  assert.equal(state.views[0].name, 'Vista storica');
  assert.deepEqual(state.views[0].filters, {search:'crema',categoryFilter:'Bellezza'});
  writeTableState('base', state, storage);
  assert.deepEqual(readTableState('base', storage).views[0].filters, {search:'crema',categoryFilter:'Bellezza'});
});

test('corrupt stores fall back safely and snapshots discard unrelated data', () => {
  const storage = memory();
  for (const value of ['invalid','null','{"schemaVersion":9}','{"schemaVersion":1,"base":null}']) {
    storage.setItem(UI_KEY, value);
    assert.deepEqual(readTableState('base',storage).columns, defaultColumns('base'));
  }
  const cleaned = sanitizeSnapshot('base',{density:'bad',columns:{actions:false,price:false},filters:{token:'secret',search:'valid',etsyStatusFilter:'active'},token:'secret',sort:'SQL'});
  assert.equal(cleaned.sort,'source'); assert.equal(cleaned.density,'comfortable');
  assert.equal(cleaned.columns.price,false); assert.equal(cleaned.columns.actions,undefined);
  assert.doesNotMatch(JSON.stringify(cleaned),/secret|token|etsy/);
  assert.equal(writeTableState('base',readTableState('base',storage),{getItem:()=>null,setItem:()=>{throw Error('quota');}}),false);
});

test('Base sorting uses effective product values without mutating source rows', () => {
  const rows = [{product:{title:'B',sku:'10',ean:'2',quantity:100}}, {product:{title:'A',sku:'2',ean:'10',quantity:3}}, {product:{title:'C'}}];
  assert.equal(sortProductRows(rows,'title','base')[0],rows[1]);
  assert.equal(sortProductRows(rows,'sku','base')[0],rows[1]);
  assert.equal(sortProductRows(rows,'ean','base')[0],rows[0]);
  assert.equal(sortProductRows(rows,'quantity','base')[0],rows[1]);
  assert.equal(sortProductRows(rows,'quantity:desc','base')[0],rows[0]);
  assert.equal(rows[0].product.quantity,100);
});

test('large table sorting is stable and retains every source row',()=>{
  const rows=Array.from({length:10000},(_,index)=>({product:{title:'Identico',quantity:10000-index},index}));
  assert.deepEqual(sortProductRows(rows,'title','base'),rows);
  const sorted=sortProductRows(rows,'quantity','base');assert.equal(sorted.length,10000);assert.equal(sorted[0].product.quantity,1);assert.equal(rows[0].product.quantity,10000);
});

test('status visual semantics agree across Base tables and inspector',()=>{
  for(const value of ['READY','BASE_READY','SUCCESS'])assert.equal(statusTone(value),'ready');
  for(const value of ['BLOCKING_ERROR','FAILED'])assert.equal(statusTone(value),'blocked');
  for(const value of ['MISSING_DATA','UNMAPPED_CATEGORY','WARNING'])assert.equal(statusTone(value),'pending');
  for(const value of [undefined,'unknown'])assert.equal(statusTone(value),'neutral');
});
