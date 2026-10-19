import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { BULK_BASE_FIELDS, validateBulkBaseInput } from '../src/productSchema.js';
import { saveBulkProductField, saveProductFieldPatch, loadProductOverrides, productOverrideRevision } from '../electron/productOverrides.js';
import { effectiveProduct, productKey } from '../electron/effectiveProduct.js';
import { buildBasePayload } from '../src/products.js';

const keys = ['quantity','price','tax_rate','weight','height','width','length'];
const source = { id:'SKU-1',sku:'SKU-1',title:'Prodotto',price:17,quantity:1021,tax_rate:22,
  weight:0.5,height:15,width:10,length:8,tags:['Presistente'] };
const config = { inventory:{inventory_id:1},warehouse:{id:'bl_1'},priceGroup:{price_group_id:2,currency:'EUR'} };

test('bulk Base exposes only existing numeric payload fields', () => {
  assert.deepEqual(BULK_BASE_FIELDS.map(field=>field.key),keys);
  for (const field of ['title','description','ean','image_link','category_id','tags','brand']) {
    assert.throws(()=>validateBulkBaseInput(field,'10'),/non disponibile/);
  }
});

test('bulk Base numeric validation reuses model bounds and requires absolute values', () => {
  const values = { quantity:'0',price:'220,50',tax_rate:'22',weight:'0',height:'18.5',width:'10',length:'0' };
  for (const [key,raw] of Object.entries(values)) assert.equal(typeof validateBulkBaseInput(key,raw),'number');
  assert.equal(validateBulkBaseInput('price','220,50'),220.5);
  assert.equal(validateBulkBaseInput('tax_rate','-1'),-1);
  for (const key of keys) {
    for (const invalid of ['', ' ', 'testo', '-5']) {
      if (key === 'tax_rate' && invalid === '-5') continue;
      assert.throws(()=>validateBulkBaseInput(key,invalid),`${key}: ${invalid}`);
    }
  }
  for (const invalid of ['1.5','1e2','9007199254740992']) assert.throws(()=>validateBulkBaseInput('quantity',invalid));
  assert.throws(()=>validateBulkBaseInput('price','0'),/maggiore di zero/);
  assert.throws(()=>validateBulkBaseInput('tax_rate','101'));
});

test('bulk Base overrides match single edits, survive reload and preserve Vudoo source', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(),'vudoo-bulk-v2-'));
  try {
    const bulkFile = path.join(directory,'bulk.json');
    const singleFile = path.join(directory,'single.json');
    const sources = [source,{...source,id:'SKU-2',sku:'SKU-2'}];
    const original = structuredClone(sources);
    let bulk = Object.fromEntries(sources.map(item=>[productKey('company',item.id),{base:{tags:[`Tag ${item.id}`]}}]));
    let single = structuredClone(bulk);
    const updates = {quantity:10,price:220.5,tax_rate:10,weight:1.2,height:18.5,width:12,length:9};
    for (const [field,value] of Object.entries(updates)) {
      bulk = await saveBulkProductField(bulkFile,bulk,'company',sources,{scope:'base',field,value,
        expectedRevisions:Object.fromEntries(sources.map(item=>[item.id,productOverrideRevision(bulk[productKey('company',item.id)]??{})]))});
      for (const item of sources) single = await saveProductFieldPatch(singleFile,single,'company',item,{scope:'base',
        changes:{[field]:value},expectedRevision:productOverrideRevision(single[productKey('company',item.id)]??{})});
    }
    assert.deepEqual(bulk,single);
    assert.deepEqual(await loadProductOverrides(bulkFile),bulk);
    for (const item of sources) {
      const effective = effectiveProduct(item,bulk[productKey('company',item.id)],'base');
      for (const [field,value] of Object.entries(updates)) assert.equal(effective[field],value);
      const payload = buildBasePayload(effective,config);
      assert.equal(payload.stock.bl_1,10);
      assert.equal(payload.prices[2],220.5);
      for (const field of ['tax_rate','weight','height','width','length']) assert.equal(payload[field],updates[field]);
      assert.equal(Object.hasOwn(payload,'category_id'),false);
      assert.deepEqual(payload.tags,[`Tag ${item.id}`]);
    }
    assert.deepEqual(sources,original);
    await assert.rejects(saveBulkProductField(bulkFile,bulk,'company',sources,{scope:'base',field:'quantity',value:3,
      expectedRevisions:{'SKU-1':'{}','SKU-2':'{}'}}),/modificato/);
    assert.deepEqual(await loadProductOverrides(bulkFile),bulk);
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('bulk dialog is opt-in, Base-only and has keyboard close and final preview', () => {
  const page = readFileSync(new URL('../renderer/src/pages/CatalogPage.jsx',import.meta.url),'utf8');
  const dialog = readFileSync(new URL('../renderer/src/components/BulkEditorDialog.jsx',import.meta.url),'utf8');
  const main = readFileSync(new URL('../electron/main.js',import.meta.url),'utf8');
  assert.match(page,/bulkOpen && <BulkEditorDialog/);
  assert.match(page,/Seleziona almeno un prodotto/);
  assert.doesNotMatch(page,/<span>Livello<\/span>/);
  assert.match(dialog,/showModal\(\)/);
  assert.match(dialog,/fieldRef\.current\?\.focus\(\)/);
  assert.match(dialog,/onCancel=/);
  assert.match(dialog,/Anteprima modifiche/);
  assert.match(dialog,/Applica a \$\{selectedProducts\.length\} prodotti/);
  assert.match(dialog,/scope: 'base'/);
  assert.match(main,/input\.scope !== 'base'/);
});
