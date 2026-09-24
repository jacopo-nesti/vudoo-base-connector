import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, rm, symlink, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { categoryMappings } from './fixtures/vudoo.js';

const root = process.cwd();
const runtimeFiles = ['cli.js', 'check.js', 'src', 'tools', 'package.json'];

const validXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <item>
      <title>Prodotto test</title>
      <g:brand>Marca</g:brand>
      <g:id>SKU-TEST</g:id>
      <g:price>25,00 EUR</g:price>
      <g:availability>in stock</g:availability>
    </item>
  </channel>
</rss>`;

async function createFixture({ legacyCatalog = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'vudoo-cli-'));
  try {
    for (const file of runtimeFiles) {
      await cp(join(root, file), join(directory, file), { recursive: true });
    }
    await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'junction');
    await mkdir(join(directory, 'config', 'suppliers'), { recursive: true });
    await writeFile(join(directory, 'config', 'canonical-categories.json'), JSON.stringify(categoryMappings.canonical, null, 2), 'utf8');
    await writeFile(join(directory, 'config', 'suppliers', 'test-supplier.json'),
      JSON.stringify({ supplier_id: 'TEST_SUPPLIER', ...categoryMappings.suppliers.TEST_SUPPLIER }, null, 2), 'utf8');
    if (legacyCatalog) await writeFile(join(directory, 'VUDOO.xml'), validXml, 'utf8');
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function withFixture(action, options) {
  const directory = await createFixture(options);
  try {
    return await action(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function controlledEnvironment(extra = {}) {
  const environment = {
    BASE_API_TOKEN: 'test-only-token',
    TEST_MODE: 'true',
    DRY_RUN: 'true',
    NODE_ENV: 'test',
    NODE_NO_WARNINGS: '1',
    NODE_OPTIONS: `--import=${pathToFileURL(join(root, 'tests', 'mock-base.mjs')).href}`,
    ...extra,
  };
  for (const name of ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'ComSpec']) {
    if (process.env[name] !== undefined) environment[name] = process.env[name];
  }
  return environment;
}

function runProcess(directory, entry, inputs = [], extraEnv = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      cwd: directory,
      env: controlledEnvironment(extraEnv),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error(`${entry} non ha completato il workflow entro ${timeoutMs} ms. Output:\n${output}`));
        return;
      }
      resolve({ code, signal, output });
    });
    child.stdin.end(inputs.map(input => `${input}\n`).join(''));
  });
}

test('CLI: mostra il nuovo menu e uscita volontaria termina con codice 0', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['5']);
    assert.equal(result.code, 0, result.output);
    assert.equal(result.signal, null);
    assert.match(result.output, /0\. Verifica ambiente e configurazione/);
    assert.match(result.output, /1\. Preflight catalogo Vudoo/);
    assert.match(result.output, /2\. Sincronizza produttori da Vudoo/);
    assert.match(result.output, /3\. Importa \/ aggiorna catalogo Vudoo/);
    assert.match(result.output, /4\. Esegui test automatici/);
    assert.match(result.output, /5\. Esci/);
    assert.doesNotMatch(result.output, /Converti XML|flusso completo/);
  });
});

test('CLI: verifica ambiente senza cataloghi locali', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['0', '5']);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /DIAGNOSTICA COMPLETATA CON SUCCESSO/);
    assert.match(result.output, /Rate limiter Base\.com.*100 richieste\/minuto/);
    assert.doesNotMatch(result.output, /real_products\.json|VUDOO\.xml/);
  });
});

test('CLI: preflight Vudoo usa il catalogo remoto mockato e non scrive', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['1', ' test-company ', '5'], { TEST_VUDOO_CODE: 'test-company' });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /\[VUDOO\] Catalogo XML recuperato/);
    assert.match(result.output, /\[PREFLIGHT\] Controlli preliminari completati/);
    assert.match(result.output, /\[VUDOO\] Preflight completato/);
    assert.doesNotMatch(result.output, /Payload Base\.com \(addInventoryProduct\)/);
    assert.doesNotMatch(result.output, /test-company|real_products\.json|VUDOO\.xml/);
  });
});

test('CLI: sincronizzazione produttori usa il catalogo remoto mockato', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['2', 'test-company', '5'], { TEST_VUDOO_CODE: 'test-company' });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /\[VUDOO\] Catalogo validato/);
    assert.match(result.output, /Produttore: Marca \(ID: 40\)/);
    assert.doesNotMatch(result.output, /real_products\.json|VUDOO\.xml/);
  });
});

test('CLI: import Vudoo usa il catalogo remoto mockato in DRY_RUN', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['3', 'test-company', '5'], { TEST_VUDOO_CODE: 'test-company' });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /\[VUDOO\] Preflight completato/);
    assert.match(result.output, /Payload Base\.com \(addInventoryProduct\)/);
    assert.match(result.output, /DRY_RUN: nessuna scrittura/);
    assert.doesNotMatch(result.output, /real_products\.json|VUDOO\.xml/);
  });
});

test('CLI: codice azienda vuoto ferma il flusso prima del preflight', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['1', '   ', '5']);
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /Codice azienda mancante/);
    assert.doesNotMatch(result.output, /\[PREFLIGHT\]|Payload Base/);
  });
});

test('CLI: XML remoto invalido non raggiunge Base.com', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['3', 'test-company', '5'], {
      TEST_VUDOO_CODE: 'test-company',
      TEST_BASE_SCENARIO: 'vudoo-invalid',
    });
    assert.equal(result.code, 1, result.output);
    assert.match(result.output, /\[VUDOO\] ERRORE/);
    assert.doesNotMatch(result.output, /\[PREFLIGHT\]|Payload Base/);
  });
});

test('CLI: input non valido torna al nuovo menu senza avviare operazioni', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'cli.js', ['99', '5']);
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /Scelta non valida.*0 a 5/);
    assert.doesNotMatch(result.output, /\[VUDOO\]|\[PREFLIGHT\]|DIAGNOSTICA/);
  });
});

test('Utility legacy: XML locale viene ancora convertito separatamente in JSON', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'tools/legacy/convert-json.js');
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /XML:\s+1 item/);
    const products = JSON.parse(await readFile(join(directory, 'real_products.json'), 'utf8'));
    assert.equal(products.length, 1);
    assert.equal(products[0].id, 'SKU-TEST');
  }, { legacyCatalog: true });
});

test('Utility legacy: sync locale resta disponibile e protetto da DRY_RUN', async () => {
  await withFixture(async directory => {
    const result = await runProcess(directory, 'tools/legacy/sync-json.js');
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /FLUSSO LEGACY XML → JSON → BASE/);
    assert.match(result.output, /--- Step 1: Conversione XML/);
    assert.match(result.output, /--- Step 2: Preflight Check/);
    assert.match(result.output, /--- Step 3: Importazione/);
    assert.match(result.output, /DRY_RUN: nessuna scrittura/);
  }, { legacyCatalog: true });
});
