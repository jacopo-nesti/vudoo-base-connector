import { app, BrowserWindow, ipcMain, Menu, nativeImage } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLocalEnvironment, resolveEnvironmentFile } from './localEnv.js';
import { preparePackagedConfiguration } from './packagedConfiguration.js';
import {
  SETTINGS_FILE_NAME, applySettingsToEnvironment, getEffectiveSettings,
  loadSettings, readEnvironmentSettings, resetSettings, saveSettings,
} from "./settingsManager.js";
import { createWriteGuard } from "./writeGuard.js";
import { attachWindowChrome, registerWindowIpc } from './windowChrome.js';
import {
  PRODUCT_OVERRIDES_FILE_NAME, loadProductOverrides, writeProductOverrides,
  saveProductOverride, saveProductFieldPatch, saveBulkProductField, saveBulkProductTags,
  saveProductCategoryOverrides,
} from './productOverrides.js';
import { CATEGORY_MAPPINGS_FILE_NAME, categoryMappingKey, loadRuntimeCategoryMappings,
  saveRuntimeCategoryMapping, removeRuntimeCategoryMapping } from './categoryMappingStore.js';
import { createBaseCategoryService } from './baseCategoryService.js';
import { createBaseCategoryCache } from './baseCategoryCache.js';
import { getProductOverride } from './effectiveProduct.js';
import { basePayloadPreview, assertBaseLocalSendable } from '../src/marketplaces/base/localPreview.js';
import { validateBulkBaseInput } from '../src/productSchema.js';
import { MANUFACTURERS_DB_FILE_NAME, openManufacturerDirectory, registerLoadedCatalog } from './manufacturerDirectory.js';
import { ORDERS_DB_FILE_NAME, openOrderStore } from './orderStore.js';
import { createManufacturerInventoryService } from './manufacturerInventory.js';
import { saveLocalProductImage, removeLocalProductImage, readLocalImage, imageForBase,
  optimizeWithNativeImage, markLocalImagesUploaded, pendingLocalImages } from './manualProductImages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  await app.whenReady();
  const userDataPath = app.getPath('userData');
  const environmentFile = resolveEnvironmentFile({
    packaged: app.isPackaged,
    projectRoot: path.join(__dirname, '..'),
    executableDir: process.env.PORTABLE_EXECUTABLE_DIR,
    executablePath: process.execPath,
  });
  loadLocalEnvironment(environmentFile, { optional: app.isPackaged });
  if (app.isPackaged) {
    const localPaths = await preparePackagedConfiguration(process.resourcesPath, userDataPath);
    process.env.VUDOO_CONFIG_ROOT = localPaths.configRoot;
    process.env.VUDOO_REPORT_ROOT = localPaths.reportRoot;
  }

  const settingsPath = path.join(
    userDataPath,
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

  applySettingsToEnvironment(activeSettings);

  // Static Electron imports may have loaded src/config before the external .env.
  // Initialize its live bindings once, independently of the Diagnostics page.
  const baseConfig = await import('../src/config.js');
  baseConfig.refreshBaseToken();
  baseConfig.setDryRunMode(activeSettings.dryRun);
  baseConfig.setTestMode(activeSettings.testMode);

  // This module imports core config transitively; wait for saved settings.
  const { projectCatalogForOperator } = await import('./catalogProjection.js');

  const { runEnvironmentCheck } =
    await import("../src/checker.js");

  const { fetchParsedVudooCatalog } =
    await import("../src/vudooImport.js");
  const { loadCategoryMappings } = await import('../src/categoryNormalizer.js');
  const { buildGlobalCategoryIndex, resolveGlobalCategoryId } = await import('../src/categories.js');

  const { BULK_LOOKUP_THRESHOLD } = await import("../src/importer.js");
  const { BASE_PRODUCT_DETAILS_CHUNK_SIZE } = await import("../src/baseApi.js");
  const { callBase, findProductInBase, getBaseProductDetails, getBaseConnectionState } = await import('../src/baseApi.js');
  const { readBaseOrder, classifyOrderError } = await import('../src/orders/baseOrderReader.js');
  const { syncOrders } = await import('../src/orders/orderSync.js');
  const { createInventoryTagService } = await import('../src/inventoryTags.js');
  const { setDryRunMode, setTestMode, testMode, token, getBaseApiRequestsPerMinute } =
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
  let activeCompanyCode = null;
  let activeCatalogLoadedAt = null;
  let activeOverrides = {};
  let activeMappings = null;
  let activeInventoryStatus = null;
  const productOverridesPath = path.join(app.getPath('userData'), PRODUCT_OVERRIDES_FILE_NAME);
  const categoryMappingsPath = path.join(app.getPath('userData'), CATEGORY_MAPPINGS_FILE_NAME);
  let activeRuntimeMappings = {};
  let activeCategoryIndex = null;
  let activeMappingError = null;
  let runtimeMappingsError = null;
  try { activeRuntimeMappings = await loadRuntimeCategoryMappings(categoryMappingsPath); }
  catch (error) { runtimeMappingsError = redactToken(error?.message ?? error); }
  const manualImagesRoot = path.join(app.getPath('userData'), 'manual-product-images');
  const manufacturersPath = path.join(app.getPath('userData'), MANUFACTURERS_DB_FILE_NAME);
  const ordersPath = path.join(app.getPath('userData'), ORDERS_DB_FILE_NAME);
  let orderStore = null;
  let ordersSyncing = false;
  function getOrderStore() {
    orderStore ??= openOrderStore(ordersPath);
    return orderStore;
  }
  let manufacturerDirectory = null;
  function getManufacturerDirectory() {
    manufacturerDirectory ??= openManufacturerDirectory(manufacturersPath);
    return manufacturerDirectory;
  }
  app.on('before-quit', () => { manufacturerDirectory?.close(); orderStore?.close(); });
  const writeGuard = createWriteGuard();
  const categoryService = createBaseCategoryService({ request: callBase,
    isSimulation: () => baseConfig.dryRun === 'true' });
  const categoryCache = createBaseCategoryCache({ read: () => categoryService.read(),
    buildIndex: buildGlobalCategoryIndex });
  function rememberCategories(rows) {
    const state = categoryCache.replace(rows);
    activeCategoryIndex = state.index;
    const projection = activeCatalog ? projectCatalogForOperator(activeCatalog, activeMappings,
      activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex) : null;
    return { categories: state.categories, categoriesLoaded: state.categoriesLoaded,
      categoriesVerified: state.categoriesVerified, lastCategoriesRefresh: state.lastCategoriesRefresh,
      products: projection?.rows ?? null, quality: projection?.quality ?? null,
      mappingError: [activeMappingError, runtimeMappingsError].filter(Boolean).join(' ') || null,
      baseConnection: getBaseConnectionState() };
  }
  async function ensureCategories(force = false) {
    const state = await categoryCache.ensure({ force });
    activeCategoryIndex = state.index;
    const projection = activeCatalog ? projectCatalogForOperator(activeCatalog, activeMappings,
      activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex) : null;
    return { categories: state.categories, categoriesLoaded: true, categoriesVerified: true,
      lastCategoriesRefresh: state.lastCategoriesRefresh, products: projection?.rows ?? null,
      quality: projection?.quality ?? null,
      mappingError: [activeMappingError, runtimeMappingsError].filter(Boolean).join(' ') || null,
      baseConnection: getBaseConnectionState() };
  }
  let inventoryService = null;
  function getInventoryService() {
    inventoryService ??= createManufacturerInventoryService({
      directory: getManufacturerDirectory(),
      getInventories: () => callBase('getInventories'),
      addInventory: parameters => writeGuard.run(() => callBase('addInventory', parameters)),
      configuredInventoryId: baseConfig.inventoryId,
      isSimulation: () => baseConfig.dryRun === 'true',
    });
    return inventoryService;
  }
  async function ensureActiveInventory(manufacturer, selectedInventoryId = null) {
    if (!manufacturer) {
      activeInventoryStatus = { status: 'MISSING', inventoryId: null, inventory: null,
        message: 'Salva il produttore locale per associare un Inventory Base.com.' };
    } else if (!baseConfig.token) {
      activeInventoryStatus = { status: 'ERROR', inventoryId: null, inventory: null,
        code: 'BASE_NOT_CONFIGURED', message: 'Credenziali Base.com non configurate.' };
    } else {
      try {
        activeInventoryStatus = await getInventoryService().ensureInventoryForManufacturer(manufacturer,
          { selectedInventoryId });
      } catch (error) {
        activeInventoryStatus = { status: 'ERROR', inventoryId: null, inventory: null,
          code: error?.code ?? 'INVENTORY_CHECK_FAILED', message: redactToken(error?.message ?? error) };
      }
    }
    if (activeCatalog) activeCatalog.baseInventoryId = activeInventoryStatus.inventoryId;
    return activeInventoryStatus;
  }
  async function refreshActiveInventory() {
    if (!activeCatalog || !activeCompanyCode) return;
    let manufacturer = null;
    try { manufacturer = getManufacturerDirectory().getByCode(activeCompanyCode); }
    catch { /* Catalog remains usable with the configured Inventory fallback. */ }
    await ensureActiveInventory(manufacturer);
  }

  async function runWriteOperation(operation) {
    try {
      return { ok: true, result: await writeGuard.run(operation) };
    } catch (error) {
      return { ok: false, error: redactToken(error?.message ?? error) };
    }
  }

  function settingsResponse() {
    const settings = getEffectiveSettings(baseSettings, savedSettings);
    return {
      ok: true,
      settings,
      activeSettings: { ...activeSettings },
      hasOverrides: Object.keys(savedSettings).length > 0,
      restartRequired: Object.keys(settings).some(key => !['dryRun', 'testMode'].includes(key) && settings[key] !== activeSettings[key]) ||
        (environmentWarnings.some(key => !['DRY_RUN', 'TEST_MODE'].includes(key)) &&
          JSON.stringify(savedSettings) !== JSON.stringify(startupSavedSettings)),
      warning: settingsWarning,
      environmentWarnings,
    };
  }

  function settingsFailure(error) {
    return {
      ok: false,
      code: error?.code === 'invalidValue' || error?.code === 'invalidSettings' ||
        error?.code === 'unsupportedSetting' || error?.code === 'importInProgress' ? error.code : 'storageError',
      field: error?.field ?? null,
    };
  }

  function createWindow() {
    const window = new BrowserWindow({
      width: 1200,
      height: 800,
      frame: false,

      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    attachWindowChrome(window, app);

    if (app.isPackaged) {
      window.loadFile(path.join(__dirname, "../renderer/dist/index.html"));
    } else {
      window.loadURL("http://localhost:5173");
    }
  }

  async function startDesktopApp() {
    Menu.setApplicationMenu(null);
    registerWindowIpc(ipcMain, BrowserWindow);
    ipcMain.handle('orders:get', async (_event, orderId) => {
      try {
        const order = await readBaseOrder(orderId);
        getOrderStore().upsertOrders([order]);
        return { ok: true, order: getOrderStore().get(order.identity.order_id) };
      } catch (error) { return { ok: false, code: classifyOrderError(error) }; }
    });
    ipcMain.handle('orders:list', (_event, filters) => {
      try { return { ok: true, ...getOrderStore().list(filters),
        facets: getOrderStore().facets(), syncState: getOrderStore().syncState() }; }
      catch { return { ok: false, code: 'storageError' }; }
    });
    ipcMain.handle('orders:detail', (_event, orderId) => {
      try { return { ok: true, order: getOrderStore().get(orderId) }; }
      catch { return { ok: false, code: 'storageError' }; }
    });
    ipcMain.handle('orders:sync', async () => {
      if (ordersSyncing) return { ok: false, code: 'alreadySyncing' };
      ordersSyncing = true;
      try { return { ok: true, result: await syncOrders(getOrderStore()) }; }
      catch (error) { return { ok: false, code: classifyOrderError(error) }; }
      finally { ordersSyncing = false; }
    });
    ipcMain.handle('manufacturers:list', () => {
      try { return { ok: true, manufacturers: getManufacturerDirectory().list() }; }
      catch { return { ok: false, code: 'databaseUnavailable', manufacturers: [] }; }
    });
    ipcMain.handle('manufacturers:search', (_event, query) => {
      try { return { ok: true, results: getManufacturerDirectory().search(query) }; }
      catch { return { ok: false, code: 'databaseUnavailable', results: [] }; }
    });
    ipcMain.handle('manufacturers:save', async (_event, input) => {
      if (!activeCatalog || input?.catalogCode !== activeCompanyCode) {
        return { ok: false, code: 'catalogNotLoaded' };
      }
      try {
        const directory = getManufacturerDirectory();
        const saved = directory.save(input.catalogCode, input.name);
        saved.manufacturer = directory.recordLoadedCatalog(input.catalogCode, activeCatalog.products.length,
          activeCatalogLoadedAt ?? new Date().toISOString());
        return { ok: true, ...saved, inventoryStatus: await ensureActiveInventory(saved.manufacturer) };
      }
      catch (error) { return { ok: false, code: error?.code === 'invalidValue' ? error.code : 'databaseUnavailable', field: error?.field ?? null }; }
    });
    ipcMain.handle('catalog:inventory-select', async (_event, inventoryId) => {
      if (!activeCatalog || !activeCompanyCode || !Number.isSafeInteger(inventoryId) || inventoryId <= 0) {
        return { ok: false, code: 'invalidValue' };
      }
      const manufacturer = getManufacturerDirectory().getByCode(activeCompanyCode);
      if (!manufacturer || activeInventoryStatus?.status !== 'AMBIGUOUS') return { ok: false, code: 'selectionUnavailable' };
      const result = await ensureActiveInventory(manufacturer, inventoryId);
      return result.status === 'ERROR' ? { ok: false, code: result.code, inventoryStatus: result }
        : { ok: true, inventoryStatus: result };
    });
    ipcMain.handle('catalog:inventory-retry', async () => {
      if (!activeCatalog || !activeCompanyCode) return { ok: false, code: 'catalogNotLoaded' };
      const manufacturer = getManufacturerDirectory().getByCode(activeCompanyCode);
      return { ok: true, inventoryStatus: await ensureActiveInventory(manufacturer) };
    });
    ipcMain.handle("settings:get", () => settingsResponse());
    ipcMain.handle("settings:save", async (_event, input) => {
      if (writeGuard.isBusy()) return { ok: false, code: 'importInProgress' };
      try {
        return await writeGuard.run(async () => {
          savedSettings = await saveSettings(settingsPath, input);
          const effective = getEffectiveSettings(baseSettings, savedSettings);
          setDryRunMode(effective.dryRun);
          setTestMode(effective.testMode);
          activeSettings.dryRun = effective.dryRun;
          activeSettings.testMode = effective.testMode;
          settingsWarning = null;
          return settingsResponse();
        });
      } catch (error) {
        return settingsFailure(error);
      }
    });
    ipcMain.handle("settings:reset", async () => {
      if (writeGuard.isBusy()) return { ok: false, code: 'importInProgress' };
      try {
        return await writeGuard.run(async () => {
          await resetSettings(settingsPath);
          savedSettings = {};
          setDryRunMode(baseSettings.dryRun);
          setTestMode(baseSettings.testMode);
          activeSettings.dryRun = baseSettings.dryRun;
          activeSettings.testMode = baseSettings.testMode;
          settingsWarning = null;
          return settingsResponse();
        });
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
      const result = await runEnvironmentCheck();
      return { ...result, baseConnection: getBaseConnectionState() };
    });
    ipcMain.handle("app:runtime-mode", () => ({
      baseConfigured: getBaseConnectionState().configured,
      baseConnection: getBaseConnectionState(),
      dryRun: activeSettings.dryRun,
      testMode: testMode === "true" ? true : testMode === "false" ? false : null,
      baseApiRequestsPerMinute: getBaseApiRequestsPerMinute(),
      importReadStrategy: {
        bulkLookupThreshold: BULK_LOOKUP_THRESHOLD,
        detailsChunkSize: BASE_PRODUCT_DETAILS_CHUNK_SIZE,
      },
    }));
    ipcMain.handle("app:set-operating-mode", async (_event, mode) => {
      if (mode !== 'real' && mode !== 'simulation') return { ok: false, code: 'invalidValue' };
      if (writeGuard.isBusy()) return { ok: false, code: 'importInProgress' };
      try {
        return await writeGuard.run(async () => {
          const nextDryRun = mode === 'simulation';
          savedSettings = await saveSettings(settingsPath, { ...savedSettings, dryRun: nextDryRun });
          setDryRunMode(nextDryRun);
          activeSettings.dryRun = nextDryRun;
          settingsWarning = null;
          return { ok: true, mode, dryRun: nextDryRun };
        });
      } catch (error) {
        return settingsFailure(error);
      }
    });
    ipcMain.handle("app:ping", () => {
      return "pong";
    });
    ipcMain.handle("catalog:fetch", async (_event, companyCode) => {
      if (writeGuard.isBusy()) throw new Error("Attendi la fine dell’importazione o sincronizzazione.");
      if (typeof companyCode !== "string" || !companyCode.trim()) {
        throw new Error("Codice azienda non valido");
      }

      const normalizedCompanyCode = companyCode.trim();
      const storedOverrides = await loadProductOverrides(productOverridesPath);
      const storedRuntimeMappings = runtimeMappingsError ? null : await loadRuntimeCategoryMappings(categoryMappingsPath);
      activeCatalog = null;
      activeCompanyCode = null;
      activeCatalogLoadedAt = null;
      activeInventoryStatus = null;
      const startedAt = Date.now();
      activeCatalog = await fetchParsedVudooCatalog(normalizedCompanyCode);
      activeCatalog.catalogCode = normalizedCompanyCode;
      activeCompanyCode = normalizedCompanyCode;
      activeOverrides = storedOverrides;
      if (storedRuntimeMappings) activeRuntimeMappings = storedRuntimeMappings;
      let categorySyncWarning = null;
      try { activeCategoryIndex = (await categoryCache.ensure()).index; }
      catch { activeCategoryIndex = null;
        categorySyncWarning = 'Categorie Base.com non disponibili. Riprova dalla pagina Prodotti o Categorie.'; }
      let mappingError = null;
      try { activeMappings = await loadCategoryMappings(undefined, { channelTitle: activeCatalog.channelTitle }); }
      catch (error) {
        activeMappings = { canonical: new Map(), suppliers: new Map(), supplierByTitle: new Map() };
        mappingError = redactToken(error.message);
      }
      activeMappingError = mappingError;
      const projection = projectCatalogForOperator(activeCatalog, activeMappings, activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex);

      let directoryResult;
      activeCatalogLoadedAt = new Date().toISOString();
      try { directoryResult = registerLoadedCatalog(getManufacturerDirectory(), normalizedCompanyCode,
        activeCatalog.channelTitle, activeCatalog.products.length, activeCatalogLoadedAt); }
      catch { directoryResult = { status: 'unavailable', manufacturer: null }; }
      const inventoryStatus = directoryResult.status === 'unavailable'
        ? { status: 'ERROR', inventoryId: null, code: 'DATABASE_UNAVAILABLE', message: 'Anagrafica locale non disponibile.' }
        : await ensureActiveInventory(directoryResult.manufacturer);

      return {
        channelTitle: activeCatalog.channelTitle,
        manufacturerName: directoryResult.manufacturer?.name ?? null,
        manufacturerDirectoryStatus: directoryResult.status,
        inventoryStatus,
        totalProducts: activeCatalog.products.length,
        durationMs: Math.max(0, Date.now() - startedAt),
        products: projection.rows,
        quality: projection.quality,
        mappingError: [mappingError, runtimeMappingsError].filter(Boolean).join(' ') || null,
        categoryError: categorySyncWarning,
        baseConnection: getBaseConnectionState(),
        canonicalOptions: [...activeMappings.canonical.keys()].sort(),
      };
    });

    function oneProductResponse(id) {
      const matches = activeCatalog.products.filter(product => product.id === id);
      if (!matches.length) throw new Error('Prodotto non presente nel catalogo attivo.');
      const source = matches[0];
      if (matches.some(product => JSON.stringify(product) !== JSON.stringify(source))) {
        throw new Error('ID duplicato con dati supplier discordanti: correggere il feed prima di modificare.');
      }
      return { source, product: projectCatalogForOperator({ channelTitle: activeCatalog.channelTitle,
        catalogCode: activeCompanyCode, products: [source] },
        activeMappings, activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex).rows[0] };
    }

    async function verifiedGlobalCategory(categoryId) {
      const state = await categoryCache.ensure({ force: true });
      activeCategoryIndex = state.index;
      const category = resolveGlobalCategoryId(categoryId, state.index);
      if (!category) throw new Error('Categoria Base.com non trovata. Aggiorna le categorie.');
      return category;
    }

    ipcMain.handle('categories:list', async () => {
      try {
        return { ok: true, ...await ensureCategories(true) };
      } catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });
    ipcMain.handle('categories:ensure', async () => {
      try { return { ok: true, ...await ensureCategories() }; }
      catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });
    ipcMain.handle('categories:mutate', async (_event, operation, input) => {
      try {
        return await writeGuard.run(async () => {
          const result = await categoryService.mutate(operation, input);
          return { ok: true, simulated: result.simulated, categoryId: result.categoryId ?? null,
            ...rememberCategories(result.categories) };
        });
      } catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });
    ipcMain.handle('categories:delete-impact', async (_event, categoryId) => {
      try { return { ok: true, impact: await categoryService.deleteImpact(categoryId) }; }
      catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });
    function mappingRows() {
      return Object.values(activeRuntimeMappings).map(mapping => {
        const entry = activeCategoryIndex?.byId.get(mapping.categoryId);
        return { ...mapping, path: entry?.path ?? mapping.path,
          valid: activeCategoryIndex ? Boolean(entry) : null };
      });
    }
    ipcMain.handle('categories:mappings-list', async () => {
      if (runtimeMappingsError) return { ok: false, error: runtimeMappingsError };
      try {
        const state = await ensureCategories();
        return { ok: true, ...state, mappings: mappingRows() };
      }
      catch (error) {
        activeCategoryIndex = null;
        return { ok: true, mappings: mappingRows(),
          categoryError: redactToken(error?.message ?? error) };
      }
    });
    ipcMain.handle('categories:mapping-save', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (!input || typeof input.sourceTitle !== 'string' || typeof input.sourceCategory !== 'string')
            throw new Error('Categoria sorgente non valida.');
          if (runtimeMappingsError) throw new Error(runtimeMappingsError);
          if (!activeRuntimeMappings[categoryMappingKey(input.sourceTitle, input.sourceCategory)])
            throw new Error('Mapping locale non trovato. Aggiorna l’elenco.');
          const category = await verifiedGlobalCategory(input.categoryId);
          activeRuntimeMappings = await saveRuntimeCategoryMapping(categoryMappingsPath,
            activeRuntimeMappings, input.sourceTitle, input.sourceCategory, category);
          const projection = activeCatalog ? projectCatalogForOperator(activeCatalog, activeMappings,
            activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex) : null;
          return { ok: true, mappings: mappingRows(),
            products: projection?.rows ?? null, quality: projection?.quality ?? null };
        });
      } catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });
    ipcMain.handle('categories:mapping-remove', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (runtimeMappingsError) throw new Error(runtimeMappingsError);
          if (!activeRuntimeMappings[categoryMappingKey(input?.sourceTitle ?? '', input?.sourceCategory ?? '')])
            throw new Error('Mapping locale non trovato. Aggiorna l’elenco.');
          activeRuntimeMappings = await removeRuntimeCategoryMapping(categoryMappingsPath,
            activeRuntimeMappings, input?.sourceTitle, input?.sourceCategory);
          const projection = activeCatalog ? projectCatalogForOperator(activeCatalog, activeMappings,
            activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex) : null;
          return { ok: true, mappings: mappingRows(),
            products: projection?.rows ?? null, quality: projection?.quality ?? null };
        });
      } catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });
    ipcMain.handle('catalog:category-save', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (!activeCatalog || !activeCompanyCode || !Array.isArray(input?.ids) ||
              !input.ids.length || input.ids.length > 5000 || new Set(input.ids).size !== input.ids.length)
            throw new Error('Selezione prodotti non valida.');
          if (input.saveAsMapping && runtimeMappingsError) throw new Error(runtimeMappingsError);
          if (input.saveAsMapping && input.ids.length !== 1) throw new Error('Il mapping si salva da un solo prodotto.');
          const sources = input.ids.map(id => oneProductResponse(id).source);
          const category = input.categoryId == null ? null : await verifiedGlobalCategory(input.categoryId);
          if (input.saveAsMapping && (!category || !sources[0].product_type?.trim()))
            throw new Error('Categoria Vudoo sorgente necessaria per il mapping.');
          activeOverrides = await saveProductCategoryOverrides(productOverridesPath, activeOverrides,
            activeCompanyCode, sources, { category, expectedRevisions: input.expectedRevisions });
          let mappingWarning = null;
          if (input.saveAsMapping) {
            try { activeRuntimeMappings = await saveRuntimeCategoryMapping(categoryMappingsPath,
              activeRuntimeMappings, activeCompanyCode, sources[0].product_type, category); }
            catch { mappingWarning = 'Override salvato; mapping riutilizzabile non salvato. Riprova da Impostazioni.'; }
          }
          const projection = projectCatalogForOperator(activeCatalog, activeMappings,
            activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex);
          return { ok: true, warning: mappingWarning, products: projection.rows, quality: projection.quality };
        });
      } catch (error) { return { ok: false, error: redactToken(error?.message ?? error) }; }
    });

    function manualImageError(error) {
      const safeCodes = new Set(['INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'IMAGE_LIMIT', 'IMAGE_NOT_FOUND']);
      return { ok: false, error: safeCodes.has(error?.code) ? error.message
        : 'Impossibile salvare l’immagine locale. Verifica lo spazio disponibile e riprova.' };
    }

    ipcMain.handle('catalog:manual-image-add', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (!input || typeof input.id !== 'string') throw new Error('Prodotto non valido.');
          oneProductResponse(input.id);
          activeOverrides = await saveLocalProductImage({ root: manualImagesRoot,
            filePath: productOverridesPath, overrides: activeOverrides, companyCode: activeCompanyCode,
            productId: input.id, file: input.file, writeOverrides: writeProductOverrides });
          return { ok: true, product: oneProductResponse(input.id).product };
        });
      } catch (error) { return manualImageError(error); }
    });

    ipcMain.handle('catalog:manual-image-remove', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (!input || typeof input.id !== 'string') throw new Error('Prodotto non valido.');
          oneProductResponse(input.id);
          activeOverrides = await removeLocalProductImage({ root: manualImagesRoot,
            filePath: productOverridesPath, overrides: activeOverrides, companyCode: activeCompanyCode,
            productId: input.id, imageId: input.imageId, writeOverrides: writeProductOverrides });
          return { ok: true, product: oneProductResponse(input.id).product };
        });
      } catch (error) { return manualImageError(error); }
    });

    ipcMain.handle('catalog:manual-image-thumbnail', async (_event, input) => {
      try {
        if (!input || typeof input.id !== 'string') throw new Error('Prodotto non valido.');
        const { product } = oneProductResponse(input.id);
        const metadata = product.manualImages.find(image => image.id === input.imageId);
        if (!metadata) throw new Error('Immagine non associata al prodotto.');
        const bytes = await readLocalImage(manualImagesRoot, metadata);
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new Error('Immagine non leggibile.');
        return { ok: true, preview: image.resize({ width: 160 }).toDataURL() };
      } catch { return { ok: false, error: 'Anteprima locale non disponibile.' }; }
    });

    ipcMain.handle('catalog:base-image-status', async (_event, id) => {
      try {
        const { product } = oneProductResponse(id);
        if (!activeInventoryStatus?.inventoryId) return { ok: true, available: false, images: [] };
        const match = await findProductInBase(product.sku, activeInventoryStatus.inventoryId);
        if (!match) return { ok: true, available: false, images: [] };
        const details = await getBaseProductDetails(activeInventoryStatus.inventoryId, match.product_id);
        if (details.sku !== product.sku) throw new Error('SKU Base diverso.');
        const images = Object.entries(details.images ?? {}).filter(([position, url]) =>
          /^([1-9]|1[0-6])$/.test(position) && typeof url === 'string' && url)
          .map(([position, url]) => ({ position: Number(position), url }));
        return { ok: true, available: true, images };
      } catch { return { ok: false, error: 'Immagini Base.com non disponibili. La modifica locale resta possibile.' }; }
    });

    function importMediaHooks() {
      return {
        resolveManualImages: async (product, existing, baseProductId) => {
          const pending = pendingLocalImages(product.manual_images, existing, baseProductId);
          return Promise.all(pending.map(async image => ({ id: image.id,
            data: await imageForBase(manualImagesRoot, image,
              (bytes, mimeType) => optimizeWithNativeImage(nativeImage, bytes, mimeType)) })));
        },
        onManualImagesUploaded: async (product, baseProductId, assignments) => {
          activeOverrides = await markLocalImagesUploaded({ filePath: productOverridesPath,
            overrides: activeOverrides, companyCode: activeCompanyCode, productId: product.id,
            baseProductId, assignments, writeOverrides: writeProductOverrides });
        },
      };
    }

    ipcMain.handle('catalog:save-fields', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (!activeCatalog || !activeCompanyCode || !input || typeof input.id !== 'string') throw new Error('Caricare prima un catalogo Vudoo.');
          const { source, product } = oneProductResponse(input.id);
          if (input.scope === 'manual' && Object.hasOwn(input.changes ?? {}, 'canonical_category')) {
            if (!activeMappings.canonical.has(input.changes.canonical_category) || !product.provenance.canonical_category.canonical) {
              throw new Error('Categoria canonica non disponibile: associare prima la categoria supplier in config/suppliers.');
            }
          }
          activeOverrides = await saveProductFieldPatch(productOverridesPath, activeOverrides,
            activeCompanyCode, source, input);
          return { ok: true, product: oneProductResponse(input.id).product };
        });
      } catch (error) { return { ok: false, error: redactToken(error.message) }; }
    });

    ipcMain.handle('catalog:bulk-edit', async (_event, input) => {
      try {
        return await writeGuard.run(async () => {
          if (!activeCatalog || !activeCompanyCode || !input || !Array.isArray(input.ids) || !input.ids.length ||
              input.ids.length > 5000 || new Set(input.ids).size !== input.ids.length) {
            throw new Error('Selezionare prodotti univoci nel catalogo attivo.');
          }
          if (input.scope !== 'base') throw new Error('La modifica massiva è disponibile solo per override Base.com.');
          const selected = input.ids.map(id => oneProductResponse(id));
          let changedCount = selected.length;
          if (input.field === 'tags') {
            const result = await saveBulkProductTags(productOverridesPath, activeOverrides, activeCompanyCode,
              selected.map(item => item.source), input);
            activeOverrides = result.overrides;
            changedCount = result.changedCount;
          } else {
            const value = validateBulkBaseInput(input.field, input.value);
            activeOverrides = await saveBulkProductField(productOverridesPath, activeOverrides, activeCompanyCode,
              selected.map(item => item.source), { ...input, value });
          }
          return { ok: true, changedCount, products: input.ids.map(id => oneProductResponse(id).product) };
        });
      } catch (error) { return { ok: false, error: redactToken(error.message) }; }
    });

    ipcMain.handle('catalog:base-preview', async (_event, id) => {
      try {
        if (!activeCatalog || typeof id !== 'string') throw new Error('Caricare un prodotto prima dell’anteprima Base.');
        const row = oneProductResponse(id).product;
        const source = activeCatalog.products.find(product => product.id === id);
        const { normalizeVudooProduct } = await import('../src/vudooXml.js');
        const { effectiveProduct } = await import('./effectiveProduct.js');
        const canonical = normalizeVudooProduct(source);
        const fields = getProductOverride(activeOverrides, activeCompanyCode, id);
        const effective = effectiveProduct(canonical, fields, 'base');
        let tagPlan = null;
        if (effective.tags != null) {
          try {
            tagPlan = await createInventoryTagService({ request: callBase,
              isSimulation: () => baseConfig.dryRun === 'true' }).ensureInventoryTags(effective.tags);
          } catch (error) { tagPlan = { error: redactToken(error.message) }; }
        }
        effective.category_id = row.baseCategory?.categoryId;
        effective.base_category_path = row.baseCategory?.path;
        return { ok: true, product: row, preview: basePayloadPreview(effective, { tagPlan }), preflight: row.basePreflight };
      } catch (error) { return { ok: false, error: redactToken(error.message) }; }
    });

    ipcMain.handle('catalog:save-product-override', async (_event, input) => {
      try {
        if (writeGuard.isBusy()) throw new Error('Attendi la fine dell’importazione o sincronizzazione.');
        if (!activeCatalog || !activeCompanyCode) throw new Error('Carica prima un catalogo Vudoo.');
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Object.keys(input).some(key => !['id', 'title', 'description'].includes(key)) ||
            typeof input.id !== 'string' || !input.id.trim()) {
          throw new Error('ID prodotto non valido.');
        }
        const matches = activeCatalog.products.filter(product => product.id === input.id);
        if (!matches.length) throw new Error('Prodotto non presente nel catalogo attivo.');
        const source = matches[0];
        if (matches.some(product => product.title !== source.title ||
            product.description !== source.description)) {
          throw new Error('Record con lo stesso ID hanno titoli o descrizioni discordanti.');
        }
        activeOverrides = await saveProductOverride(productOverridesPath, activeOverrides,
          activeCompanyCode, source, { title: input.title, description: input.description });
        return { ok: true, product: oneProductResponse(input.id).product };
      } catch (error) {
        return { ok: false, error: redactToken(error?.message ?? error) };
      }
    });

    ipcMain.handle("catalog:preflight-selected", async (_event, selectedIds) => {
      try {
        await refreshActiveInventory();
        let categoryState = null;
        const result = await preflightSelectedCatalog(activeCatalog, selectedIds,
          activeOverrides, activeCompanyCode, activeRuntimeMappings,
          index => { categoryState = rememberCategories(index.entries); });
        return { ok: true, result, categoryState, inventoryStatus: activeInventoryStatus };
      } catch (error) {
        return { ok: false, error: redactToken(error?.message ?? error) };
      }
    });

    ipcMain.handle("catalog:import-selected", async (_event, selectedIds) => {
      await refreshActiveInventory();
      const response = await runWriteOperation(() => {
        const projection = projectCatalogForOperator(activeCatalog, activeMappings, activeOverrides, activeCompanyCode, activeRuntimeMappings, activeCategoryIndex);
        assertBaseLocalSendable(projection.rows, selectedIds);
        return importSelectedCatalog(activeCatalog, selectedIds, activeOverrides, activeCompanyCode, importMediaHooks(), activeRuntimeMappings);
      });
      return { ...response, inventoryStatus: activeInventoryStatus };
    });

    ipcMain.handle("catalog:preflight-all", async () => {
      try {
        await refreshActiveInventory();
        let categoryState = null;
        const result = await preflightFullCatalog(activeCatalog,
          activeOverrides, activeCompanyCode, activeRuntimeMappings,
          index => { categoryState = rememberCategories(index.entries); });
        return { ok: true, result, categoryState, inventoryStatus: activeInventoryStatus };
      } catch (error) {
        return { ok: false, error: redactToken(error?.message ?? error) };
      }
    });

    ipcMain.handle("catalog:import-all", async () => {
      await refreshActiveInventory();
      const response = await runWriteOperation(() => importFullCatalog(activeCatalog, activeOverrides, activeCompanyCode, importMediaHooks(), activeRuntimeMappings));
      return { ...response, inventoryStatus: activeInventoryStatus };
    });

    ipcMain.handle("catalog:sync-manufacturers", async () =>
      runWriteOperation(() => syncFullCatalogManufacturers(activeCatalog)));

    createWindow();
  }

  await startDesktopApp();
}

// A single desktop process owns the local catalog and Base.com operations.
if (!app.requestSingleInstanceLock()) app.quit();
else void bootstrap().catch((error) => {
  console.error("Electron startup failed:", error);
  app.quit();
});
