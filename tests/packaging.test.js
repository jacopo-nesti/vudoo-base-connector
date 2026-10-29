import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnvironment, resolveEnvironmentFile } from '../electron/localEnv.js';
import { preparePackagedConfiguration } from '../electron/packagedConfiguration.js';

test('Windows portable uses the approved multiresolution icon in EXE and BrowserWindow', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const icon = await readFile(path.join(root, 'build/icon.ico'));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  const count = icon.readUInt16LE(4);
  const sizes = Array.from({ length: count }, (_, index) => icon[6 + index * 16] || 256);
  assert.deepEqual(sizes, [16, 24, 32, 48, 64, 128, 256]);
  const config = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  assert.equal(config.build.win.icon, 'build/icon.ico');
  assert.ok(config.build.extraResources.some(resource => resource.from === 'build/icon.ico' && resource.to === 'icon.ico'));
  const main = await readFile(path.join(root, 'electron/main.js'), 'utf8');
  assert.match(main, /app\.isPackaged \? path\.join\(process\.resourcesPath, 'icon\.ico'\) : path\.join\(__dirname, '\.\.\/build\/icon\.ico'\)/);
});

test('portable configuration seeds only absent mapping files and keeps local changes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vudoo-portable-'));
  try {
    const resources = path.join(root, 'resources');
    const userData = path.join(root, 'userData');
    await mkdir(path.join(resources, 'config-defaults', 'suppliers'), { recursive: true });
    await mkdir(path.join(userData, 'config', 'suppliers'), { recursive: true });
    await writeFile(path.join(resources, 'config-defaults', 'canonical-categories.json'), 'default');
    await writeFile(path.join(resources, 'config-defaults', 'suppliers', 'supplier.json'), 'new');
    await writeFile(path.join(userData, 'config', 'suppliers', 'supplier.json'), 'edited');
    const paths = await preparePackagedConfiguration(resources, userData);
    assert.equal(await readFile(path.join(paths.configRoot, 'canonical-categories.json'), 'utf8'), 'default');
    assert.equal(await readFile(path.join(paths.configRoot, 'suppliers', 'supplier.json'), 'utf8'), 'edited');
    assert.equal(paths.reportRoot, path.join(userData, 'reports'));
    await writeFile(path.join(paths.configRoot, 'canonical-categories.json'), 'local');
    await preparePackagedConfiguration(resources, userData);
    assert.equal(await readFile(path.join(paths.configRoot, 'canonical-categories.json'), 'utf8'), 'local');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing portable .env is optional, but development .env remains required', async () => {
  const file = path.join(os.tmpdir(), `vudoo-missing-${process.pid}-${Date.now()}.env`);
  assert.equal(loadLocalEnvironment(file, { optional: true }), false);
  assert.throws(() => loadLocalEnvironment(file), { code: 'ENOENT' });
});

test('portable .env lives next to the original executable and loads before Base configuration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vudoo-portable-env-'));
  const previous = process.env.BASE_API_TOKEN;
  try {
    const portableDir = path.join(root, 'Ian');
    await mkdir(portableDir);
    const envFile = resolveEnvironmentFile({ packaged: true, projectRoot: 'unused',
      executableDir: portableDir, executablePath: path.join(root, 'extracted', 'app.exe') });
    assert.equal(envFile, path.join(portableDir, '.env'));
    await writeFile(envFile, 'BASE_API_TOKEN=packaging-test-placeholder\n');
    delete process.env.BASE_API_TOKEN;
    assert.equal(loadLocalEnvironment(envFile, { optional: true }), true);
    assert.equal(process.env.BASE_API_TOKEN, 'packaging-test-placeholder');
    assert.equal(resolveEnvironmentFile({ packaged: false, projectRoot: root }), path.join(root, '.env'));
  } finally {
    if (previous === undefined) delete process.env.BASE_API_TOKEN;
    else process.env.BASE_API_TOKEN = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test('packaged mappings and no-name report resolve inside local user data', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vudoo-portable-data-'));
  const previousConfig = process.env.VUDOO_CONFIG_ROOT;
  const previousReport = process.env.VUDOO_REPORT_ROOT;
  try {
    const resources = path.join(root, 'resources');
    const userData = path.join(root, 'userData');
    const repositoryConfig = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config');
    await cp(repositoryConfig, path.join(resources, 'config-defaults'), { recursive: true });
    const paths = await preparePackagedConfiguration(resources, userData);
    process.env.VUDOO_CONFIG_ROOT = paths.configRoot;
    process.env.VUDOO_REPORT_ROOT = paths.reportRoot;
    const { loadCategoryMappings } = await import(`../src/categoryNormalizer.js?packaging=${Date.now()}`);
    const mappings = await loadCategoryMappings();
    assert.ok(mappings.canonical.size > 0);
    const { recordNoNameProducts } = await import(`../src/noNameReport.js?packaging=${Date.now()}`);
    await recordNoNameProducts([{ id: 'LOCAL-TEST' }], 'local-test', 'Local test');
    const report = JSON.parse(await readFile(path.join(paths.reportRoot, 'no_name_products.json'), 'utf8'));
    assert.equal(report[0].id, 'LOCAL-TEST');
  } finally {
    if (previousConfig === undefined) delete process.env.VUDOO_CONFIG_ROOT;
    else process.env.VUDOO_CONFIG_ROOT = previousConfig;
    if (previousReport === undefined) delete process.env.VUDOO_REPORT_ROOT;
    else process.env.VUDOO_REPORT_ROOT = previousReport;
    await rm(root, { recursive: true, force: true });
  }
});
