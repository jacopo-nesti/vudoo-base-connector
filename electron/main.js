import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import {
  SETTINGS_FILE_NAME, applySettingsToEnvironment, getEffectiveSettings,
  loadSettings, readEnvironmentSettings, resetSettings, saveSettings,
} from "./settingsManager.js";
import { createWriteGuard } from "./writeGuard.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadEnvFile(path.join(__dirname, "../.env"));

async function bootstrap() {
  await app.whenReady();

  const settingsPath = path.join(
    app.getPath("userData"),
    SETTINGS_FILE_NAME
  );

  const {
    settings: baseSettings,
    warnings: environmentWarnings
  } = readEnvironmentSettings();

  const loadedSettings = await loadSettings(settingsPath);

  let savedSettings = loadedSettings.settings;
  const startupSavedSettings = { ...savedSettings };
  let settingsWarning = loadedSettings.warning;

  const activeSettings = getEffectiveSettings(
    baseSettings,
    savedSettings
  );

  applySettingsToEnvironment(savedSettings);

  const { runEnvironmentCheck } =
    await import("../src/checker.js");

  const { fetchParsedVudooCatalog } =
    await import("../src/vudooImport.js");

  const { BULK_LOOKUP_THRESHOLD } = await import("../src/importer.js");
  const { BASE_PRODUCT_DETAILS_CHUNK_SIZE } = await import("../src/baseApi.js");

  const { dryRun, testMode, getBaseApiRequestsPerMinute } =
    await import("../src/config.js");

  const { redactToken } =
    await import("../src/logger.js");

  const { preflightSelectedCatalog } =
    await import("./selectedPreflight.js");

  const { importSelectedCatalog } =
    await import("./selectedImport.js");

  const { preflightFullCatalog, importFullCatalog, syncFullCatalogManufacturers } =
    await import("./fullCatalog.js");

  let activeCatalog = null;
  const writeGuard = createWriteGuard();

  async function runWriteOperation(operation) {
    try {
      return { ok: true, result: await writeGuard.run(operation) };
    } catch (error) {
      return { ok: false, error: redactToken(error?.message ?? error) };
    }
  }

  function settingsResponse() {
    const settings = getEffectiveSettings(baseSettings, savedSettings);
    const displayedActiveSettings = { ...activeSettings };
    if (environmentWarnings.includes('DRY_RUN') && !Object.hasOwn(startupSavedSettings, 'dryRun')) {
      displayedActiveSettings.dryRun = null;
    }
    return {
      ok: true,
      settings,
      activeSettings: displayedActiveSettings,
      hasOverrides: Object.keys(savedSettings).length > 0,
      restartRequired: Object.keys(settings).some(key => settings[key] !== activeSettings[key]) ||
        (environmentWarnings.length > 0 && JSON.stringify(savedSettings) !== JSON.stringify(startupSavedSettings)),
      warning: settingsWarning,
      environmentWarnings,
    };
  }

  function settingsFailure(error) {
    return {
      ok: false,
      code: error?.code === 'invalidValue' || error?.code === 'invalidSettings' ||
        error?.code === 'unsupportedSetting' ? error.code : 'storageError',
      field: error?.field ?? null,
    };
  }

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

  function startDesktopApp() {
    ipcMain.handle("settings:get", () => settingsResponse());
    ipcMain.handle("settings:save", async (_event, input) => {
      try {
        savedSettings = await saveSettings(settingsPath, input);
        settingsWarning = null;
        return settingsResponse();
      } catch (error) {
        return settingsFailure(error);
      }
    });
    ipcMain.handle("settings:reset", async () => {
      try {
        await resetSettings(settingsPath);
        savedSettings = {};
        settingsWarning = null;
        return settingsResponse();
      } catch (error) {
        return settingsFailure(error);
      }
    });
    ipcMain.handle("app:restart", () => {
      if (writeGuard.isBusy()) return { ok: false, code: 'importInProgress' };
      if (!settingsResponse().restartRequired) return { ok: false, code: 'restartNotRequired' };
      setImmediate(() => {
        app.relaunch();
        app.quit();
      });
      return { ok: true };
    });

    ipcMain.handle("environment:check", async () => {
      return await runEnvironmentCheck();
    });
    ipcMain.handle("app:runtime-mode", () => ({
      dryRun: dryRun === "true" ? true : dryRun === "false" ? false : null,
      testMode: testMode === "true" ? true : testMode === "false" ? false : null,
      baseApiRequestsPerMinute: getBaseApiRequestsPerMinute(),
      importReadStrategy: {
        bulkLookupThreshold: BULK_LOOKUP_THRESHOLD,
        detailsChunkSize: BASE_PRODUCT_DETAILS_CHUNK_SIZE,
      },
    }));
    ipcMain.handle("app:ping", () => {
      return "pong";
    });
    ipcMain.handle("catalog:fetch", async (_event, companyCode) => {
      if (writeGuard.isBusy()) throw new Error("Attendi la fine dell’importazione o sincronizzazione.");
      if (typeof companyCode !== "string" || !companyCode.trim()) {
        throw new Error("Codice azienda non valido");
      }

      const normalizedCompanyCode = companyCode.trim();
      activeCatalog = null;
      const startedAt = Date.now();
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
        durationMs: Math.max(0, Date.now() - startedAt),
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
      return runWriteOperation(() => importSelectedCatalog(activeCatalog, selectedIds));
    });

    ipcMain.handle("catalog:preflight-all", async () => {
      try {
        return { ok: true, result: await preflightFullCatalog(activeCatalog) };
      } catch (error) {
        return { ok: false, error: redactToken(error?.message ?? error) };
      }
    });

    ipcMain.handle("catalog:import-all", async () =>
      runWriteOperation(() => importFullCatalog(activeCatalog)));

    ipcMain.handle("catalog:sync-manufacturers", async () =>
      runWriteOperation(() => syncFullCatalogManufacturers(activeCatalog)));

    createWindow();
  }

  startDesktopApp();
}

void bootstrap().catch((error) => {
  console.error("Electron startup failed:", error);
  app.quit();
});
