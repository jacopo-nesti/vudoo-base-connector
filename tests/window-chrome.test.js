import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { attachWindowChrome, registerWindowIpc } from '../electron/windowChrome.js';

test('window IPC acts only on the requesting live BrowserWindow', () => {
  const handlers = new Map();
  const ipcMain = { handle: (channel, callback) => handlers.set(channel, callback) };
  const window = {
    maximized: false, closed: false, minimized: false, destroyed: false,
    isDestroyed() { return this.destroyed; },
    isMaximized() { return this.maximized; },
    isFullScreen() { return false; },
    minimize() { this.minimized = true; },
    maximize() { this.maximized = true; },
    unmaximize() { this.maximized = false; },
    close() { this.closed = true; },
  };
  registerWindowIpc(ipcMain, { fromWebContents: sender => sender === 'own' ? window : null });
  const own = { sender: 'own' };
  assert.deepEqual(handlers.get('window:get-state')(own), { maximized: false, fullscreen: false });
  handlers.get('window:minimize')(own);
  assert.equal(window.minimized, true);
  handlers.get('window:toggle-maximize')(own);
  assert.equal(window.maximized, true);
  handlers.get('window:toggle-maximize')(own);
  assert.equal(window.maximized, false);
  handlers.get('window:close')(own);
  assert.equal(window.closed, true);
  window.closed = false;
  handlers.get('window:close')({ sender: 'other' });
  assert.equal(window.closed, false);
  window.destroyed = true;
  handlers.get('window:toggle-maximize')(own);
  assert.equal(window.maximized, false);
});

test('window state is sent on maximize, restore and fullscreen; dev shortcuts remain available', () => {
  const window = new EventEmitter();
  const webContents = new EventEmitter();
  const sent = [];
  let devtools = 0; let reload = 0; let uncachedReload = 0; let menu = 'original';
  webContents.send = (...args) => sent.push(args);
  webContents.toggleDevTools = () => { devtools++; };
  webContents.reload = () => { reload++; };
  webContents.reloadIgnoringCache = () => { uncachedReload++; };
  window.webContents = webContents;
  window.setMenu = value => { menu = value; };
  window.isDestroyed = () => false;
  window.isMaximized = () => true;
  window.isFullScreen = () => false;
  window.setFullScreen = value => sent.push(['fullscreen-request', value]);
  attachWindowChrome(window, { isPackaged: false });
  assert.equal(menu, null);
  for (const event of ['maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen']) window.emit(event);
  assert.equal(sent.filter(([channel]) => channel === 'window:state-changed').length, 4);
  assert.deepEqual(sent[0][1], { maximized: true, fullscreen: false });
  const keyEvent = { preventDefault() {} };
  webContents.emit('before-input-event', keyEvent, { type: 'keyDown', key: 'F11' });
  webContents.emit('before-input-event', keyEvent, { type: 'keyDown', key: 'F12' });
  webContents.emit('before-input-event', keyEvent, { type: 'keyDown', key: 'r', control: true });
  webContents.emit('before-input-event', keyEvent, { type: 'keyDown', key: 'r', control: true, shift: true });
  assert.deepEqual(sent.at(-1), ['fullscreen-request', true]);
  assert.equal(devtools, 1);
  assert.equal(reload, 1);
  assert.equal(uncachedReload, 1);
});

test('preload exposes only narrow window methods and removes state listener', () => {
  const source = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
  const invoked = [];
  let api;
  let listener;
  const ipcRenderer = {
    invoke: channel => { invoked.push(channel); return channel; },
    on: (_channel, callback) => { listener = callback; },
    removeListener: (channel, callback) => { assert.equal(channel, 'window:state-changed'); assert.equal(callback, listener); listener = null; },
  };
  vm.runInNewContext(source, {
    require: name => { assert.equal(name, 'electron'); return { ipcRenderer, contextBridge: { exposeInMainWorld: (_key, value) => { api = value; } } }; },
  });
  assert.equal(api.ipcRenderer, undefined);
  assert.equal(api.send, undefined);
  api.minimizeWindow(); api.toggleMaximizeWindow(); api.closeWindow(); api.getWindowState();
  assert.deepEqual(invoked, ['window:minimize', 'window:toggle-maximize', 'window:close', 'window:get-state']);
  let reported;
  const unsubscribe = api.onWindowStateChanged(value => { reported = value; });
  listener(null, { maximized: true, fullscreen: false, secret: 'ignored' });
  assert.deepEqual(JSON.parse(JSON.stringify(reported)), { maximized: true, fullscreen: false });
  unsubscribe();
  assert.equal(listener, null);
});

test('desktop entrypoint uses frameless window, removes native menu and keeps renderer isolated', () => {
  const main = readFileSync(new URL('../electron/main.js', import.meta.url), 'utf8');
  const shell = readFileSync(new URL('../renderer/src/components/AppShell.jsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../renderer/src/index.css', import.meta.url), 'utf8');
  assert.match(main, /frame:\s*false/);
  assert.match(main, /Menu\.setApplicationMenu\(null\)/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(shell, /window-controls/);
  assert.match(css, /-webkit-app-region:\s*drag/);
  assert.match(css, /-webkit-app-region:\s*no-drag/);
  assert.match(shell, /window-drag-handle/);
  assert.match(css, /\.window-drag-handle\s*\{[^}]*-webkit-app-region:\s*drag/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,1fr\)\s+32px\s+auto/);
});
