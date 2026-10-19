import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { version } = require('../package.json');
const staging = await mkdtemp(path.join(os.tmpdir(), 'vudoo-portable-build-'));
const output = path.join(staging, 'output');
const artifact = `Vudoo-Base-Connector-${version}-portable-x64.exe`;
const result = spawnSync(process.execPath, [
  require.resolve('electron-builder/cli.js'), '--win', 'portable', '--x64',
  `--config.directories.output=${output}`,
], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    ELECTRON_BUILDER_CACHE: path.join(os.tmpdir(), 'vudoo-electron-builder-cache'),
  },
});
if (result.status !== 0) process.exit(result.status ?? 1);

const release = path.join(root, 'release');
await mkdir(release, { recursive: true });
await copyFile(path.join(output, artifact), path.join(release, artifact));
await copyFile(path.join(root, 'packaging', 'portable.env.example'), path.join(release, '.env.example'));
await rm(staging, { recursive: true, force: true });
console.log(`Portable pronta: ${path.join(release, artifact)}`);
