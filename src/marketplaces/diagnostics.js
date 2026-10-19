export function diagnostic({ code, field, marketplace, status, message, currentValue = null, suggestedAction = null }) {
  if (!['PASS', 'WARNING', 'BLOCKING'].includes(status) || !code || !field || !marketplace || !message) {
    throw new Error('Diagnostica marketplace non valida.');
  }
  return { code, field, marketplace, status, severity: status === 'BLOCKING' ? 'error' : status === 'WARNING' ? 'warning' : 'info',
    message, currentValue, blocking: status === 'BLOCKING', suggestedAction };
}

export function summarizeDiagnostics(items) {
  const counts = { PASS: 0, WARNING: 0, BLOCKING: 0 };
  for (const item of items) counts[item.status]++;
  return { counts, canSend: counts.BLOCKING === 0 };
}

export function summarizeProductPreflights(rows) {
  const statuses = {};
  let ready = 0;
  let blocked = 0;
  let warnings = 0;
  for (const row of rows) {
    statuses[row.status] = (statuses[row.status] ?? 0) + 1;
    if (row.canSend) ready++;
    else blocked++;
    warnings += row.counts?.WARNING ?? 0;
  }
  return { total: rows.length, ready, blocked, warnings, statuses };
}

