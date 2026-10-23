export const UI_KEY = 'vudoo.ui.tables.v1';
const startupHandled = new Set();
export function shouldApplyStartupView(channel) {
  if (startupHandled.has(channel)) return false;
  startupHandled.add(channel);
  return true;
}
export function markStartupViewHandled(channel) { startupHandled.add(channel); }
const layoutDefaults = Object.freeze({ sidebarCollapsed: false, pageSize: 50 });
export function readLayoutPreferences(storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(UI_KEY) || '{}');
    return {
      sidebarCollapsed: typeof all?.layout?.sidebarCollapsed === 'boolean' ? all.layout.sidebarCollapsed : layoutDefaults.sidebarCollapsed,
      pageSize: Number.isInteger(all?.layout?.pageSize) && all.layout.pageSize >= 10 && all.layout.pageSize <= 200 ? all.layout.pageSize : layoutDefaults.pageSize,
    };
  } catch { return { ...layoutDefaults }; }
}
export function writeLayoutPreferences(patch, storage = globalThis.localStorage) {
  try {
    const all = JSON.parse(storage?.getItem(UI_KEY) || '{}');
    const layout = { ...readLayoutPreferences(storage), ...patch };
    if (typeof layout.sidebarCollapsed !== 'boolean' || !Number.isInteger(layout.pageSize) || layout.pageSize < 10 || layout.pageSize > 200) return false;
    storage.setItem(UI_KEY, JSON.stringify({ ...all, schemaVersion: 1, layout }));
    globalThis.dispatchEvent?.(new Event('vudoo:ui-preferences'));
    return true;
  } catch { return false; }
}
export const columnDefinitions = {
  base: { ean:'EAN', brand:'Brand', category:'Categoria', mpn:'MPN', price:'Prezzo', stock:'Scorta' },
};
export const defaultColumns = channel => Object.fromEntries(Object.keys(columnDefinitions[channel]).map(key => [key, key !== 'mpn']));
const cleanText = value => typeof value === 'string' ? value.slice(0, 200) : '';
const filterKeys = ['search','categoryFilter','canonicalFilter','availabilityFilter','eanFilter','imageFilter'];
export function sanitizeSnapshot(channel, input = {}) {
  input = input && typeof input === 'object' ? input : {};
  return { channel, density: input.density === 'compact' ? 'compact' : 'comfortable',
    columns: Object.fromEntries(Object.entries(defaultColumns(channel)).map(([key, value]) => [key, typeof input.columns?.[key] === 'boolean' ? input.columns[key] : value])),
    sort: /^(source|title|sku|ean|quantity|price|status)(:desc)?$/.test(input.sort) ? input.sort : 'source',
    filters: Object.fromEntries(filterKeys.filter(key => typeof input.filters?.[key] === 'string').map(key => [key, cleanText(input.filters[key])])) };
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
    storage.setItem(UI_KEY, JSON.stringify({...all,schemaVersion:1,[channel]:{...sanitizeSnapshot(channel,state),filters:{}, views:state.views.slice(0,30).map(v => ({id:v.id,name:v.name.slice(0,60),...sanitizeSnapshot(channel,v)})),startup:state.startup || ''}}));
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
