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
    const [amazonDiagnostic, setAmazonDiagnostic] = useState(null);
    const [amazonDiagnosticLoading, setAmazonDiagnosticLoading] = useState(false);
    const [amazonDiagnosticError, setAmazonDiagnosticError] = useState("");
    const [dryRunMode, setDryRunMode] = useState(undefined);
    const [testModeEnabled, setTestModeEnabled] = useState(undefined);
    const [baseApiRequestsPerMinute, setBaseApiRequestsPerMinute] = useState(null);
    const [importReadStrategy, setImportReadStrategy] = useState(null);
    const [runtimeModeError, setRuntimeModeError] = useState("");

    // Vudoo catalog
    const [companyCode, setCompanyCode] = useState("");
    const [catalog, setCatalog] = useState(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState("");

    // Product selection and preflight
    const [selectedIds, setSelectedIds] = useState([]);
    const [previousSelectedIds, setPreviousSelectedIds] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [brandFilter, setBrandFilter] = useState("");
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
    const [page, setPage] = useState('overview');
    const [importScope, setImportScope] = useState('selected');
    const catalogBusy = catalogLoading || preflightLoading || importLoading ||
        fullPreflightLoading || fullImportLoading || manufacturerSyncLoading;
    const categories = useMemo(() => filterOptions(catalog?.products ?? [], 'category'), [catalog]);
    const brands = useMemo(() => filterOptions(catalog?.products ?? [], 'brand'), [catalog]);
    const filteredProducts = useMemo(() => filterCatalogProducts(catalog?.products ?? [], {
        searchQuery, categoryFilter, brandFilter,
    }), [catalog, searchQuery, categoryFilter, brandFilter]);
    const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const selectedProducts = useMemo(() => getSelectedProducts(catalog?.products ?? [], selectedIds),
        [catalog, selectedIds]);
    const visibleSelectedCount = useMemo(() => new Set(filteredProducts
        .map(({ product }) => product.id).filter(id => selectedIdSet.has(id))).size,
    [filteredProducts, selectedIdSet]);
    const selectableVisibleCount = useMemo(() => new Set(filteredProducts
        .map(({ product }) => product.id).filter(isSelectableId)).size, [filteredProducts]);
    const hasActiveFilters = Boolean(searchQuery.trim() || categoryFilter || brandFilter);

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
                }
            })
            .catch(() => {
                if (active) setRuntimeModeError("Impossibile verificare la modalità di importazione.");
            });
        return () => { active = false; };
    }, []);

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

    async function handleAmazonDiagnostic() {
        setAmazonDiagnosticLoading(true);
        setAmazonDiagnosticError("");
        setAmazonDiagnostic(null);
        try {
            setAmazonDiagnostic(await window.electronAPI.diagnoseAmazon());
        } catch {
            setAmazonDiagnosticError("Impossibile eseguire la verifica Amazon.");
        } finally {
            setAmazonDiagnosticLoading(false);
        }
    }

    async function handleFetchCatalog() {
        setCatalogLoading(true)
        setCatalogError("")
        setCatalog(null)
        const reset = resetCatalogControls()
        setSelectedIds(reset.selectedIds)
        setPreviousSelectedIds(null)
        setSearchQuery(reset.searchQuery)
        setCategoryFilter(reset.categoryFilter)
        setBrandFilter(reset.brandFilter)
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

        try {
            const result = await window.electronAPI.fetchCatalog(companyCode)
            setCatalog(result)
        } catch (error) {
            setCatalogError(error.message)
        } finally {
            setCatalogLoading(false)
        }
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
            (testModeEnabled ? "Modalità test attiva: l'import dei prodotti è limitato dal backend.\n" : "") +
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
    page, setPage, importScope,
    response, handlePing, environment, environmentError, loading, handleEnvironmentCheck,
    amazonDiagnostic, amazonDiagnosticLoading, amazonDiagnosticError, handleAmazonDiagnostic,
    dryRunMode, testModeEnabled, baseApiRequestsPerMinute, importReadStrategy, runtimeModeError,
    companyCode, setCompanyCode, catalog, catalogLoading, catalogError, catalogBusy, handleFetchCatalog,
    handleSaveProductOverride,
    selectedIds, previousSelectedIds, searchQuery, setSearchQuery, categoryFilter, setCategoryFilter,
    brandFilter, setBrandFilter, categories, brands, filteredProducts, selectedIdSet,
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
