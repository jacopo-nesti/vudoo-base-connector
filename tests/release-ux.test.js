import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveBaseToken, deleteBaseToken } from '../electron/baseTokenFile.js';
import { refreshBaseToken } from '../src/config.js';
import { getBaseConnectionState, resetBaseConnectionVerification } from '../src/baseApi.js';
import { attachTextContextMenu, textContextMenuTemplate } from '../electron/textContextMenu.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = file => readFile(path.join(root, file), 'utf8');

test('Base token file: absent, insert, replace and delete preserve other .env entries', async () => {
  const directory = await mkdtemp(path.join(root, '.release-ux-test-'));
  const file = path.join(directory, '.env');
  try {
    assert.deepEqual(await deleteBaseToken(file), { ok: true, configured: false });
    await writeFile(file, '# Operatore\r\nDRY_RUN=true\r\nBASE_API_TOKEN="old-placeholder"\r\nOTHER_FLAG=keep\r\n');
    assert.deepEqual(await saveBaseToken(file, 'new-placeholder'), { ok: true, configured: true });
    let content = await readFile(file, 'utf8');
    assert.equal(parseEnv(content).BASE_API_TOKEN, 'new-placeholder');
    assert.doesNotMatch(content, /old-placeholder/);
    assert.match(content, /# Operatore\r\nDRY_RUN=true/);
    assert.match(content, /OTHER_FLAG=keep/);
    await saveBaseToken(file, 'second-placeholder');
    content = await readFile(file, 'utf8');
    assert.equal(parseEnv(content).BASE_API_TOKEN, 'second-placeholder');
    assert.equal((content.match(/^BASE_API_TOKEN=/gm) || []).length, 1);
    assert.deepEqual(await deleteBaseToken(file), { ok: true, configured: false });
    content = await readFile(file, 'utf8');
    assert.equal(parseEnv(content).BASE_API_TOKEN, undefined);
    assert.match(content, /OTHER_FLAG=keep/);
    assert.deepEqual(await saveBaseToken(file, '\ninvalid'), { ok: false, code: 'invalidToken' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Base client token can be refreshed locally without a network call', () => {
  const previous = process.env.BASE_API_TOKEN;
  try {
    delete process.env.BASE_API_TOKEN;
    refreshBaseToken(); resetBaseConnectionVerification();
    assert.equal(getBaseConnectionState().configured, false);
    process.env.BASE_API_TOKEN = 'offline-placeholder';
    refreshBaseToken(); resetBaseConnectionVerification();
    assert.deepEqual(getBaseConnectionState(), { configured: true, verification: 'unverified', lastConnectedAt: null });
  } finally {
    if (previous === undefined) delete process.env.BASE_API_TOKEN;
    else process.env.BASE_API_TOKEN = previous;
    refreshBaseToken(); resetBaseConnectionVerification();
  }
});

test('token IPC exposes only status and narrow mutations; input remains a password field', async () => {
  const [main, preload, control] = await Promise.all([
    source('electron/main.js'), source('electron/preload.cjs'), source('renderer/src/components/BaseTokenControl.jsx'),
  ]);
  assert.match(main, /base-token:status.*configured: Boolean\(baseConfig\.token\)/);
  assert.match(main, /base-token:set/);
  assert.match(main, /base-token:delete/);
  assert.match(main, /resetBaseConnectionVerification\(\)/);
  assert.match(preload, /getBaseTokenStatus/);
  assert.match(preload, /setBaseToken/);
  assert.match(preload, /deleteBaseToken/);
  assert.match(control, /type="password"/);
  assert.doesNotMatch(control, /type="text"|reveal|Copia token/);
});

test('requested contextual help, import outcome, guide and visible scrollbars are wired', async () => {
  const [settings, help, tooltip, result, guide, css] = await Promise.all([
    source('renderer/src/SettingsPanel.jsx'), source('renderer/src/components/SettingHelp.jsx'),
    source('renderer/src/components/SettingHelp.jsx'), source('renderer/src/CatalogResults.jsx'),
    source('renderer/src/pages/HelpPage.jsx'), source('renderer/src/index.css'),
  ]);
  for (const key of ['vudooResultsLimit', 'vudooTimeoutMs', 'automaticStockCap',
    'baseApiRequestsPerMinute', 'baseApiReadAttempts', 'baseApiRetryDelayMs', 'baseApiRateLimitDelayMs']) {
    assert.match(settings, new RegExp(`${key}: '.+`));
  }
  assert.match(settings, /<SettingHelp label="Limite di prova">/);
  assert.match(settings, /<SettingHelp label="Modalità operativa">/);
  assert.doesNotMatch(settings, /<CategoryMappingsSettings/);
  assert.match(help, /onMouseEnter/);
  assert.match(tooltip, /onFocus|aria-describedby|role="tooltip"/);
  assert.match(result, /Base\.com → Products → Product List/);
  assert.match(result, /Simulazione completata\. Nessuna modifica è stata inviata a Base\.com/);
  assert.match(guide, /Impostazioni → Base\.com → Connessione API/);
  assert.match(guide, /Dopo l['’]importazione/);
  assert.match(css, /--color-scrollbar-thumb: #94a9c2/);
  assert.match(css, /--color-scrollbar-thumb: #7892af/);
  assert.match(css, /\.product-dialog-body \{[^}]*overflow-y: auto/);
  assert.match(css, /\.base-category-dialog \{[^}]*overflow-y: auto/);
});

test('confirmation dialogs use shared modal centering and native focus handling', async () => {
  const [css, token, categories, settings] = await Promise.all([
    source('renderer/src/index.css'), source('renderer/src/components/BaseTokenControl.jsx'),
    source('renderer/src/pages/BaseCategoriesPage.jsx'), source('renderer/src/SettingsPanel.jsx'),
  ]);
  assert.match(css, /dialog:modal\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*margin:\s*auto;/);
  for (const name of ['settings-reset-dialog', 'operating-mode-dialog', 'base-category-dialog']) {
    assert.match(css, new RegExp(`\\.${name} \\{[^}]*max-height:[^}]*overflow-y:\\s*auto`));
  }
  assert.match(css, /\.settings-reset-dialog::backdrop/);
  assert.match(css, /\.base-category-dialog::backdrop/);
  assert.match(token, /removeDialog\.current\?\.showModal\(\)/);
  assert.match(categories, /ref\.current\?\.showModal\(\)/);
  assert.match(settings, /resetDialog\.current\?\.showModal\(\)/);
});

test('Base.com product explanation uses operator language', async () => {
  const product = await source('renderer/src/components/ProductDetailsDialog.jsx');
  assert.match(product, /Le modifiche in questa sezione vengono applicate solo ai dati inviati a Base\.com/);
  assert.match(product, /I dati originali Vudoo non vengono modificati/);
  assert.match(product, /Prima dell'importazione verranno eseguiti automaticamente i controlli necessari/);
  assert.doesNotMatch(product, /Questi override valgono solo per Base\.com\. L'invio richiede il preflight remoto Base\./);
});

test('desktop context menu offers only applicable native edit roles', async () => {
  const flags = { canUndo: true, canRedo: false, canCut: true, canCopy: true, canPaste: true, canSelectAll: true };
  const roles = params => textContextMenuTemplate(params).filter(item => item.role).map(item => item.role);
  assert.deepEqual(roles({ isEditable: true, formControlType: 'input-text', editFlags: flags }),
    ['undo', 'cut', 'copy', 'paste', 'selectAll']);
  assert.deepEqual(roles({ isEditable: true, formControlType: 'input-text', editFlags: { ...flags, canUndo: false, canCut: false, canCopy: false } }),
    ['paste', 'selectAll']);
  assert.deepEqual(roles({ isEditable: true, formControlType: 'input-password', editFlags: flags }),
    ['undo', 'paste', 'selectAll']);
  assert.deepEqual(roles({ isEditable: false, selectionText: 'selected', editFlags: flags }), ['copy', 'selectAll']);
  assert.deepEqual(roles({ isEditable: false, selectionText: '', editFlags: flags }), []);
  const main = await source('electron/main.js');
  assert.match(main, /attachTextContextMenu\(window, Menu\)/);
  let listener; let shown;
  const window = { webContents: { on: (event, callback) => { assert.equal(event, 'context-menu'); listener = callback; } } };
  const Menu = { buildFromTemplate: template => ({ popup: options => { shown = { template, options }; } }) };
  attachTextContextMenu(window, Menu);
  listener({}, { isEditable: true, formControlType: 'input-text', editFlags: flags });
  assert.equal(shown.options.window, window);
  assert.deepEqual(shown.template.filter(item => item.role).map(item => item.role), ['undo', 'cut', 'copy', 'paste', 'selectAll']);
});
