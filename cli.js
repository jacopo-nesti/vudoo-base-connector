import { createInterface } from 'node:readline';
import { dryRun, testMode } from './src/config.js';
import { log } from './src/logger.js';
import { runOperation } from './src/operations.js';
import { chooseVudooProducts } from './src/productSelectionCli.js';

const input = createInterface({ input: process.stdin, output: process.stdout });
const answers = input[Symbol.asyncIterator]();
input.on('SIGINT', () => {
  process.exitCode = 130;
  input.close();
});

async function ask(prompt) {
  process.stdout.write(prompt);
  const answer = await answers.next();
  return answer.done ? null : answer.value.trim();
}

function mode(value) {
  if (value === 'true') return 'ATTIVO';
  if (value === 'false') return 'DISATTIVO';
  return 'NON VALIDO (attesi true oppure false)';
}

async function main() {
  const choices = {
    0: 'check',
    1: 'vudoo-preflight',
    2: 'vudoo-manufacturers',
    3: 'vudoo-import',
    4: 'vudoo-import-selective',
    5: 'test',
  };

  while (true) {
    log(`\n================================\nVUDOO BASE CONNECTOR\n================================\nDRY_RUN: ${mode(dryRun)}\nTEST_MODE: ${mode(testMode)}\n\n0. Verifica ambiente e configurazione\n1. Preflight catalogo Vudoo\n2. Sincronizza produttori da Vudoo\n3. Importa / aggiorna catalogo completo Vudoo su Base.com\n4. Importa / aggiorna prodotti selezionati da Vudoo su Base.com\n5. Esegui test automatici\n6. Esci`);
    const choice = await ask('Seleziona operazione: ');
    if (choice === null || choice === '6') return;

    let operation = Object.hasOwn(choices, choice) ? choices[choice] : null;
    if (!operation) {
      log('Scelta non valida. Seleziona un numero da 0 a 6.');
      continue;
    }

    while (operation) {
      let codiceAzienda;
      const options = {};
      if (operation.startsWith('vudoo-')) {
        codiceAzienda = await ask('Inserisci codice azienda: ');
        if (codiceAzienda === null) return;
        if (codiceAzienda) {
          if (operation === 'vudoo-import-selective') {
            options.selectSources = sources => chooseVudooProducts(sources, ask, log);
          }
        }
      }
      const code = await runOperation(operation, codiceAzienda, options);
      process.exitCode = code;
      operation = null;
    }
  }
}

main().catch(error => {
  log(`[CLI] ERRORE: ${error.message}`);
  process.exitCode = 1;
}).finally(() => input.close());
