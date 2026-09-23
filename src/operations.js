import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';
import { runEnvironmentCheck } from './checker.js';

export async function runOperation(name, codiceAzienda) {
  if (['vudoo-preflight', 'vudoo-manufacturers', 'vudoo-import'].includes(name)) {
    try {
      const operations = await import('./vudooImport.js');
      if (name === 'vudoo-preflight') {
        await operations.preflightVudooCatalog(codiceAzienda);
        return 0;
      }
      if (name === 'vudoo-manufacturers') return await operations.syncVudooManufacturers(codiceAzienda);
      return await operations.importVudooCatalog(codiceAzienda);
    } catch (error) {
      log(`[VUDOO] ERRORE: ${error.message}`);
      return 1;
    }
  }
  if (name === 'check') {
    try {
      return await runEnvironmentCheck();
    } catch (error) {
      log(`\n❌ ERRORE DIAGNOSTICA: ${error.message}`);
      return 1;
    }
  }

  if (name === 'test') {
    const test1 = fileURLToPath(new URL('../tests/integration-review.test.js', import.meta.url));
    const test2 = fileURLToPath(new URL('../tests/cli.test.js', import.meta.url));
    const test3 = fileURLToPath(new URL('../tests/vudoo-xml.test.js', import.meta.url));

    return await new Promise(resolve => {
      const child = spawn(process.execPath, ['--experimental-vm-modules', '--test', test1, test2, test3], {
        stdio: 'inherit',
        env: process.env,
        windowsHide: true
      });
      child.once('error', error => {
        log(`[TEST] Impossibile avviare i test: ${error.message}`);
        resolve(1);
      });
      child.once('close', code => resolve(code ?? 1));
    });
  }

  throw new Error(`Operazione non valida: ${name}`);
}
