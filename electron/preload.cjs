const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("app:ping"),
  checkEnvironment: () => ipcRenderer.invoke("environment:check"),
  diagnoseAmazon: () => ipcRenderer.invoke("amazon:diagnose"),
  getRuntimeMode: () => ipcRenderer.invoke("app:runtime-mode"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  restartApp: () => ipcRenderer.invoke("app:restart"),
  fetchCatalog: (companyCode) =>
    ipcRenderer.invoke("catalog:fetch", companyCode),
  saveProductOverride: (input) => ipcRenderer.invoke('catalog:save-product-override', input),
  preflightSelected: (selectedIds) =>
    ipcRenderer.invoke("catalog:preflight-selected", selectedIds),
  importSelected: (selectedIds) =>
    ipcRenderer.invoke("catalog:import-selected", selectedIds),
  preflightFullCatalog: () => ipcRenderer.invoke("catalog:preflight-all"),
  importFullCatalog: () => ipcRenderer.invoke("catalog:import-all"),
  syncManufacturers: () => ipcRenderer.invoke("catalog:sync-manufacturers"),
});
