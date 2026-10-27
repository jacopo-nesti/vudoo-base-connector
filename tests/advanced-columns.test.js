import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UI_KEY, allowStartupViewOnNextEntry, clampColumnWidth, defaultColumnOrder, defaultColumnWidths,
  pinnedColumnOffsets, productColumns, readLayoutPreferences, readTableState, sanitizeSnapshot,
  shouldApplyStartupView, visibleColumnOrder, writeLayoutPreferences, writeTableState,
} from '../renderer/src/uiPreferences.js';

const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
};

test('compact column defaults apply to new and reset tables without changing saved widths or views', () => {
  const storage = memory();
  const defaults = defaultColumnWidths();
  assert.deepEqual(defaults, {
    sku: 100, title: 300, ean: 135, brand: 120,
    category: 160, mpn: 110, price: 90, stock: 80,
  });
  assert.ok(defaults.title > Math.max(...Object.entries(defaults).filter(([key]) => key !== 'title').map(([, width]) => width)));
  assert.deepEqual(readTableState('base', storage).widths, defaults);

  const state = readTableState('base', storage);
  state.widths.price = 145;
  state.widths.category = 315;
  state.views = [{ id: 'custom', name: 'Custom', widths: { price: 130, title: 440 } }];
  assert.equal(writeTableState('base', state, storage), true);
  const reopened = readTableState('base', storage);
  assert.equal(reopened.widths.price, 145);
  assert.equal(reopened.widths.category, 315);
  assert.equal(reopened.views[0].widths.price, 130);
  assert.equal(reopened.views[0].widths.title, 440);

  assert.equal(writeTableState('base', { ...reopened, widths: defaultColumnWidths() }, storage), true);
  const reset = readTableState('base', storage);
  assert.deepEqual(reset.widths, defaults);
  assert.equal(reset.views[0].widths.price, 130);
  assert.equal(reset.views[0].widths.title, 440);
});

test('product columns keep visibility, order, widths, pins and sorting on reload', () => {
  const storage = memory();
  const state = readTableState('base', storage);
  state.columns.ean = false;
  state.order = ['price', 'title', 'sku', ...defaultColumnOrder().filter(key => !['price', 'title', 'sku'].includes(key))];
  state.widths.price = 153;
  state.widths.title = 460;
  state.pinned = ['price', 'title'];
  state.sort = 'price:desc';
  assert.equal(writeTableState('base', state, storage), true);
  const reopened = readTableState('base', storage);
  assert.equal(reopened.columns.ean, false);
  assert.deepEqual(visibleColumnOrder(reopened).slice(0, 3), ['price', 'title', 'sku']);
  assert.equal(reopened.widths.price, 153);
  assert.equal(reopened.widths.title, 460);
  assert.deepEqual(reopened.pinned, ['price', 'title']);
  assert.equal(reopened.sort, 'price:desc');
  assert.deepEqual(pinnedColumnOffsets(reopened), { price: 42, title: 195 });
});

test('column width bounds and incompatible stored columns recover safely', () => {
  assert.equal(clampColumnWidth('title', 0), productColumns.title.min);
  assert.equal(clampColumnWidth('title', 9999), productColumns.title.max);
  assert.equal(clampColumnWidth('title', 'invalid'), productColumns.title.defaultWidth);
  const storage = memory();
  storage.setItem(UI_KEY, JSON.stringify({ schemaVersion: 1, base: {
    columns: { title: false, sku: true, removed: true },
    order: ['removed', 'sku', 'sku', 'title'],
    widths: { title: 9999, sku: 1, removed: 999 },
    pinned: ['removed', 'sku', 'ean'],
    sort: 'sku:desc',
  } }));
  const reopened = readTableState('base', storage);
  assert.equal(reopened.columns.title, true); // Product actions are housed here.
  assert.deepEqual(reopened.order.slice(0, 2), ['sku', 'title']);
  assert.equal(reopened.widths.title, productColumns.title.max);
  assert.equal(reopened.widths.sku, productColumns.sku.min);
  assert.deepEqual(reopened.pinned, ['sku', 'ean']);
  assert.equal(reopened.sort, 'sku:desc');
  assert.equal(Object.hasOwn(reopened.columns, 'removed'), false);
});

