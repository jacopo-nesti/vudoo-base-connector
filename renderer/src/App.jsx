import { useState } from "react";

function App() {
    // Ping
    const [response, setResponse] = useState("");
    
    // Environment check
    const [environment, setEnvironment] = useState(null);
    const [loading, setLoading] = useState(false);

    // Catalogo Vudoo
    const [companyCode, setCompanyCode] = useState("");
    const [catalog, setCatalog] = useState(null);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState("");

    // Selezione prodotti
    const [selectedIds, setSelectedIds] = useState([]);
    const [preflightResult, setPreflightResult] = useState(null);
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [preflightError, setPreflightError] = useState("");

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

        try {
            const response = await window.electronAPI.preflightSelected(selectedIds);
            if (!response.ok) throw new Error(response.error);
            setPreflightResult(response.result);
        } catch (error) {
            setPreflightError(error?.message ?? String(error));
        } finally {
            setPreflightLoading(false);
        }
    }

  return (
    <main>
        <h1>Vudoo Base Connector</h1>

        <hr />

        <h2>Test IPC</h2>

        <button onClick={handlePing}>
            Ping Electron
        </button>

        {response && (
            <p>Risposta dal main: {response}</p>
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
            <pre>
                {JSON.stringify(environment, null, 2)}
            </pre>
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
            disabled={catalogLoading || preflightLoading || !companyCode.trim()}
        >
            {catalogLoading ? "Caricamente..." : "Carica catalogo"}
        </button>

        {catalogError && (
            <p>Errore: {catalogError}</p>
        )}

        {catalog && (
            <div>
                <h3>Catalogo caricato</h3>

                <p>
                    <strong>Supplier:</strong> {catalog.channelTitle}
                </p>

                <p>
                    <strong>Prodotti ricevuti:</strong> {catalog.totalProducts}
                </p>

                <p>Prodotti selezionati: {selectedIds.length}</p>

                <button
                    onClick={handlePreflightSelected}
                    disabled={selectedIds.length === 0 || preflightLoading || catalogLoading}
                >
                    {preflightLoading ? "Preflight in corso..." : "Esegui preflight selezione"}
                </button>

                {preflightError && <p>Errore preflight: {preflightError}</p>}
                {preflightResult && (
                    <pre>{JSON.stringify(preflightResult, null, 2)}</pre>
                )}

                <hr />

                {catalog.products.map((product) => (
                    <div key={product.id}>
                            <input
                                type="checkbox"
                                checked={selectedIds.includes(product.id)}
                                onChange={() => handleToggleProduct(product.id)}
                                disabled={preflightLoading || typeof product.id !== "string" || !product.id.trim()}
                            />

                        <p><strong>Sku: </strong>{product.sku}</p>
                        <p><strong>Titolo: </strong>{product.title}</p>
                        <p><strong>Brand: </strong>{product.brand}</p>
                        <p><strong>Prezzo: </strong>{product.price}</p>
                        <p><strong>Categoria: </strong>{product.category}</p>
                        <p><strong>Mpn: </strong>{product.mpn}</p>
                        <hr />
                    </div>
                ))}
            </div>
        )}

    </main>
  );
}

export default App;
