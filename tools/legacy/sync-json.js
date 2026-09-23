import { convertXmlToJson } from './xml-to-json.js';
import { runPreflightCheck } from '../../src/preflight.js';
import { runImport } from '../../src/importer.js';
import { log } from '../../src/logger.js';

async function main() {
  log('\n=== ESECUZIONE FLUSSO LEGACY XML → JSON → BASE ===\n');
  log('--- Step 1: Conversione XML → JSON ---');
  await convertXmlToJson();
  log('[CONVERT] Conversione completata con successo! ✅');

  log('\n--- Step 2: Preflight Check ---');
  const preflight = await runPreflightCheck();

  log('\n--- Step 3: Importazione / Aggiornamento prodotti ---');
  process.exitCode = await runImport(preflight);
}

main().catch(error => {
  log(`[SYNC LEGACY] ERRORE: ${error.message}`);
  process.exitCode = 1;
});
