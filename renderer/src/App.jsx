import { notifyOperation } from './operationNotifications.js';
import { useEffect, useMemo, useState } from "react";
import AppPresentation from "./AppPresentation.jsx";
import {
    filterCatalogProducts, filterOptions, isSelectableId,
    toggleSelectedId, resetCatalogControls, getSelectedProducts,
    selectionChange, undoSelectionChange, isSelectionUndoShortcut,
} from "./catalogFilters.js";

function App() {
    // Main-process connection
    const [response, setResponse] = useState("");
    
    // Environment check
    const [environment, setEnvironment] = useState(null);
    const [loading, setLoading] = useState(false);
    const [environmentError, setEnvironmentError] = useState("");
    const [dryRunMode, setDryRunMode] = useState(undefined);
    const [testModeEnabled, setTestModeEnabled] = useState(undefined);
    const [baseApiRequestsPerMinute, setBaseApiRequestsPerMinute] = useState(null);
    const [importReadStrategy, setImportReadStrategy] = useState(null);
    const [runtimeModeError, setRuntimeModeError] = useState("");
    const [baseConfigured, setBaseConfigured] = useState(undefined);

    // Vudoo catalog
    const [companyCode, setCompanyCode] = useState("");
    const [catalog, setCatalog] = useState(null);
    const [activeCatalogCode, setActiveCatalogCode] = useState('');
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState("");
    const [manufacturerDirectoryWarning, setManufacturerDirectoryWarning] = useState('');
    const [pendingManufacturerCode, setPendingManufacturerCode] = useState(null);

    // Product selection and preflight
    const [selectedIds, setSelectedIds] = useState([]);
    const [previousSelectedIds, setPreviousSelectedIds] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [extraFilters, setExtraFilters] = useState({});
    const [preflightResult, setPreflightResult] = useState(null);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [preflightError, setPreflightError] = useState("");
    const [importResult, setImportResult] = useState(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState("");
    const [fullPreflightResult, setFullPreflightResult] = useState(null);
    const [fullPreflightLoading, setFullPreflightLoading] = useState(false);
    const [fullPreflightError, setFullPreflightError] = useState("");
    const [fullImportResult, setFullImportResult] = useState(null);
    const [fullImportLoading, setFullImportLoading] = useState(false);
    const [fullImportError, setFullImportError] = useState("");
    const [manufacturerSyncResult, setManufacturerSyncResult] = useState(null);
    const [manufacturerSyncLoading, setManufacturerSyncLoading] = useState(false);
    const [manufacturerSyncError, setManufacturerSyncError] = useState("");
    const [page, setPage] = useState('base-overview');
    const [importScope, setImportScope] = useState('selected');
    const catalogBusy = catalogLoading || preflightLoading || importLoading ||
        fullPreflightLoading || fullImportLoading || manufacturerSyncLoading;
    const categories = useMemo(() => filterOptions(catalog?.products ?? [], 'category'), [catalog]);
    const canonicalCategories = useMemo(() => filterOptions(catalog?.products ?? [], 'canonicalCategory'), [catalog]);
    const filteredProducts = useMemo(() => filterCatalogProducts(catalog?.products ?? [], {
        searchQuery, categoryFilter, ...extraFilters,
    }), [catalog, searchQuery, categoryFilter, extraFilters]);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedProducts = useMemo(() => getSelectedProducts(catalog?.products ?? [], selectedIds),
        [catalog, selectedIds]);
    const visibleSelectedCount = useMemo(() => new Set(filteredProducts
        .map(({ product }) => product.id).filter(id => selectedIdSet.has(id))).size,
    [filteredProducts, selectedIdSet]);
    const selectableVisibleCount = useMemo(() => new Set(filteredProducts
        .map(({ product }) => product.id).filter(isSelectableId)).size, [filteredProducts]);
    const hasActiveFilters = Boolean(searchQuery.trim() || categoryFilter ||
        Object.entries(extraFilters).some(([key, value]) => key !== 'sortBy' && value));

    useEffect(() => {
        if (!window.electronAPI?.getRuntimeMode) {
            setRuntimeModeError("Collegamento con l'applicazione non disponibile.");
            return;
        }
        let active = true;
        window.electronAPI.getRuntimeMode()
            .then((mode) => {
                if (active) {
                    setDryRunMode(typeof mode?.dryRun === "boolean" ? mode.dryRun : null);
                    setTestModeEnabled(typeof mode?.testMode === "boolean" ? mode.testMode : null);
                    setBaseApiRequestsPerMinute(Number.isSafeInteger(mode?.baseApiRequestsPerMinute)
                        ? mode.baseApiRequestsPerMinute : null);
                    setImportReadStrategy(mode?.importReadStrategy ?? null);
                    setBaseConfigured(typeof mode?.baseConfigured === 'boolean' ? mode.baseConfigured : undefined);
                }
            })
            .catch(() => {
                if (active) setRuntimeModeError("Impossibile verificare la modalità di importazione.");
            });
        return () => { active = false; };
    }, []);

    async function handleSetOperatingMode(mode) {
        if (!window.electronAPI?.setOperatingMode) return { ok: false, code: 'unavailable' };
        try {
            const response = await window.electronAPI.setOperatingMode(mode);
            if (response?.ok && typeof response.dryRun === 'boolean') {
                setDryRunMode(response.dryRun);
                setRuntimeModeError('');
                if (catalog) await handleRetryInventory().catch(() => {});
            }
            return response;
        } catch {
            return { ok: false, code: 'storageError' };
        }
    }

    useEffect(() => {
        function handleKeyDown(event) {
            if (catalogBusy || previousSelectedIds === null || !isSelectionUndoShortcut(event)) return;
            event.preventDefault();
            undoLastSelectionChange();
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [catalogBusy, previousSelectedIds, selectedIds]);

    async function handlePing() {
        const result = await window.electronAPI.ping()
        setResponse(result)
    }

    async function handleEnvironmentCheck() {
        setLoading(true);
        setEnvironmentError("");

        try {
            const result = await window.electronAPI.checkEnvironment();
            setEnvironment(result);
        } catch (error) {
            setEnvironmentError(error?.message ?? "Verifica ambiente non riuscita.");
        } finally {
            setLoading(false);
        }
    }

    async function handleFetchCatalog(requestedCode = companyCode) {
        const code = String(requestedCode).trim();
        if (!code || catalogBusy) return false;
        setCatalogLoading(true)
        setCatalogError("")
        try {
        const result = await window.electronAPI.fetchCatalog(code)
        const changedCatalog = code !== activeCatalogCode;
        const availableIds = new Set(result?.products?.map(product => product.id) ?? []);
        setActiveCatalogCode(code)
        setCompanyCode(code)
        if (changedCatalog) {
            const reset = resetCatalogControls()
            setSelectedIds(reset.selectedIds)
            setSearchQuery(reset.searchQuery)
            setCategoryFilter(reset.categoryFilter)
            setExtraFilters({})
        } else {
            setSelectedIds(current => current.filter(id => availableIds.has(id)))
        }
        setPreviousSelectedIds(null)
        setPreflightResult(null)
        setPreflightError("")
        setImportResult(null)
        setImportError("")
        setFullPreflightResult(null)
        setFullPreflightError("")
        setFullImportResult(null)
        setFullImportError("")
        setManufacturerSyncResult(null)
        setManufacturerSyncError("")

            setCatalog(result)
            setManufacturerDirectoryWarning(result.manufacturerDirectoryStatus === 'unavailable'
                ? 'Anagrafica locale non disponibile. Il catalogo Vudoo è stato caricato normalmente.' : '');
            setPendingManufacturerCode(result.manufacturerDirectoryStatus === 'needs_name' ? code : null);
            notifyOperation('catalogLoaded');
            return true;
        } catch (error) {
            setCatalogError(error.message)
            notifyOperation('catalogFailed');
            return false;
        } finally {
            setCatalogLoading(false)
        }
    }

    async function handleSaveManufacturer(catalogCode, name) {
        if (catalogCode !== activeCatalogCode) throw new Error('Catalogo attivo cambiato. Ricarica il catalogo.');
        const response = await window.electronAPI.saveManufacturer({ catalogCode, name });
        if (!response?.ok) {
            throw new Error(response?.code === 'invalidValue' ? 'Inserisci un nome produttore valido.'
                : 'Impossibile salvare il produttore nell’anagrafica locale. Puoi continuare a usare il catalogo.');
        }
        setCatalog(current => current && ({ ...current, manufacturerName: response.manufacturer.name,
            inventoryStatus: response.inventoryStatus }));
        setPendingManufacturerCode(null);
    }

    async function handleSelectInventory(inventoryId) {
        const response = await window.electronAPI.selectManufacturerInventory(inventoryId);
        if (!response?.ok) throw new Error(response?.inventoryStatus?.message || 'Inventory non selezionabile. Ripeti la verifica.');
        setCatalog(current => current && ({ ...current, inventoryStatus: response.inventoryStatus }));
    }

    async function handleRetryInventory() {
        const response = await window.electronAPI.retryManufacturerInventory();
        if (!response?.ok) throw new Error('Verifica Inventory non riuscita.');
        setCatalog(current => current && ({ ...current, inventoryStatus: response.inventoryStatus }));
    }

    function handleSettingsModeChanged(nextDryRun) {
        setDryRunMode(nextDryRun);
        if (catalog) void handleRetryInventory().catch(() => {});
    }

    async function handleSaveProductOverride(input) {
        const response = await window.electronAPI.saveProductOverride(input);
        if (!response?.ok || !response.product) {
            throw new Error(response?.error || 'Impossibile salvare le modifiche al prodotto.');
        }
        setCatalog(current => current && ({
            ...current,
            products: current.products.map(product =>
                product.id === response.product.id ? response.product : product),
        }));
        invalidateSelectedResults();
        setFullPreflightResult(null);
        setFullPreflightError('');
        setFullImportResult(null);
        setFullImportError('');
        return response.product;
    }

    async function handleSaveProductFields(input) {
        const response = await window.electronAPI.saveProductFields(input);
        if (!response?.ok || !response.product) throw new Error(response?.error || 'Impossibile salvare il prodotto.');
        setCatalog(current => current && ({ ...current, products: current.products.map(product =>
            product.id === response.product.id ? response.product : product) }));
        invalidateSelectedResults(); setFullPreflightResult(null); setFullImportResult(null);
        return response.product;
    }

    async function handleBulkEditProducts(input) {
        const response = await window.electronAPI.bulkEditProducts(input);
        if (!response?.ok || !Array.isArray(response.products)) throw new Error(response?.error || 'Modifica massiva non riuscita.');
        const updated = new Map(response.products.map(product => [product.id, product]));
        setCatalog(current => current && ({ ...current, products: current.products.map(product => {
            const next = updated.get(product.id);
            return next ?? product;
        }) }));
        invalidateSelectedResults(); setFullPreflightResult(null); setFullImportResult(null);
        return response.changedCount ?? response.products.length;
    }

    function updateSelection(nextIds) {
        const change = selectionChange(selectedIds, nextIds);
        if (!change) return;
        setPreviousSelectedIds(change.previousSelectedIds);
        setSelectedIds(change.selectedIds);
        invalidateSelectedResults();
    }

    function invalidateSelectedResults() {
        setPreflightResult(null);
        setPreflightError("");
        setImportResult(null);
        setImportError("");
    }

    function undoLastSelectionChange() {
        const change = undoSelectionChange(previousSelectedIds);
        if (!change) return;
        setSelectedIds(change.selectedIds);
        setPreviousSelectedIds(change.previousSelectedIds);
        invalidateSelectedResults();
    }

    function handleToggleProduct(productId) {
        updateSelection(toggleSelectedId(selectedIds, productId));
    }

    async function handlePreflightSelected() {
        setImportScope('selected');
        setPage('preflight');
        setPreflightLoading(true);
        setPreflightResult(null);
        setPreflightError("");
        setImportResult(null);
        setImportError("");

        try {
            const response = await window.electronAPI.preflightSelected(selectedIds);
            if (!response?.ok || !response.result) {
                throw new Error(response?.error || "Risposta non valida durante i controlli preliminari.");
            }
            setPreflightResult(response.result);
            if (response.inventoryStatus) setCatalog(current => current && ({ ...current, inventoryStatus: response.inventoryStatus }));
        } catch (error) {
            setPreflightError(error?.message ?? String(error));
        } finally {
            setPreflightLoading(false);
        }
    }

    async function handleImportSelected() {
        if (!preflightResult || typeof dryRunMode !== "boolean") return;

        const modeDescription = dryRunMode
            ? "Modalità simulazione: nessuna modifica verrà scritta su Base.com."
            : "ATTENZIONE: modalità reale. L'importazione può modificare Base.com.";
        const confirmed = window.confirm(
            `Prodotti selezionati: ${selectedIds.length}.\n` +
            `Prodotti pronti per Base.com: ${preflightResult.products.readyForBase}.\n` +
            `${modeDescription}\nVuoi avviare l'importazione?`
        );
        if (!confirmed) return;
        setPage('result');

        setImportLoading(true);
        setImportResult(null);
        setImportError("");
        setPreflightResult(null);
        setFullPreflightResult(null);

        try {
            const response = await window.electronAPI.importSelected(selectedIds);
            if (!response?.ok || !response.result) {
                throw new Error(response?.error || "Risposta non valida dal processo principale.");
            }
            setImportResult(response.result);
            if (response.inventoryStatus) setCatalog(current => current && ({ ...current, inventoryStatus: response.inventoryStatus }));
            if (!response.result.ok) {
                setImportError(response.result.preflightError
                    ? `Controlli preliminari non superati: ${response.result.preflightError}`
                    : "Importazione terminata con errori o operazioni da verificare. Consulta il riepilogo.");
            }
        } catch (error) {
            setImportError(`Impossibile completare l'importazione: ${error?.message ?? String(error)}`);
        } finally {
            setImportLoading(false);
        }
    }

    async function handlePreflightFull() {
        setImportScope('full');
        setPage('preflight');
        setFullPreflightLoading(true);
        setFullPreflightResult(null);
        setFullPreflightError("");
        setFullImportResult(null);
        setFullImportError("");
        try {
            const response = await window.electronAPI.preflightFullCatalog();
            if (!response?.ok || !response.result) {
                throw new Error(response?.error || "Risposta non valida durante i controlli preliminari.");
            }
            setFullPreflightResult(response.result);
            if (response.inventoryStatus) setCatalog(current => current && ({ ...current, inventoryStatus: response.inventoryStatus }));
        } catch (error) {
            setFullPreflightError(error?.message ?? "Controlli preliminari non riusciti.");
        } finally {
            setFullPreflightLoading(false);
        }
    }

    async function handleImportFull() {
        if (!catalog || !fullPreflightResult || typeof dryRunMode !== "boolean") return;
        const modeDescription = dryRunMode
            ? "Modalità simulazione attiva: nessuna modifica verrà scritta su Base.com."
            : "ATTENZIONE: modalità reale. L'operazione può modificare Base.com.";
        const confirmed = window.confirm(
            `Catalogo caricato: ${catalog.totalProducts} prodotti.\n` +
            `Prodotti pronti dopo i controlli: ${fullPreflightResult.products.readyForBase}.\n` +
            (testModeEnabled ? "Limite di prova attivo: l'import elabora un solo prodotto.\n" : "") +
            `${modeDescription}\nVuoi avviare l'importazione completa?`
        );
        if (!confirmed) return;
        setPage('result');

        setFullImportLoading(true);
        setFullImportResult(null);
        setFullImportError("");
        setFullPreflightResult(null);
        setPreflightResult(null);
        try {
            const response = await window.electronAPI.importFullCatalog();
            if (!response?.ok || !response.result) {
                throw new Error(response?.error || "Risposta non valida dal processo principale.");
            }
            setFullImportResult(response.result);
            if (response.inventoryStatus) setCatalog(current => current && ({ ...current, inventoryStatus: response.inventoryStatus }));
            if (!response.result.ok) {
                setFullImportError(response.result.preflightError
                    ? `Controlli preliminari non superati: ${response.result.preflightError}`
                    : "Importazione terminata con errori o operazioni da verificare. Consulta il riepilogo.");
            }
        } catch (error) {
            setFullImportError(`Impossibile completare l'importazione: ${error?.message ?? String(error)}`);
        } finally {
            setFullImportLoading(false);
        }
    }

    async function handleManufacturerSync() {
        if (!catalog || typeof dryRunMode !== "boolean") return;
        const modeDescription = dryRunMode
            ? "Modalità simulazione: nessuna modifica verrà scritta su Base.com."
            : "ATTENZIONE: modalità reale. La sincronizzazione può creare produttori su Base.com.";
        if (!window.confirm(`Sincronizzare i produttori del catalogo caricato?\n${modeDescription}`)) return;

        setManufacturerSyncLoading(true);
        setManufacturerSyncResult(null);
        setManufacturerSyncError("");
        setFullPreflightResult(null);
        setPreflightResult(null);
        try {
            const response = await window.electronAPI.syncManufacturers();
            if (!response?.ok || !response.result?.ok) {
                throw new Error(response?.error || "Sincronizzazione non riuscita.");
            }
            setManufacturerSyncResult(response.result);
        } catch (error) {
            setManufacturerSyncError(`Impossibile sincronizzare i produttori: ${error?.message ?? String(error)}`);
        } finally {
            setManufacturerSyncLoading(false);
        }
    }

  return <AppPresentation model={{
    page, setPage, importScope, baseConfigured,
    response, handlePing, environment, environmentError, loading, handleEnvironmentCheck,
    dryRunMode, handleSetOperatingMode, setDryRunMode, handleSettingsModeChanged,
    testModeEnabled, baseApiRequestsPerMinute, importReadStrategy, runtimeModeError,
    companyCode, setCompanyCode, activeCatalogCode, catalog, catalogLoading, catalogError, catalogBusy, handleFetchCatalog,
    manufacturerDirectoryWarning, pendingManufacturerCode, setPendingManufacturerCode, handleSaveManufacturer,
    handleSelectInventory, handleRetryInventory,
    handleSaveProductOverride, handleSaveProductFields, handleBulkEditProducts,
    selectedIds, previousSelectedIds, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter,
    categories, canonicalCategories,
    extraFilters, setExtraFilters, filteredProducts, selectedIdSet,
    selectedProducts, visibleSelectedCount, selectableVisibleCount, hasActiveFilters,
    updateSelection, undoLastSelectionChange, handleToggleProduct,
    preflightResult, preflightLoading, preflightError, importResult, importLoading, importError,
    fullPreflightResult, fullPreflightLoading, fullPreflightError,
    fullImportResult, fullImportLoading, fullImportError,
    manufacturerSyncResult, manufacturerSyncLoading, manufacturerSyncError,
    handlePreflightSelected, handlePreflightFull, handleImportSelected, handleImportFull,
    handleManufacturerSync,
  }} />;
}

export default App;
