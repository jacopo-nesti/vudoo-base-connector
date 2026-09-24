import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';

export const noNameReportPath = 'reports/no_name_products.json';
const defaultReportUrl = new URL('../reports/no_name_products.json', import.meta.url);
let temporaryFileCounter = 0;

export async function recordNoNameProducts(products, supplierId, sourceTitle, reportUrl = defaultReportUrl, now = new Date()) {
  const recordable = products.filter(product => typeof product.id === 'string' && product.id.trim());
  if (recordable.length === 0) return 0;
  if (typeof supplierId !== 'string' || !supplierId.trim()) throw new Error('supplier_id mancante per il registro prodotti senza categoria.');
  await mkdir(new URL('.', reportUrl), { recursive: true });
  let existing = [];
  try {
    const text = await readFile(reportUrl, 'utf8');
    if (text.trim()) existing = JSON.parse(text);
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Impossibile leggere ${noNameReportPath}: ${error.message}`);
  }
  if (!Array.isArray(existing)) throw new Error(`${noNameReportPath} deve contenere un array JSON.`);
  const byIdentity = new Map();
  for (const entry of existing) {
    if (!entry || typeof entry.supplier_id !== 'string' || typeof entry.id !== 'string') {
      throw new Error(`${noNameReportPath} contiene una voce non valida.`);
    }
    const key = `${entry.supplier_id}\0${entry.id}`;
    if (byIdentity.has(key)) throw new Error(`${noNameReportPath} contiene prodotti duplicati.`);
    byIdentity.set(key, entry);
  }
  const timestamp = now.toISOString();
  for (const product of recordable) {
    const id = product.id;
    const key = `${supplierId}\0${id}`;
    const previous = byIdentity.get(key);
    byIdentity.set(key, {
      supplier_id: supplierId,
      source_title: sourceTitle,
      id,
      sku: product.vudoo_sku ?? product.source?.sku ?? null,
      title: product.original_title ?? product.source?.title ?? product.title ?? null,
      product_type: product.source_category ?? product.product_type ?? null,
      first_seen: previous?.first_seen ?? timestamp,
      last_seen: timestamp,
    });
  }
  const output = [...byIdentity.values()].sort((a, b) =>
    a.supplier_id.localeCompare(b.supplier_id) || a.id.localeCompare(b.id));
  const temporary = new URL(`no_name_products.json.tmp-${process.pid ?? 'test'}-${Date.now()}-${++temporaryFileCounter}`, reportUrl);
  try {
    await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, reportUrl);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw new Error(`Impossibile aggiornare ${noNameReportPath}: ${error.message}`);
  }
  return recordable.length;
}
