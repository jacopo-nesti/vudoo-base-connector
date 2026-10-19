import { callBase } from '../baseApi.js';
import { token } from '../config.js';
import { normalizeOrder, parseOrderId } from './orderModel.js';

function orderError(code) { return Object.assign(new Error(code), { code }); }

export function classifyOrderError(error) {
  if (['invalidId', 'missingToken', 'notFound', 'invalidResponse'].includes(error?.code)) return error.code;
  const message = String(error?.message || '');
  if (/ERROR_INVALID_TOKEN|ERROR_BLOCKED_TOKEN|invalid.token|unauthorized|HTTP 401/i.test(message)) return 'authentication';
  if (/ERROR_NO_PERMISSION|access.denied|permission|HTTP 403/i.test(message)) return 'permission';
  if (/timeout|timed out|aborted/i.test(message)) return 'timeout';
  if (/risposta JSON|risposta API non valida/i.test(message)) return 'invalidResponse';
  if (/rete|network|fetch failed/i.test(message)) return 'network';
  return 'apiError';
}

export async function readBaseOrder(input, { call = callBase, hasToken = () => Boolean(token) } = {}) {
  const orderId = parseOrderId(input);
  if (!orderId) throw orderError('invalidId');
  if (!hasToken()) throw orderError('missingToken');
  const response = await call('getOrders', { order_id: orderId, get_unconfirmed_orders: true });
  if (!Array.isArray(response?.orders)) throw orderError('invalidResponse');
  const matches = response.orders.filter(item => parseOrderId(item?.order_id) === orderId);
  if (matches.length === 0 && response.orders.length === 0) throw orderError('notFound');
  if (matches.length !== 1 || response.orders.length !== 1) throw orderError('invalidResponse');
  let statuses = [];
  try {
    const statusResponse = await call('getOrderStatusList', {});
    if (Array.isArray(statusResponse?.statuses)) statuses = statusResponse.statuses;
  } catch { /* The order remains usable with its numeric status ID. */ }
  return normalizeOrder(matches[0], orderId, statuses);
}
