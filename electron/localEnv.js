import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { parseEnv } from 'node:util';
import path from 'node:path';

export function resolveEnvironmentFile({ packaged, projectRoot, executableDir, executablePath }) {
  return packaged
    ? path.join(executableDir || path.dirname(executablePath), '.env')
    : path.join(projectRoot, '.env');
}

export function loadLocalEnvironment(file, { optional = false } = {}) {
  try {
    loadEnvFile(file);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return false;
    throw error;
  }
  // Node preserves an inherited empty variable; the local configuration should fill it.
  if (!process.env.BASE_API_TOKEN?.trim()) {
    const localToken = parseEnv(readFileSync(file, 'utf8')).BASE_API_TOKEN?.trim();
    if (localToken) process.env.BASE_API_TOKEN = localToken;
  }
  return true;
}
