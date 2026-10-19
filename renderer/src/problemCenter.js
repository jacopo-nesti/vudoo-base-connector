const GLOBAL_PROBLEMS = Object.freeze([
  ['catalogError', 'Catalogo Vudoo non disponibile', 'Riprova il caricamento del catalogo.', 'base-catalog', 'system'],
  ['runtimeModeError', 'Modalità Base.com da verificare', 'Controlla la configurazione locale prima delle operazioni.', 'base-settings', 'base'],
  ['environmentError', 'Verifica ambiente non riuscita', 'Ripeti la diagnostica locale.', 'system-diagnostics', 'system'],
  ['preflightError', 'Controlli Base.com non riusciti', 'Ripeti i controlli preliminari.', 'base-operations', 'base'],
  ['fullPreflightError', 'Controlli del catalogo Base.com non riusciti', 'Ripeti i controlli preliminari.', 'base-operations', 'base'],
  ['importError', 'Import Base.com terminato con problemi', 'Consulta il risultato dell’operazione.', 'result', 'base'],
  ['fullImportError', 'Import del catalogo Base.com terminato con problemi', 'Consulta il risultato dell’operazione.', 'result', 'base'],
  ['manufacturerSyncError', 'Sincronizzazione produttori non riuscita', 'Apri le operazioni Base.com.', 'base-operations', 'base'],
]);

const text = value => typeof value === 'string' ? value.trim() : '';
const productKey = (product, fallback) => text(product?.sku) || text(product?.id) || text(fallback);
const title = (product, fallback) => text(product?.title) || productKey(product, fallback) || 'Prodotto';
const issueText = (issue, fallback) => text(issue?.message) || text(issue?.field) || fallback;

export function deriveProblems({ catalog, errors = {} } = {}) {
  const problems = [];
  for (const [key, label, detail, page, channel] of GLOBAL_PROBLEMS) {
    if (errors[key]) problems.push({ id: `global:${key}`, channel, severity: 'error', title: label, detail, page });
  }
  if (catalog?.mappingError) problems.push({ id: 'global:mapping', channel: 'base', severity: 'error', title: 'Mapping categorie non disponibile', detail: 'Verifica le categorie nella diagnostica Base.com.', page: 'base-diagnostics' });
  if (errors.dryRunInvalid || errors.testModeInvalid) problems.push({ id: 'global:mode', channel: 'base', severity: 'error', title: 'Modalità Base.com non valida', detail: 'Controlla le impostazioni locali e riavvia l’applicazione.', page: 'base-settings' });

  for (const product of catalog?.products ?? []) {
    const report = product.basePreflight;
    const checks = (report?.checks ?? []).filter(check => check?.status === 'BLOCKING' || check?.status === 'WARNING');
    for (const [index, check] of checks.entries()) problems.push({
      id: `base:${product.id}:${check.code || index}:${index}`, channel: 'base',
      severity: check.status === 'BLOCKING' ? 'error' : 'warning',
      title: title(product, product.id), detail: issueText(check, `Controllo Base.com: ${report?.status || 'da verificare'}`),
      field: text(check.field), status: report?.status, productId: product.id, search: productKey(product), page: 'base-catalog',
    });
    if (!checks.length && report?.status && !['BASE_READY', 'READY'].includes(report.status)) problems.push({
      id: `base:${product.id}:status`, channel: 'base', severity: report.status === 'UNMAPPED_CATEGORY' ? 'warning' : 'error', title: title(product, product.id),
      detail: `Preflight Base.com: ${report.status}`, status: report.status,
      productId: product.id, search: productKey(product), page: 'base-catalog',
    });
  }

  return problems;
}

export function problemCounts(problems) {
  return { total: problems.length, error: problems.filter(problem => problem.severity === 'error').length,
    warning: problems.filter(problem => problem.severity === 'warning').length,
    products: new Set(problems.filter(problem => problem.productId).map(problem => `${problem.channel}:${problem.productId}`)).size };
}

export function exactProblemPage(rows, productId, pageSize = 50) {
  if (!productId || !Array.isArray(rows) || pageSize <= 0) return -1;
  const index = rows.findIndex(row => String(row?.product?.id ?? row?.id) === String(productId));
  return index < 0 ? -1 : Math.floor(index / pageSize);
}
