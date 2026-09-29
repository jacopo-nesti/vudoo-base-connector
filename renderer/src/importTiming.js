export function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return 'non disponibile';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60000) return `${(Math.round(durationMs / 100) / 10).toFixed(1).replace('.', ',')} s`;
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

export function estimateImportDurationMs(productCount, requestsPerMinute,
  { dryRun = false, bulkLookupThreshold, detailsChunkSize } = {}) {
  if (!Number.isSafeInteger(productCount) || productCount <= 0 ||
      !Number.isSafeInteger(requestsPerMinute) || requestsPerMinute <= 0 ||
      !Number.isSafeInteger(bulkLookupThreshold) || bulkLookupThreshold <= 0 ||
      !Number.isSafeInteger(detailsChunkSize) || detailsChunkSize <= 0) return null;
  // One Base list page is assumed; the real inventory may require more pages.
  const readCalls = productCount >= bulkLookupThreshold
    ? 1 + Math.ceil(productCount / detailsChunkSize)
    : productCount * 2;
  return Math.ceil((readCalls + (dryRun ? 0 : productCount)) * 60000 / requestsPerMinute);
}
