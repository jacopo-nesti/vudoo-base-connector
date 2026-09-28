import { useState } from "react";

function App() {
    const [response, setResponse] = useState("")
    const [environment, setEnvironment] = useState(null);
    const [loading, setLoading] = useState(false);

    async function handleEnvironmentCheck() {
        setLoading(true);

        try {
            const result = await window.electronAPI.checkEnvironment();
            setEnvironment(result);
        } finally {
            setLoading(false);
        }
    }
    
    async function handlePing() {
        const result = await window.electronAPI.ping()
        setResponse(result)
    }

  return (
    <main>
        <h1>Vudoo Base Connector</h1>

        <button onClick={handlePing}>
            Ping Electron
        </button>

        {response && <p>Risposta dal main: {response}</p>}

        <button onClick={handleEnvironmentCheck} disabled={loading}>
            {loading ? "Verifica in corso..." : "Verifica ambiente"}
        </button>

        {environment && (
            <pre>{JSON.stringify(environment, null, 2)}</pre>
        )}
    </main>
  );
}

export default App;