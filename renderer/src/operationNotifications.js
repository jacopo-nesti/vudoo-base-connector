export const NOTIFICATION_KEY = 'vudoo.notifications.v1';
export const NOTIFICATION_EVENT = 'vudoo:operation';
// History accepts event codes only, never backend responses or free-form messages.
export const OPERATION_EVENTS = Object.freeze({
  catalogLoaded: { type: 'success', title: 'Catalogo caricato', description: 'Prodotti Vudoo disponibili nel Product Manager.', page: 'base-catalog' },
  catalogFailed: { type: 'error', title: 'Catalogo non caricato', description: 'Controlla il catalogo e riprova dal selettore.', page: 'system-settings' },
  settingsSaved: { type: 'success', title: 'Impostazioni salvate', description: 'Consulta le impostazioni per eventuali richieste di riavvio.', page: 'system-settings' },
  diagnosticsDone: { type: 'success', title: 'Diagnostica completata', description: 'Collegamento con il motore locale riuscito.', page: 'system-diagnostics' },
  diagnosticsFailed: { type: 'error', title: 'Collegamento da verificare', description: 'Ripeti la diagnostica del sistema.', page: 'system-diagnostics' },
});
export function normalizeNotifications(input) {
  if (input?.schemaVersion !== 1 || !Array.isArray(input.items)) return [];
  return input.items.filter(item => item && Object.hasOwn(OPERATION_EVENTS, item.event) && typeof item.id === 'string' && /^[\w-]{1,80}$/.test(item.id) && Number.isFinite(item.timestamp) && item.timestamp > 0 && item.timestamp <= 8640000000000000)
    .slice(0, 60).map(({ id, event, timestamp, read }) => ({ id, event, timestamp, read: read === true }));
}
export function readNotifications(storage) {
  try { return normalizeNotifications(JSON.parse(storage.getItem(NOTIFICATION_KEY))); } catch { return []; }
}
export function writeNotifications(storage, items) {
  try { storage.setItem(NOTIFICATION_KEY, JSON.stringify({ schemaVersion: 1, items: normalizeNotifications({ schemaVersion: 1, items }) })); return true; } catch { return false; }
}
export function addNotification(items, event, timestamp = Date.now()) {
  if (!Object.hasOwn(OPERATION_EVENTS, event)) return items;
  return [{ id: `${timestamp}-${Math.random().toString(36).slice(2, 10)}`, event, timestamp, read: false }, ...items].slice(0, 60);
}
export function clearNoncritical(items) { return items.filter(item => OPERATION_EVENTS[item.event]?.type === 'error'); }
export function notifyOperation(event) {
  if (Object.hasOwn(OPERATION_EVENTS, event) && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: event }));
}
