import { syncManufacturers } from '../../src/productor.js';
import { log } from '../../src/logger.js';

syncManufacturers().catch(error => {
  log(`Errore: ${error.message}`);
  process.exitCode = 1;
});
