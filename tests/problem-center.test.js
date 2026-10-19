import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveProblems, exactProblemPage, problemCounts } from '../renderer/src/problemCenter.js';

test('Problems aggregates Base checks and omits passing checks', () => {
  const catalog = { products: [
    { id:'534078',sku:'WSBFWGAW',title:'Agenda',basePreflight:{status:'MISSING_REQUIRED_DATA',checks:[
      {code:'ean',field:'ean',status:'BLOCKING',message:'EAN mancante'},
      {code:'category',field:'category',status:'WARNING',message:'Categoria da verificare'},
      {code:'title',field:'title',status:'PASS',message:'Titolo valido'},
    ]}},
    { id:'ready',sku:'OK',title:'Ready',basePreflight:{status:'BASE_READY',checks:[]} },
  ]};
  const problems = deriveProblems({catalog});
  assert.equal(problems.length,2);
  assert.deepEqual(problemCounts(problems),{total:2,error:1,warning:1,products:1});
  assert.deepEqual(problems.map(problem=>problem.page),['base-catalog','base-catalog']);
  assert.ok(problems.every(problem=>problem.search==='WSBFWGAW'));
});

test('global errors use fixed safe copy', () => {
  const problems = deriveProblems({errors:{catalogError:'Bearer secret-token',dryRunInvalid:true}});
  assert.equal(problems.length,2);
  assert.ok(problems.every(problem=>!JSON.stringify(problem).includes('secret-token') && problem.page));
});

test('Base preflight status fallback appears only without specific checks', () => {
  const catalog={products:[{id:'1',title:'Da verificare',basePreflight:{status:'UNMAPPED_CATEGORY',checks:[]}}]};
  const problems=deriveProblems({catalog});
  assert.deepEqual(problems.map(problem=>problem.severity),['warning']);
  assert.equal(problems[0].search,'1');
  assert.equal(deriveProblems({catalog:{products:[]}}).length,0);
});

test('opening a problem locates the exact product despite substring SKU matches and sorting', () => {
  const rows=Array.from({length:111},(_,index)=>({product:{id:`id-${index}`,sku:index===84?'SKU-2':`SKU-2${index}`}}));
  assert.equal(rows.filter(row=>row.product.sku.includes('SKU-2')).length,111);
  assert.equal(exactProblemPage(rows,'id-84'),1);
  assert.equal(exactProblemPage(rows,'id-84',20),4);
  assert.equal(exactProblemPage(rows,'id-404'),-1);
});
