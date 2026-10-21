import { callBase } from '../baseApi.js';
import { token } from '../config.js';
import { normalizeOrder, parseOrderId } from './orderModel.js';
import { classifyOrderError, readOrderMetadata } from './baseOrderReader.js';

const PAGE_SIZE = 100;

export async function syncOrders(store, { call = callBase, hasToken = () => Boolean(token),
  onProgress = () => {}, now = () => new Date().toISOString() } = {}) {
  if (!hasToken()) throw Object.assign(new Error('missingToken'), { code: 'missingToken' });
  store.markAttempt(now());
  let created = 0; let updated = 0; let pages = 0; let cursor = 1;
  try {
    const { statuses, sources } = await readOrderMetadata(call);
    while (true) {
      const result = await call('getOrders', { id_from: cursor, get_unconfirmed_orders: true,
        include_discounts_data: true, include_custom_extra_fields: true });
      if (!Array.isArray(result?.orders) || result.orders.length > PAGE_SIZE) {
        throw Object.assign(new Error('invalidResponse'), { code: 'invalidResponse' });
      }
      if (!result.orders.length) break;
      const ids = result.orders.map(raw => parseOrderId(raw?.order_id));
      if (ids.some(id => !id || id < cursor) || new Set(ids).size !== ids.length) {
        throw Object.assign(new Error('invalidResponse'), { code: 'invalidResponse' });
      }
      const orders = result.orders.map((raw, index) => normalizeOrder(raw, ids[index], statuses, sources));
      const changed = store.upsertOrders(orders, now());
      created += changed.created; updated += changed.updated; pages++;
      onProgress({ created, updated, pages });
      if (result.orders.length < PAGE_SIZE) break;
      const next = Math.max(...ids) + 1;
      if (!Number.isSafeInteger(next) || next <= cursor) {
        throw Object.assign(new Error('invalidResponse'), { code: 'invalidResponse' });
      }
      cursor = next;
    }
    const completedAt = now();
    store.markSuccess(completedAt);
    return { created, updated, pages, completedAt };
  } catch (error) {
    store.markFailure(classifyOrderError(error));
    throw error;
  }
}
