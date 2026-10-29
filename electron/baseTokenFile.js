import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const tokenLine = /^\s*(?:export\s+)?BASE_API_TOKEN\s*=/;

async function readExisting(file) {
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

async function update(file, nextToken) {
  const original = await readExisting(file);
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original ? original.split(/\r?\n/) : [];
  const first = lines.findIndex(line => tokenLine.test(line));
  const kept = lines.filter(line => !tokenLine.test(line));
  if (nextToken !== null) kept.splice(first < 0 ? kept.length : first, 0,
    `BASE_API_TOKEN=${JSON.stringify(nextToken)}`);
  let content = kept.join(newline);
  if (content && !content.endsWith(newline)) content += newline;
  if (!content && nextToken === null && !original) return;
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function saveBaseToken(file, value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096 || /[\r\n\0]/.test(value)) {
    return { ok: false, code: 'invalidToken' };
  }
  await update(file, value.trim());
  return { ok: true, configured: true };
}

export async function deleteBaseToken(file) {
  await update(file, null);
  return { ok: true, configured: false };
}
