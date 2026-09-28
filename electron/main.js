import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, "../.env"));

const { runEnvironmentCheck } = await import("../src/checker.js");

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,

    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.loadURL("http://localhost:5173");
}

app.whenReady().then(() => {
  ipcMain.handle("environment:check", async () => {
  return await runEnvironmentCheck();
});
  ipcMain.handle("app:ping", () => {
    return "pong";
  });

  createWindow();
});