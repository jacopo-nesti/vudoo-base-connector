const { contextBridge } = require('electron');
const product = { id: 'P-1', sku: 'P-1', title: 'Prodotto prova', description: 'Descrizione', quantity: 12, price: 19, category: 'Prova', canonicalCategory: 'PROVA', basePreflight: { status: 'READY', counts: { BLOCKING: 0, WARNING: 0 }, checks: [] }, overrideRevision: '{}' };
const catalog = { products: [product], totalProducts: 1, channelTitle: 'Catalogo prova', manufacturerName: 'Produttore prova', canonicalOptions: ['PROVA'] };
contextBridge.exposeInMainWorld('electronAPI', {
  getRuntimeMode: async () => ({ dryRun: true, testMode: true, baseConfigured: false }),
  fetchCatalog: async () => catalog,
  getManufacturers: async () => ({ ok: true, manufacturers: [
    { id: 1, catalogCode: '390296', name: 'Mazzuoli', baseInventoryId: 119455,
      lastProductCount: 83, lastLoadedAt: '2026-10-14T09:32:00.000Z' },
    { id: 2, catalogCode: '390331', name: 'Carlo Bay', baseInventoryId: null,
      lastProductCount: null, lastLoadedAt: null },
  ] }),
  searchManufacturers: async query => ({ ok: true, results: [{ catalog_code: '1', name: 'Produttore prova' }]
    .filter(item => `${item.name} ${item.catalog_code}`.toLowerCase().includes(query.toLowerCase())) }),
});
