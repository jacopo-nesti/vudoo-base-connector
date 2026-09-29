import { useEffect, useState } from "react";
import SettingsPanel from "./SettingsPanel.jsx";
import { PreflightSummary, ImportSummary } from "./CatalogResults.jsx";
import { estimateImportDurationMs, formatDuration } from "./importTiming.js";

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
        setSelectedIds([])
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

    function handleToggleProduct(productId) {
        setPreflightResult(null);
        setPreflightError("");
        setImportResult(null);
        setImportError("");
        setSelectedIds((currentIds) => {
            if (currentIds.includes(productId)) {
            return currentIds.filter((id) => id !== productId);
            }

            return [...currentIds, productId];
        });
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

                <p>Prodotti selezionati: {selectedIds.length}</p>

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

                {catalog.products.map((product, index) => (
                    <div key={`${product.id ?? "missing-id"}-${index}`}>
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(product.id)}
                                onChange={() => handleToggleProduct(product.id)}
                                disabled={catalogBusy || typeof product.id !== "string" || !product.id.trim()}
                                aria-label={`Seleziona ${product.title ?? "prodotto"}`}
                            />

                        <p><strong>SKU Vudoo: </strong>{product.sku}</p>
                        <p><strong>Titolo: </strong>{product.title}</p>
                        <p><strong>Produttore: </strong>{product.brand}</p>
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
