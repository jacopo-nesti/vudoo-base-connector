import { runEnvironmentCheck } from './src/checker.js';

runEnvironmentCheck()
  .then(result => {
    process.exitCode = result.ok ? 0 : 1;
  })
  .catch(error => {
    console.error(`\n❌ ERRORE CRITICO DIAGNOSTICA: ${error.message}`);
    process.exitCode = 1;
  });
