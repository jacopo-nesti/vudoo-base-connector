const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("app:ping"),
  getBaseOrder: (orderId) => ipcRenderer.invoke('orders:get', orderId),
  checkEnvironment: () => ipcRenderer.invoke("environment:check"),
  getRuntimeMode: () => ipcRenderer.invoke("app:runtime-mode"),
  setOperatingMode: (mode) => ipcRenderer.invoke("app:set-operating-mode", mode),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  restartApp: () => ipcRenderer.invoke("app:restart"),
  fetchCatalog: (companyCode) =>
    ipcRenderer.invoke("catalog:fetch", companyCode),
  getManufacturers: () => ipcRenderer.invoke('manufacturers:list'),
  searchManufacturers: (query) => ipcRenderer.invoke('manufacturers:search', query),
  saveManufacturer: (input) => ipcRenderer.invoke('manufacturers:save', input),
  selectManufacturerInventory: (inventoryId) => ipcRenderer.invoke('catalog:inventory-select', inventoryId),
  retryManufacturerInventory: () => ipcRenderer.invoke('catalog:inventory-retry'),
  saveProductOverride: (input) => ipcRenderer.invoke('catalog:save-product-override', input),
  saveProductFields: (input) => ipcRenderer.invoke('catalog:save-fields', input),
  bulkEditProducts: (input) => ipcRenderer.invoke('catalog:bulk-edit', input),
  basePayloadPreview: (id) => ipcRenderer.invoke('catalog:base-preview', id),
  preflightSelected: (selectedIds) =>
    ipcRenderer.invoke("catalog:preflight-selected", selectedIds),
  importSelected: (selectedIds) =>
    ipcRenderer.invoke("catalog:import-selected", selectedIds),
  preflightFullCatalog: () => ipcRenderer.invoke("catalog:preflight-all"),
  importFullCatalog: () => ipcRenderer.invoke("catalog:import-all"),
  syncManufacturers: () => ipcRenderer.invoke("catalog:sync-manufacturers"),
});
