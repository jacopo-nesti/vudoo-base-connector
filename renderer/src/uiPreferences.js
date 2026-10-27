export const UI_KEY = 'vudoo.ui.tables.v1';
const startupHandled = new Set();
export function shouldApplyStartupView(channel) {
  if (startupHandled.has(channel)) return false;
  startupHandled.add(channel);
  return true;
}
export function markStartupViewHandled(channel) { startupHandled.add(channel); }
export function allowStartupViewOnNextEntry(channel) { startupHandled.delete(channel); }

export const layoutDefaults = Object.freeze({ sidebarCollapsed: false, pageSize: 50, theme: 'light', accent: 'blue', animations: true, tableFontSize: 12, radius: 8 });
export function readLayoutPreferences(storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(UI_KEY) || '{}');
    return {
      sidebarCollapsed: typeof all?.layout?.sidebarCollapsed === 'boolean' ? all.layout.sidebarCollapsed : layoutDefaults.sidebarCollapsed,
      pageSize: Number.isInteger(all?.layout?.pageSize) && all.layout.pageSize >= 10 && all.layout.pageSize <= 200 ? all.layout.pageSize : layoutDefaults.pageSize,
      theme: ['light', 'dark', 'system'].includes(all?.layout?.theme) ? all.layout.theme : layoutDefaults.theme,
      accent: ['blue', 'azure', 'cyan'].includes(all?.layout?.accent) ? all.layout.accent : layoutDefaults.accent,
      animations: typeof all?.layout?.animations === 'boolean' ? all.layout.animations : layoutDefaults.animations,
      tableFontSize: Number.isInteger(all?.layout?.tableFontSize) && all.layout.tableFontSize >= 12 && all.layout.tableFontSize <= 18 ? all.layout.tableFontSize : layoutDefaults.tableFontSize,
      radius: Number.isInteger(all?.layout?.radius) && all.layout.radius >= 0 && all.layout.radius <= 24 ? all.layout.radius : layoutDefaults.radius,
    };
  } catch { return { ...layoutDefaults }; }
}
export function writeLayoutPreferences(patch, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(UI_KEY) || '{}');
    const layout = { ...readLayoutPreferences(storage), ...patch };
    if (typeof layout.sidebarCollapsed !== 'boolean' || !Number.isInteger(layout.pageSize) || layout.pageSize < 10 || layout.pageSize > 200 || !['light', 'dark', 'system'].includes(layout.theme) || !['blue', 'azure', 'cyan'].includes(layout.accent) || typeof layout.animations !== 'boolean' || !Number.isInteger(layout.tableFontSize) || layout.tableFontSize < 12 || layout.tableFontSize > 18 || !Number.isInteger(layout.radius) || layout.radius < 0 || layout.radius > 24) return false;
    storage.setItem(UI_KEY, JSON.stringify({ ...all, schemaVersion: 1, layout }));
    globalThis.dispatchEvent?.(new Event('vudoo:ui-preferences'));
    return true;
  } catch { return false; }
}
export function resetVisualPreferences(storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(UI_KEY) || '{}');
    storage.setItem(UI_KEY, JSON.stringify({ ...all, schemaVersion: 1, layout: { ...layoutDefaults },
      base: all?.base ? { ...all.base, density: 'comfortable' } : all?.base }));
    globalThis.dispatchEvent?.(new Event('vudoo:ui-preferences'));
    return true;
  } catch { return false; }
}

