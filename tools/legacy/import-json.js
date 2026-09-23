import { runImport } from '../../src/importer.js';
import { log } from '../../src/logger.js';

runImport().catch(error => {
  log(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
