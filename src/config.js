export const token = process.env.BASE_API_TOKEN?.trim();
export const inventoryId = process.env.BASE_INVENTORY_ID?.trim();
export const warehouseId = process.env.BASE_WAREHOUSE_ID?.trim();
export const testMode = process.env.TEST_MODE ?? 'true';
export const dryRun = process.env.DRY_RUN ?? 'true';

export function parseUnmappedCategoryPolicy(raw) {
  if (raw == null || raw.trim() === '') return 'block';
  const value = raw.trim().toLowerCase();
  if (!['block', 'skip'].includes(value)) {
    throw new Error('UNMAPPED_CATEGORY_POLICY deve essere "block" oppure "skip".');
  }
  return value;
}

export function getUnmappedCategoryPolicy() {
  return parseUnmappedCategoryPolicy(process.env.UNMAPPED_CATEGORY_POLICY);
}

export function getBaseApiRequestsPerMinute() {
  const raw = process.env.BASE_API_REQUESTS_PER_MINUTE;
  if (raw == null || raw.trim() === '') return 100;
  const value = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('BASE_API_REQUESTS_PER_MINUTE deve essere un intero maggiore di zero.');
  }
  return value;
}