test('saved views preserve advanced table preferences and old views gain defaults', () => {
  const storage = memory();
  const state = readTableState('base', storage);
  state.views = [{
    id: 'desk', name: 'Desk', filters: { search: 'penna' },
    columns: { price: false }, order: ['title', 'sku'], widths: { title: 440 },
    pinned: ['title'], density: 'compact', sort: 'sku:desc', pageSize: 80,
  }];
  state.startup = 'desk';
  assert.equal(writeTableState('base', state, storage), true);
  const view = readTableState('base', storage).views[0];
  assert.equal(view.columns.price, false);
  assert.deepEqual(view.order.slice(0, 2), ['title', 'sku']);
  assert.equal(view.widths.title, 440);
  assert.deepEqual(view.pinned, ['title']);
  assert.equal(view.density, 'compact');
  assert.equal(view.sort, 'sku:desc');
  assert.equal(view.pageSize, 80);
  assert.equal(view.filters.search, 'penna');
  storage.setItem(UI_KEY, JSON.stringify({ schemaVersion: 1, base: { startup: 'old', views: [{ id: 'old', name: 'Old', columns: { ean: false }, sort: 'sku' }] } }));
  const old = readTableState('base', storage);
  assert.equal(old.startup, 'old');
  assert.equal(old.views[0].columns.ean, false);
  assert.deepEqual(old.views[0].order, defaultColumnOrder());
  assert.deepEqual(old.views[0].widths, defaultColumnWidths());
  assert.deepEqual(old.views[0].pinned, []);
});

test('reset table preferences does not delete saved views', () => {
  const storage = memory();
  const state = readTableState('base', storage);
  state.widths.sku = 185;
  state.views = [{ id: 'saved', name: 'Saved', columns: { sku: true }, widths: { sku: 185 } }];
  state.startup = 'saved';
  writeTableState('base', state, storage);
  const reset = { ...state, columns: sanitizeSnapshot('base').columns, order: defaultColumnOrder(),
    widths: defaultColumnWidths(), pinned: [], sort: 'source', density: 'comfortable', startup: '' };
  writeTableState('base', reset, storage);
  const reopened = readTableState('base', storage);
  assert.equal(reopened.widths.sku, productColumns.sku.defaultWidth);
  assert.equal(reopened.sort, 'source');
  assert.equal(reopened.startup, '');
  assert.equal(reopened.views[0].widths.sku, 185);
});

test('startup view applies only once unless its selection changes', () => {
  const channel = 'base-advanced-columns-test';
  assert.equal(shouldApplyStartupView(channel), true);
  assert.equal(shouldApplyStartupView(channel), false);
  allowStartupViewOnNextEntry(channel);
  assert.equal(shouldApplyStartupView(channel), true);
});

test('pinning adapts to the measured viewport without losing the saved choices', () => {
  const state = sanitizeSnapshot('base', {
    widths: { sku: 230, title: 550, ean: 230 },
    pinned: ['sku', 'title', 'ean'],
  });
  assert.deepEqual(pinnedColumnOffsets(state, 42, 500), { sku: 42 });
  assert.deepEqual(pinnedColumnOffsets(state, 42, 1100), { sku: 42, title: 272, ean: 822 });
  assert.deepEqual(state.pinned, ['sku', 'title', 'ean']);
  assert.deepEqual(visibleColumnOrder(state).slice(0, 3), ['sku', 'title', 'ean']);
});

test('table reset is wired to the existing layout page-size preference', () => {
  const settings = readFileSync(new URL('../renderer/src/SettingsPanel.jsx', import.meta.url), 'utf8');
  assert.match(settings, /onResetPageSize\(\)/);
  assert.match(settings, /onResetPageSize=\{\(\) => updateLayout\(\{ pageSize: 50 \}\)\}/);
  assert.match(settings, /views: previous\.views|le viste personali sono state conservate/);
  const storage = memory();
  assert.equal(writeLayoutPreferences({ pageSize: 80 }, storage), true);
  assert.equal(writeLayoutPreferences({ pageSize: 50 }, storage), true);
  assert.equal(readLayoutPreferences(storage).pageSize, 50);
});
