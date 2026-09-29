import { useEffect, useMemo, useState } from "react";
import SettingsPanel from "./SettingsPanel.jsx";
import { PreflightSummary, ImportSummary } from "./CatalogResults.jsx";
import { estimateImportDurationMs, formatDuration } from "./importTiming.js";
import {
    filterCatalogProducts, filterOptions, isSelectableId,
    toggleSelectedId, selectFilteredIds, deselectFilteredIds,
    clearSelectedIds, resetCatalogControls, getSelectedProducts,
    selectionChange, undoSelectionChange, isSelectionUndoShortcut, variantDetails,
} from "./catalogFilters.js";

const environmentLabels = {
    BASE_API_TOKEN: "Credenziali Base.com",
    TEST_MODE: "Modalità di test",
    DRY_RUN: "Modalità simulazione",
    "Rate limiter Base.com": "Limite richieste Base.com",
    "Categorie non mappate": "Gestione categorie non mappate",
    "Connessione Base.com & Inventory": "Connessione e inventario Base.com",
    "Price Group Base.com": "Gruppo prezzi Base.com",
    "Warehouse Base.com": "Magazzino Base.com",
};

function App() {
    // Main-process connection
    const [response, setResponse] = useState("");
    
    // Environment check
    const [environment, setEnvironment] = useState(null);
    const [loading, setLoading] = useState(false);
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
    const [showSettings, setShowSettings] = useState(false);
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

        try {
            const result = await window.electronAPI.checkEnvironment();
            setEnvironment(result);
        } finally {
            setLoading(false);
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

  return (
    <main>
        <h1>Vudoo Base Connector</h1>

        {dryRunMode === true && (
            <p><strong>Modalità simulazione attiva: nessuna modifica verrà scritta su Base.com.</strong></p>
        )}
        {testModeEnabled === true && (
            <p><strong>Modalità test attiva: gli import di prodotti sono limitati dal backend.</strong></p>
        )}
        {testModeEnabled === null && (
            <p role="alert">Configurazione della modalità test non valida. Controlla TEST_MODE nelle impostazioni e riavvia l'applicazione.</p>
        )}
        {dryRunMode === false && (
            <p role="alert"><strong>ATTENZIONE: modalità reale attiva. L'importazione può modificare Base.com.</strong></p>
        )}
        {dryRunMode === null && (
            <p role="alert">Configurazione della modalità di importazione non valida. Controlla DRY_RUN in .env e riavvia l'applicazione.</p>
        )}
        {dryRunMode === undefined && !runtimeModeError && <p>Verifica della modalità di importazione in corso...</p>}
        {runtimeModeError && <p role="alert">{runtimeModeError}</p>}

        <hr />

        <h2>Impostazioni</h2>
        <button type="button" onClick={() => setShowSettings(current => !current)} disabled={importLoading || fullImportLoading || manufacturerSyncLoading}>
            {showSettings ? "Chiudi impostazioni" : "Apri impostazioni"}
        </button>
        {showSettings && <SettingsPanel />}

        <hr />

        <h2>Collegamento con l'applicazione</h2>

        <button onClick={handlePing}>
            Verifica collegamento
        </button>

        {response && (
            <p>{response === "pong" ? "Collegamento riuscito." : "Risposta inattesa dal processo principale."}</p>
        )}

        <hr />

        <h2>Verifica ambiente</h2>

        <button 
            onClick={handleEnvironmentCheck} 
            disabled={loading}
        >
            {loading ? "Verifica in corso..." : "Verifica ambiente"}
        </button>

        {environment && (
            <section>
                <h3>Esito della verifica</h3>
                <p>{environment.ok ? "Configurazione verificata." : "Alcuni controlli richiedono attenzione."}</p>
                <ul>
                    {environment.checks.map((check) => (
                        <li key={check.title}>
                            {environmentLabels[check.title] ?? check.title}: {check.ok ? "Riuscito" : "Da correggere"}
                            {check.details && ` — ${check.details}`}
                        </li>
                    ))}
                </ul>
            </section>
        )}

        <hr />

        <h2>Catalogo Vudoo</h2>

        <input
            type="text"
            value={companyCode}
            onChange={(event) => setCompanyCode(event.target.value)}
            placeholder="Codice azienda"
        />

        <button
            onClick={handleFetchCatalog}
            disabled={catalogBusy || !companyCode.trim()}
        >
            {catalogLoading ? "Caricamento in corso..." : "Carica catalogo"}
        </button>

        {catalogError && (
            <p role="alert">Impossibile caricare il catalogo: {catalogError}</p>
        )}

        {catalog && (
            <div>
                <h3>Catalogo caricato</h3>

                <p>
                    <strong>Fornitore:</strong> {catalog.channelTitle}
                </p>

                <p>
                    <strong>Prodotti ricevuti:</strong> {catalog.totalProducts}
                </p>
                {catalog.durationMs != null && <p>Catalogo caricato in {formatDuration(catalog.durationMs)}.</p>}

                <section aria-label="Ricerca e selezione prodotti">
                    <label>
                        Cerca prodotti...{' '}
                        <input type="search" value={searchQuery}
                            onChange={event => setSearchQuery(event.target.value)}
                            placeholder="Cerca prodotti..." />
                    </label>{' '}
                    <label>
                        Categoria{' '}
                        <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                            <option value="">Tutte le categorie</option>
                            {categories.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                    </label>{' '}
                    <label>
                        Brand{' '}
                        <select value={brandFilter} onChange={event => setBrandFilter(event.target.value)}>
                            <option value="">Tutti i brand</option>
                            {brands.map(brand => <option key={brand} value={brand}>{brand}</option>)}
                        </select>
                    </label>{' '}
                    <button type="button" onClick={() => {
                        setSearchQuery(""); setCategoryFilter(""); setBrandFilter("");
                    }} disabled={!hasActiveFilters}>Azzera filtri</button>

                    <p>{catalog.totalProducts} prodotti nel catalogo · {filteredProducts.length} prodotti visualizzati · {selectedIds.length} prodotti selezionati</p>
                    {selectedIds.length > visibleSelectedCount && (
                        <p>{selectedIds.length - visibleSelectedCount} prodotti selezionati non sono visibili con i filtri attuali.</p>
                    )}
                    <button type="button" disabled={catalogBusy || selectableVisibleCount === 0 || visibleSelectedCount === selectableVisibleCount}
                        onClick={() => updateSelection(selectFilteredIds(selectedIds, filteredProducts))}>
                        Seleziona tutti i risultati
                    </button>{' '}
                    <button type="button" disabled={catalogBusy || visibleSelectedCount === 0}
                        onClick={() => {
                            if (visibleSelectedCount === 0 || !window.confirm(
                                `Vuoi deselezionare ${visibleSelectedCount} prodotti selezionati tra quelli visualizzati?`
                            )) return;
                            updateSelection(deselectFilteredIds(selectedIds, filteredProducts));
                        }}>
                        Deseleziona risultati
                    </button>{' '}
                    <button type="button" disabled={catalogBusy || selectedIds.length === 0}
                        onClick={() => {
                            if (!window.confirm(
                                `Vuoi rimuovere tutti i prodotti dalla selezione?\nProdotti da rimuovere: ${selectedIds.length}.`
                            )) return;
                            updateSelection(clearSelectedIds(selectedIds));
                        }}>Svuota selezione</button>{' '}
                    <button type="button" disabled={catalogBusy || previousSelectedIds === null}
                        onClick={undoLastSelectionChange}>Annulla ultima modifica</button>
                </section>

                <details>
                    <summary>Visualizza prodotti selezionati ({selectedIds.length})</summary>
                    {selectedProducts.length === 0 && <p>Nessun prodotto selezionato.</p>}
                    {selectedProducts.map(product => (
                        <div key={product.id}>
                            <p><strong>Titolo: </strong>{product.title}</p>
                            <p><strong>SKU Vudoo: </strong>{product.sku}</p>
                            <p><strong>Brand: </strong>{product.brand}</p>
                            {variantDetails(product).map(([label, value]) => (
                                <p key={label}><strong>{label}: </strong>{value}</p>
                            ))}
                            <p><strong>Prezzo: </strong>{product.price}</p>
                            <button type="button" disabled={catalogBusy}
                                onClick={() => updateSelection(toggleSelectedId(selectedIds, product.id))}>
                                Rimuovi
                            </button>
                        </div>
                    ))}
                </details>

                <section>
                    <h4>Catalogo completo</h4>
                    <button onClick={handlePreflightFull} disabled={catalogBusy}>
                        {fullPreflightLoading ? "Controlli preliminari in corso..." : "Esegui controlli preliminari del catalogo completo"}
                    </button>
                    {fullPreflightError && <p role="alert">Controlli preliminari non riusciti: {fullPreflightError}</p>}
                    {fullPreflightResult && (
                        <>
                            <PreflightSummary result={fullPreflightResult} title="Controlli preliminari completati" />
                            {estimateImportDurationMs(fullPreflightResult.products.readyForBase, baseApiRequestsPerMinute, { dryRun: dryRunMode, ...importReadStrategy }) != null && (
                                <p>Stima indicativa dal ritmo delle richieste Base.com: circa {formatDuration(
                                    estimateImportDurationMs(fullPreflightResult.products.readyForBase, baseApiRequestsPerMinute, { dryRun: dryRunMode, ...importReadStrategy })
                                )} {dryRunMode ? 'senza scritture' : 'se tutti i prodotti richiedono una scrittura'}. La durata reale dipende anche dalle pagine Base, dagli SKU nuovi e dai tempi di risposta.</p>
                            )}
                            {fullPreflightResult.products.readyForBase > 0 ? (
                                <button onClick={handleImportFull} disabled={catalogBusy || typeof dryRunMode !== "boolean"}>
                                    Importa / aggiorna catalogo completo
                                </button>
                            ) : (
                                <p>Nessun prodotto del catalogo è pronto per l'importazione.</p>
                            )}
                        </>
                    )}
                    {fullImportLoading && <p>Importazione catalogo in corso...</p>}
                    {fullImportError && <p role="alert">{fullImportError}</p>}
                    {fullImportResult && <ImportSummary result={fullImportResult} dryRunMode={dryRunMode} />}
                </section>

                <section>
                    <h4>Produttori</h4>
                    <button onClick={handleManufacturerSync} disabled={catalogBusy || typeof dryRunMode !== "boolean"}>
                        {manufacturerSyncLoading ? "Sincronizzazione produttori in corso..." : "Sincronizza produttori"}
                    </button>
                    {manufacturerSyncError && <p role="alert">{manufacturerSyncError}</p>}
                    {manufacturerSyncResult && (
                        <p role="status">{dryRunMode ? "Sincronizzazione simulata completata." : "Sincronizzazione completata."}</p>
                    )}
                </section>

                <h4>Prodotti selezionati</h4>

                <button
                    onClick={handlePreflightSelected}
                    disabled={selectedIds.length === 0 || catalogBusy}
                >
                    {preflightLoading ? "Controlli preliminari in corso..." : "Verifica prodotti selezionati"}
                </button>

                {preflightError && <p role="alert">Controlli preliminari non riusciti: {preflightError}</p>}
                {preflightResult && (
                    <section>
                        <PreflightSummary result={preflightResult} title="Controlli preliminari completati" />
                        {estimateImportDurationMs(preflightResult.products.readyForBase, baseApiRequestsPerMinute, { dryRun: dryRunMode, ...importReadStrategy }) != null && (
                            <p>Stima indicativa dal ritmo delle richieste Base.com: circa {formatDuration(
                                estimateImportDurationMs(preflightResult.products.readyForBase, baseApiRequestsPerMinute, { dryRun: dryRunMode, ...importReadStrategy })
                            )} {dryRunMode ? 'senza scritture' : 'se tutti i prodotti richiedono una scrittura'}. La durata reale può variare.</p>
                        )}
                        {preflightResult.products.readyForBase > 0 ? (
                            <button
                                onClick={handleImportSelected}
                                disabled={catalogBusy || typeof dryRunMode !== "boolean"}
                            >
                                Importa prodotti selezionati
                            </button>
                        ) : (
                            <p>Nessun prodotto selezionato è pronto per l'importazione.</p>
                        )}
                    </section>
                )}

                {importLoading && <p>Importazione in corso...</p>}
                {importError && <p role="alert">{importError}</p>}
                {importResult && <ImportSummary result={importResult} dryRunMode={dryRunMode} />}

                <hr />

                {catalog.products.length === 0 && <p>Il catalogo non contiene prodotti.</p>}
                {catalog.products.length > 0 && filteredProducts.length === 0 && (
                    <p>Nessun prodotto corrisponde ai filtri selezionati.</p>
                )}
                {filteredProducts.map(({ product, index }) => (
                    <div key={isSelectableId(product.id) ? `${product.id}-${index}` : `missing-${product.sku ?? 'id'}-${index}`}>
                            <input
                                type="checkbox"
                                checked={isSelectableId(product.id) && selectedIdSet.has(product.id)}
                                onChange={() => handleToggleProduct(product.id)}
                                disabled={catalogBusy || !isSelectableId(product.id)}
                                aria-label={`Seleziona ${product.title ?? "prodotto"}`}
                            />
                        {!isSelectableId(product.id) && <span>ID non disponibile</span>}

                        <p><strong>SKU Vudoo: </strong>{product.sku}</p>
                        <p><strong>Titolo: </strong>{product.title}</p>
                        <p><strong>Produttore: </strong>{product.brand}</p>
                        {variantDetails(product).map(([label, value]) => (
                            <p key={label}><strong>{label}: </strong>{value}</p>
                        ))}
                        <p><strong>Prezzo: </strong>{product.price}</p>
                        <p><strong>Categoria: </strong>{product.category}</p>
                        <p><strong>Codice produttore (MPN): </strong>{product.mpn}</p>
                        <hr />
                    </div>
                ))}
            </div>
        )}

    </main>
  );
}

export default App;
