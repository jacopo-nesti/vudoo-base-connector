import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, "../.env"));

const { runEnvironmentCheck } = await import("../src/checker.js");
const { fetchParsedVudooCatalog } = await import("../src/vudooImport.js");
const { dryRun } = await import("../src/config.js");
const { redactToken } = await import("../src/logger.js");
const { preflightSelectedCatalog } = await import("./selectedPreflight.js");
const { importSelectedCatalog } = await import("./selectedImport.js");

let activeCatalog = null;
let importInProgress = false;

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
  ipcMain.handle("app:runtime-mode", () => ({
    dryRun: dryRun === "true" ? true : dryRun === "false" ? false : null,
  }));
  ipcMain.handle("app:ping", () => {
    return "pong";
  });
  ipcMain.handle("catalog:fetch", async (_event, companyCode) => {
    if (typeof companyCode !== "string" || !companyCode.trim()) {
      throw new Error("Codice azienda non valido");
    }

    const normalizedCompanyCode = companyCode.trim();
    activeCatalog = null;
    activeCatalog = await fetchParsedVudooCatalog(normalizedCompanyCode);

    const productsForRenderer = activeCatalog.products.map((product) => ({
      id: product.id,
      sku: product.sku,
      title: product.title,
      brand: product.brand,
      price: product.price,
      category: product.product_type,
      mpn: product.mpn,
    }));

    return {
      channelTitle: activeCatalog.channelTitle,
      totalProducts: activeCatalog.products.length,
      products: productsForRenderer,
    };
  });

  ipcMain.handle("catalog:preflight-selected", async (_event, selectedIds) => {
    try {
      return { ok: true, result: await preflightSelectedCatalog(activeCatalog, selectedIds) };
    } catch (error) {
      return { ok: false, error: redactToken(error?.message ?? error) };
    }
  });

  ipcMain.handle("catalog:import-selected", async (_event, selectedIds) => {
    if (importInProgress) {
      return { ok: false, error: "Un’importazione è già in corso." };
    }
    importInProgress = true;
    try {
      return { ok: true, result: await importSelectedCatalog(activeCatalog, selectedIds) };
    } catch (error) {
      return { ok: false, error: redactToken(error?.message ?? error) };
    } finally {
      importInProgress = false;
    }
  });

  createWindow();
});
