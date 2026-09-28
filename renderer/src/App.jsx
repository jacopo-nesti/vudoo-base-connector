import { useEffect, useState } from "react";

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

    useEffect(() => {
        if (!window.electronAPI?.getRuntimeMode) {
            setRuntimeModeError("Collegamento con l'applicazione non disponibile.");
            return;
        }
        let active = true;
        window.electronAPI.getRuntimeMode()
            .then((mode) => {
                if (active) setDryRunMode(typeof mode?.dryRun === "boolean" ? mode.dryRun : null);
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

  return (
    <main>
        <h1>Vudoo Base Connector</h1>

        {dryRunMode === true && (
            <p><strong>Modalità simulazione attiva: nessuna modifica verrà scritta su Base.com.</strong></p>
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
            disabled={catalogLoading || preflightLoading || importLoading || !companyCode.trim()}
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

                <p>Prodotti selezionati: {selectedIds.length}</p>

                <button
                    onClick={handlePreflightSelected}
                    disabled={selectedIds.length === 0 || preflightLoading || importLoading || catalogLoading}
                >
                    {preflightLoading ? "Controlli preliminari in corso..." : "Verifica prodotti selezionati"}
                </button>

                {preflightError && <p role="alert">Controlli preliminari non riusciti: {preflightError}</p>}
                {preflightResult && (
                    <section>
                        <h4>Controlli preliminari completati</h4>
                        <p>Prodotti selezionati: {preflightResult.selection.selected}</p>
                        <p>Prodotti pronti per Base.com: {preflightResult.products.readyForBase}</p>
                        <p>Categorie riconosciute: {preflightResult.categories.mapped}</p>
                        <p>Categorie non mappate: {preflightResult.categories.unmapped}</p>
                        <p>Prodotti esclusi per categoria mancante: {preflightResult.products.missingSourceCategory}</p>
                        <p>Prodotti esclusi per categoria non mappata: {preflightResult.products.unmappedValidCategory}</p>
                        {preflightResult.products.readyForBase > 0 ? (
                            <button
                                onClick={handleImportSelected}
                                disabled={importLoading || typeof dryRunMode !== "boolean"}
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
                {importResult && (
                    <section>
                        <h4>{importResult.ok
                            ? (dryRunMode ? "Simulazione completata" : "Importazione completata")
                            : "Importazione completata con problemi"}</h4>
                        <p>Prodotti selezionati: {importResult.selected}</p>
                        <p>Prodotti elaborati: {importResult.processed}</p>
                        <p>Prodotti creati: {importResult.created}</p>
                        <p>Prodotti aggiornati: {importResult.updated}</p>
                        <p>Prodotti invariati: {importResult.unchanged}</p>
                        <p>Operazioni simulate: {importResult.simulated}</p>
                        <p>Errori: {importResult.errors}</p>
                        <p>Avvisi EAN: {importResult.eanWarningsCount}</p>
                        {importResult.uncertainSkus.length > 0 && (
                            <div>
                                <p>Operazioni con esito incerto:</p>
                                <ul>{importResult.uncertainSkus.map((sku) => <li key={sku}>{sku}</li>)}</ul>
                            </div>
                        )}
                        {importResult.errorSkus.length > 0 && (
                            <div>
                                <p>Prodotti con errore:</p>
                                <ul>{importResult.errorSkus.map((sku) => <li key={sku}>{sku}</li>)}</ul>
                            </div>
                        )}
                    </section>
                )}

                <hr />

                {catalog.products.map((product, index) => (
                    <div key={`${product.id ?? "missing-id"}-${index}`}>
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(product.id)}
                                onChange={() => handleToggleProduct(product.id)}
                                disabled={preflightLoading || importLoading || typeof product.id !== "string" || !product.id.trim()}
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
