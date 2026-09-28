const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("app:ping"),
  checkEnvironment: () => ipcRenderer.invoke("environment:check"),
  getRuntimeMode: () => ipcRenderer.invoke("app:runtime-mode"),
  fetchCatalog: (companyCode) =>
    ipcRenderer.invoke("catalog:fetch", companyCode),
  preflightSelected: (selectedIds) =>
    ipcRenderer.invoke("catalog:preflight-selected", selectedIds),
  importSelected: (selectedIds) =>
    ipcRenderer.invoke("catalog:import-selected", selectedIds),
});
