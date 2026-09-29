import { runImport } from '../../src/importer.js';
import { log } from '../../src/logger.js';

runImport().then(result => {
  process.exitCode = result.ok ? 0 : 1;
}).catch(error => {
  log(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