// Only columns already present in the Product Manager table; selection is structural.
export const productColumns = Object.freeze({
  sku:      { label: 'SKU',       min: 80,  defaultWidth: 100, max: 240, sort: 'sku' },
  title:    { label: 'Prodotto',  min: 180, defaultWidth: 300, max: 600, sort: 'title' },
  ean:      { label: 'EAN',       min: 100, defaultWidth: 135, max: 240, sort: 'ean' },
  brand:    { label: 'Brand',     min: 100, defaultWidth: 120, max: 280 },
  category: { label: 'Categoria', min: 140, defaultWidth: 160, max: 400 },
  mpn:      { label: 'MPN',       min: 90,  defaultWidth: 110, max: 260 },
  price:    { label: 'Prezzo',    min: 116, defaultWidth: 124, max: 240, sort: 'price' },
  stock:    { label: 'Scorta',    min: 96,  defaultWidth: 100, max: 180, sort: 'quantity' },
});
export const columnDefinitions = { base: Object.fromEntries(Object.entries(productColumns).map(([key, value]) => [key, value.label])) };
export const defaultColumns = channel => Object.fromEntries(Object.keys(columnDefinitions[channel] || {}).map(key => [key, key !== 'mpn']));
export const defaultColumnOrder = () => Object.keys(productColumns);
export const defaultColumnWidths = () => Object.fromEntries(Object.entries(productColumns).map(([key, value]) => [key, value.defaultWidth]));
const cleanText = value => typeof value === 'string' ? value.slice(0, 200) : '';
const filterKeys = ['search','categoryFilter','canonicalFilter','availabilityFilter','eanFilter','imageFilter','baseCategoryFilter'];
const validSort = value => /^(source|title|sku|ean|quantity|price|status)(:desc)?$/.test(value);
export function clampColumnWidth(key, value) {
  const column = productColumns[key];
  if (!column) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(column.min, Math.min(column.max, Math.round(number))) : column.defaultWidth;
}
export function sanitizeSnapshot(channel, input = {}) {
  input = input && typeof input === 'object' ? input : {};
  const keys = Object.keys(columnDefinitions[channel] || {});
  const selectedOrder = Array.isArray(input.order) ? input.order.filter(key => keys.includes(key)) : [];
  const order = [...new Set([...selectedOrder, ...keys])];
  const columns = Object.fromEntries(Object.entries(defaultColumns(channel)).map(([key, value]) => [key, typeof input.columns?.[key] === 'boolean' ? input.columns[key] : value]));
  // Product actions and inspector are hosted in this column.
  if (keys.includes('title')) columns.title = true;
  const widths = Object.fromEntries(keys.map(key => [key, clampColumnWidth(key, input.widths?.[key] ?? productColumns[key].defaultWidth)]));
  const pinned = Array.isArray(input.pinned) ? [...new Set(input.pinned.filter(key => keys.includes(key) && columns[key]))] : [];
  return {
    channel, density: input.density === 'compact' ? 'compact' : 'comfortable',
    columns, order, widths, pinned,
    ...(Number.isInteger(input.pageSize) && input.pageSize >= 10 && input.pageSize <= 200 ? { pageSize: input.pageSize } : {}),
    sort: validSort(input.sort) ? input.sort : 'source',
    filters: Object.fromEntries(filterKeys.filter(key => typeof input.filters?.[key] === 'string').map(key => [key, cleanText(input.filters[key])])),
  };
}
export function visibleColumnOrder(snapshot) {
  const keys = (snapshot.order || defaultColumnOrder()).filter(key => snapshot.columns?.[key] && productColumns[key]);
  const pinned = new Set(snapshot.pinned || []);
  return [...keys.filter(key => pinned.has(key)), ...keys.filter(key => !pinned.has(key))];
}
export function pinnedColumnOffsets(snapshot, selectionWidth = 42, maxWidth = Infinity) {
  const result = {};
  let offset = selectionWidth;
  for (const key of visibleColumnOrder(snapshot)) {
    if (!snapshot.pinned?.includes(key)) break;
    // Preserve the preference, but stop making further columns sticky when they
    // would cover most of the table viewport. Remaining columns can be scrolled.
    if (offset + clampColumnWidth(key, snapshot.widths?.[key]) > maxWidth) break;
    result[key] = offset;
    offset += clampColumnWidth(key, snapshot.widths?.[key]);
  }
  return result;
}
export function readTableState(channel, storage) {
  try {
    storage ??= globalThis.localStorage;
    const all = JSON.parse(storage?.getItem(UI_KEY) || '{}');
    const raw = all?.schemaVersion === 1 ? all[channel] : {};
    const views = Array.isArray(raw?.views) ? raw.views.slice(0,30).filter(v => v && typeof v.id === 'string' && typeof v.name === 'string').map(v => ({id: v.id.slice(0,80), name: v.name.slice(0,60), ...sanitizeSnapshot(channel,v)})) : [];
    return { ...sanitizeSnapshot(channel,raw), views, startup: views.some(v => v.id === raw?.startup) ? raw.startup : '' };
  } catch { return {...sanitizeSnapshot(channel),views:[],startup:''}; }
}
export function writeTableState(channel, state, storage) {
  try {
    storage ??= globalThis.localStorage;
    const all = JSON.parse(storage.getItem(UI_KEY) || '{}');
    const views = Array.isArray(state.views) ? state.views.slice(0, 30).map(v => ({ id:v.id, name:v.name.slice(0,60), ...sanitizeSnapshot(channel,v) })) : [];
    const startup = views.some(view => view.id === state.startup) ? state.startup : '';
    storage.setItem(UI_KEY, JSON.stringify({...all,schemaVersion:1,[channel]:{...sanitizeSnapshot(channel,state),filters:{},views,startup}}));
    globalThis.dispatchEvent?.(new Event('vudoo:ui-preferences'));
    return true;
  } catch { return false; }
}
export function sortProductRows(rows, sort, channel) {
  if (!sort || sort === 'source') return rows;
  const [key, direction] = sort.split(':');
  const get = row => { const p = row.product ?? row; return key === 'status' ? p.basePreflight?.status : p[key]; };
  return rows.map((row,index)=>({row,index})).sort((a,b)=>{
    const av=get(a.row), bv=get(b.row);
    if (av == null || av === '') return bv == null || bv === '' ? a.index-b.index : 1;
    if (bv == null || bv === '') return -1;
    const result = ['price','quantity'].includes(key) && Number.isFinite(Number(av)) && Number.isFinite(Number(bv)) ? Number(av)-Number(bv) : String(av).localeCompare(String(bv),'it',{numeric:true,sensitivity:'base'});
    return result * (direction === 'desc' ? -1 : 1) || a.index-b.index;
  }).map(item=>item.row);
}
