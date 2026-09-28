const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke("app:ping"),
  checkEnvironment: () => ipcRenderer.invoke("environment:check"),
});