const { app, BrowserWindow, session } = require('electron');
const http = require('node:http');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', error => { if (error.code !== 'EPIPE') throw error; });
}
function write(stream, value) {
  try { stream.write(value); }
  catch (error) { if (error.code !== 'EPIPE') throw error; }
}
app.disableHardwareAcceleration();
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'vudoo-interaction-')));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const mime = p => p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.png') ? 'image/png' : 'text/html';
async function run() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const file = path.resolve(root, 'renderer/dist', `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    if (!file.startsWith(path.resolve(root, 'renderer/dist') + path.sep)) { response.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => { if (error) response.writeHead(404).end(); else response.writeHead(200, { 'Content-Type': mime(file) }).end(data); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) && !details.url.startsWith(`http://127.0.0.1:${port}/`) }));
  const win = new BrowserWindow({ show: false, width: 1200, height: 850, webPreferences: { preload: path.join(__dirname, 'interaction-preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  const rendererErrors = [];
  win.webContents.on('console-message', (_, level, message) => {
    if (level >= 3) { rendererErrors.push(message); write(process.stderr, `RENDERER ${message}\n`); }
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
  await win.webContents.executeJavaScript('window.confirm = () => true; undefined');
  async function js(code) { return win.webContents.executeJavaScript(code); }
  async function waitFor(selector, present = true) { for (let i=0;i<80;i++) { if (Boolean(await js(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) === present) return; await sleep(40); } throw Error(`timeout ${selector} ${present}`); }
  async function click(selector) { await js(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center'})`); await sleep(80); const box = await js(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e) return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,tag:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.tagName,cls:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.className};})()`); if (!box) throw Error(`no ${selector}`); win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(box.x),y:Math.round(box.y),button:'left',clickCount:1}); win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(box.x),y:Math.round(box.y),button:'left',clickCount:1}); await sleep(80); return box; }
  async function key(keyCode) { win.webContents.sendInputEvent({ type:'keyDown', keyCode }); win.webContents.sendInputEvent({ type:'keyUp', keyCode }); await sleep(80); }
  function report(label, data) { write(process.stdout, `${label} ${JSON.stringify(data)}\n`); }
  try {
    await waitFor('.topbar-search input');
    assert.equal(await js(`document.querySelector('.dashboard-hero h1')?.textContent`), 'Cerca il tuo catalogo');
    assert.equal(await js(`document.querySelector('.dashboard-guide, .dashboard-system')`), null);
    await waitFor('.dashboard-recent-item');
    assert.equal(await js(`document.querySelectorAll('.dashboard-recent-item').length`), 1);
    await click('.sidebar-nav > div:nth-child(2) .sidebar-item');
    await waitFor('.manufacturer-card');
    assert.equal(await js(`document.querySelectorAll('.manufacturer-card').length`), 2);
    assert.equal(await js(`document.querySelector('.manufacturer-card .tag')?.textContent`), 'Inventory associato');
    await js(`(() => {const input=document.querySelector('.manufacturers-toolbar input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'390331'); input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await sleep(80);
    assert.equal(await js(`document.querySelectorAll('.manufacturer-card').length`), 1);
    assert.equal(await js(`document.querySelector('.manufacturer-card .tag')?.textContent`), 'Inventory non associato');
    await click('.sidebar-nav > div:nth-child(1) .sidebar-item');
    await click('.sidebar-nav > div:last-child .sidebar-item');
    assert.equal(await js(`document.querySelector('.help-page h1')?.textContent`), 'Guida');
    await click('.sidebar-nav > div:nth-child(1) .sidebar-item');
    await js(`(() => { const input=document.querySelector('.dashboard-hero .catalog-lookup input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Produttore'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(300);
    assert.equal(await js(`document.querySelectorAll('.dashboard-hero .catalog-lookup-results li').length`), 1);
    await js(`(() => { const input=document.querySelector('.dashboard-hero .catalog-lookup input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await sleep(300);
    assert.equal(await js(`document.querySelectorAll('.dashboard-hero .catalog-lookup-results li').length`), 1);
    await click('.dashboard-hero .catalog-lookup-results button'); await waitFor('.product-details-action');
    assert.equal(await js(`document.querySelector('.sidebar-item[aria-current="page"] span')?.textContent`), 'Prodotti');
    for(let i=0;i<8;i++) {
      report(`OPEN ${i}`,await click('.product-details-action')); await waitFor('.product-dialog[open]');
      await click('#field-ean');
      const before=await js(`({active:document.activeElement?.id,dialog:document.querySelectorAll('dialog[open]').length,hit:document.elementFromPoint(...(() => {let r=document.querySelector('#field-ean').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})())?.id})`);
      assert.equal(before.active, 'field-ean'); assert.equal(before.hit, 'field-ean');
      if (i === 0) {
        win.webContents.sendInputEvent({type:'char',keyCode:'1'}); await sleep(80);
        assert.equal(await js(`document.querySelector('#field-ean').value`), '1');
        await key('Tab');
        assert.equal(await js(`document.activeElement?.id`), 'field-mpn');
      }
      if (i%3===0) await click('.product-dialog-close'); else if (i%3===1) await key('Escape'); else await click('.product-dialog-footer .btn-secondary');
      await waitFor('.product-dialog', false);
      const after=await js(`({active:document.activeElement?.outerHTML.slice(0,90),dialogs:document.querySelectorAll('dialog[open]').length,overlays:document.querySelectorAll('.workspace-overlay').length,top:document.elementFromPoint(500,100)?.className})`);
      assert.equal(after.dialogs, 0); assert.equal(after.overlays, 0);
      report(`DETAIL ${i}`,{before,after});
    }
    await click('.table input[type="checkbox"]');
    for(let i=0;i<6;i++) {
      await click('.selection-next button:nth-last-child(2)'); await waitFor('.bulk-editor-dialog[open]');
      await click('.bulk-editor-dialog select');
      const focused = await js(`document.activeElement === document.querySelector('.bulk-editor-dialog select')`);
      assert.equal(focused, true); report(`BULK_FOCUS ${i}`, focused);
      if (i === 0) {
        await js(`(() => { const select=document.querySelector('.bulk-editor-dialog select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'quantity'); select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
        await waitFor('.bulk-editor-dialog input');
        await click('.bulk-editor-dialog input');
        win.webContents.sendInputEvent({type:'char',keyCode:'3'}); await sleep(80);
        assert.equal(await js(`document.querySelector('.bulk-editor-dialog input').value`), '3');
      }
      if(i%2) await key('Escape'); else await click('.bulk-editor-header .product-dialog-close');
      await waitFor('.bulk-editor-dialog',false);
      report(`BULK ${i}`,await js(`({dialogs:document.querySelectorAll('dialog[open]').length,active:document.activeElement?.outerHTML.slice(0,90)})`));
    }
    for(let i=0;i<6;i++) { await click('.workspace-command-trigger'); await waitFor('.workspace-overlay'); const focused=await js(`document.activeElement === document.querySelector('.command-palette input')`); assert.equal(focused,true); report(`PALETTE_FOCUS ${i}`,focused); if(i%2) await key('Escape'); else await click('.command-palette button'); await waitFor('.workspace-overlay',false); report(`PALETTE ${i}`,await js(`({active:document.activeElement?.outerHTML.slice(0,90),overlays:document.querySelectorAll('.workspace-overlay').length})`)); }
    await click('.sidebar-nav > div:nth-child(1) .sidebar-item');
    await waitFor('.dashboard-hero h1');
    await click('.dashboard-recent-item'); await waitFor('.product-details-action');
    await click('.sidebar-nav > div:nth-child(1) .sidebar-item'); await waitFor('.dashboard-hero h1');
    await click('.dashboard-recents .card-heading button'); await waitFor('.manufacturer-card');
    await click('.sidebar-nav > div:nth-child(3) .sidebar-item');
    await waitFor('.product-details-action');
    await click('.catalog-context'); await waitFor('.catalog-switcher[open]');
    await key('Escape'); await waitFor('.catalog-switcher', false);
    assert.equal(await js(`document.querySelectorAll('dialog[open], .workspace-overlay').length`), 0);
    await click('.catalog-context'); await waitFor('.catalog-switcher[open]');
    await js(`(() => { const input=document.querySelector('.catalog-lookup input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'2'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await waitFor('.catalog-lookup > button');
    await click('.catalog-lookup > button'); await waitFor('.catalog-switcher', false);
    assert.equal(await js(`document.querySelector('.catalog-context small')?.textContent.includes('2')`), true);
    await click('.product-details-action'); await waitFor('.product-dialog[open]');
    await click('#field-ean');
    assert.equal(await js(`document.activeElement?.id`), 'field-ean');
    await key('Escape'); await waitFor('.product-dialog', false);
    await click('.topbar-search input');
    const inputFocus = await js(`document.activeElement === document.querySelector('.topbar-search input')`);
    win.webContents.sendInputEvent({type:'char',keyCode:'Z'}); await sleep(80);
    const inputValue = await js(`document.querySelector('.topbar-search input').value`);
    await click('.enterprise-table-tools select');
    const selectFocus = await js(`document.activeElement === document.querySelector('.enterprise-table-tools select')`);
    report('FINAL',await js(`({dialogs:document.querySelectorAll('dialog[open]').length,overlays:document.querySelectorAll('.workspace-overlay').length,active:document.activeElement?.outerHTML.slice(0,90)})`));
    report('INTERACTION',{inputFocus,inputValue,selectFocus});
    assert.equal(inputFocus, true); assert.equal(inputValue, 'Z'); assert.equal(selectFocus, true);
    assert.deepEqual(rendererErrors, []);
  } catch (error) {
    const snapshot = await js(`({ active: document.activeElement?.outerHTML.slice(0, 120), dialogs: [...document.querySelectorAll('dialog[open]')].map(item => item.className), overlays: document.querySelectorAll('.workspace-overlay').length, focusedPointerEvents: document.activeElement ? getComputedStyle(document.activeElement).pointerEvents : null })`).catch(() => null);
    write(process.stderr, `INTERACTION SNAPSHOT ${JSON.stringify(snapshot)}\n`);
    throw error;
  } finally { win.destroy(); await new Promise(resolve=>server.close(resolve)); app.quit(); }
}
app.whenReady().then(run).catch(error=>{write(process.stderr, `${error.stack}\n`); app.exit(1);});
