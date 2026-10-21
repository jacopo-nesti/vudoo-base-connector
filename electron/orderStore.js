import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseOrderId } from '../src/orders/orderModel.js';

export const ORDERS_DB_FILE_NAME = 'vudoo-orders.sqlite';

export function openOrderStore(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  try {
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) throw new Error('Unsupported orders database schema');
    db.exec(`CREATE TABLE IF NOT EXISTS orders (
      base_order_id INTEGER PRIMARY KEY, external_order_id TEXT, date_add INTEGER,
      order_source TEXT, order_source_id TEXT, source_name TEXT, order_status_id TEXT,
      status_name TEXT, display_name TEXT, email TEXT, delivery_country TEXT,
      currency TEXT, payment_done REAL, quality_status TEXT NOT NULL,
      detail_json TEXT NOT NULL, fetched_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      base_order_id INTEGER NOT NULL REFERENCES orders(base_order_id) ON DELETE CASCADE,
      position INTEGER NOT NULL, order_product_id TEXT, sku TEXT, ean TEXT, name TEXT,
      item_json TEXT NOT NULL, PRIMARY KEY(base_order_id, position)
    );
    CREATE TABLE IF NOT EXISTS order_sync_state (
      id INTEGER PRIMARY KEY CHECK(id = 1), last_attempt_at TEXT,
      last_success_at TEXT, last_error_code TEXT
    );
    INSERT OR IGNORE INTO order_sync_state(id) VALUES (1);
    CREATE INDEX IF NOT EXISTS orders_date_idx ON orders(date_add DESC, base_order_id DESC);
    CREATE INDEX IF NOT EXISTS orders_source_idx ON orders(order_source);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(order_status_id);
    CREATE INDEX IF NOT EXISTS order_items_lookup_idx ON order_items(base_order_id, sku, ean);
    PRAGMA user_version = 1`);
  } catch (error) { db.close(); throw error; }

  const exists = db.prepare(`SELECT order_source, order_source_id, source_name,
    order_status_id, status_name FROM orders WHERE base_order_id = ?`);
  const upsert = db.prepare(`INSERT INTO orders (
    base_order_id, external_order_id, date_add, order_source, order_source_id,
    source_name, order_status_id, status_name, display_name, email,
    delivery_country, currency, payment_done, quality_status, detail_json, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(base_order_id) DO UPDATE SET
    external_order_id=excluded.external_order_id, date_add=excluded.date_add,
    order_source=excluded.order_source, order_source_id=excluded.order_source_id,
    source_name=excluded.source_name, order_status_id=excluded.order_status_id,
    status_name=excluded.status_name, display_name=excluded.display_name,
    email=excluded.email, delivery_country=excluded.delivery_country,
    currency=excluded.currency, payment_done=excluded.payment_done,
    quality_status=excluded.quality_status, detail_json=excluded.detail_json,
    fetched_at=excluded.fetched_at`);
  const removeItems = db.prepare('DELETE FROM order_items WHERE base_order_id = ?');
  const insertItem = db.prepare(`INSERT INTO order_items
    (base_order_id, position, order_product_id, sku, ean, name, item_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const getOrder = db.prepare('SELECT detail_json, fetched_at FROM orders WHERE base_order_id = ?');
  const getItems = db.prepare('SELECT item_json FROM order_items WHERE base_order_id = ? ORDER BY position');
  const syncState = db.prepare('SELECT last_attempt_at, last_success_at, last_error_code FROM order_sync_state WHERE id = 1');

  return {
    upsertOrders(orders, fetchedAt = new Date().toISOString()) {
      if (!Array.isArray(orders) || !Number.isFinite(Date.parse(fetchedAt))) throw new Error('Invalid order batch');
      let created = 0; let updated = 0;
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const order of orders) {
          const id = parseOrderId(order?.identity?.order_id);
          if (!id || !Array.isArray(order.products)) throw new Error('Invalid normalized order');
          const previous = exists.get(id);
          if (previous) updated++; else created++;
          const sourceName = order.sourceName ?? (previous?.order_source === order.identity.order_source &&
            previous?.order_source_id === String(order.identity.order_source_id) ? previous.source_name : null);
          const statusName = order.statusName ?? (previous?.order_status_id === String(order.identity.order_status_id)
            ? previous.status_name : null);
          const { products, ...detail } = { ...order, sourceName, statusName };
          const paid = Number(order.economics.payment_done);
          upsert.run(id, order.identity.external_order_id, order.identity.date_add,
            order.identity.order_source, order.identity.order_source_id == null ? null : String(order.identity.order_source_id),
            sourceName, order.identity.order_status_id == null ? null : String(order.identity.order_status_id),
            statusName, order.customer.displayName, order.customer.email,
            order.shipping.delivery_country, order.economics.currency,
            order.economics.payment_done == null || !Number.isFinite(paid) ? null : paid,
            order.quality.status, JSON.stringify(detail), fetchedAt);
          removeItems.run(id);
          for (const [position, item] of products.entries()) {
            insertItem.run(id, position, item.order_product_id == null ? null : String(item.order_product_id),
              item.sku, item.ean, item.name, JSON.stringify(item));
          }
        }
        db.exec('COMMIT');
        return { created, updated };
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    get(orderId) {
      const id = parseOrderId(orderId);
      if (!id) return null;
      const row = getOrder.get(id);
      if (!row) return null;
      return { ...JSON.parse(row.detail_json), products: getItems.all(id).map(item => JSON.parse(item.item_json)),
        fetchedAt: row.fetched_at };
    },
    list(filters = {}) {
      const query = String(filters.query || '').trim().slice(0, 120);
      const clauses = []; const params = [];
      if (query) {
        clauses.push(`(instr(lower(CAST(o.base_order_id AS TEXT)), lower(?)) > 0 OR
          instr(lower(coalesce(o.external_order_id,'')), lower(?)) > 0 OR
          instr(lower(coalesce(o.display_name,'')), lower(?)) > 0 OR
          instr(lower(coalesce(o.email,'')), lower(?)) > 0 OR EXISTS (
            SELECT 1 FROM order_items i WHERE i.base_order_id = o.base_order_id AND
            (instr(lower(coalesce(i.sku,'')), lower(?)) > 0 OR
             instr(lower(coalesce(i.ean,'')), lower(?)) > 0 OR
             instr(lower(coalesce(i.name,'')), lower(?)) > 0)))`);
        params.push(...Array(7).fill(query));
      }
      if (filters.source) { clauses.push('o.order_source = ?'); params.push(String(filters.source)); }
      if (filters.statusId) { clauses.push('o.order_status_id = ?'); params.push(String(filters.statusId)); }
      if (filters.quality) { clauses.push('o.quality_status = ?'); params.push(String(filters.quality)); }
      if (filters.payment === 'recorded') clauses.push('o.payment_done > 0');
      if (filters.payment === 'zero') clauses.push('o.payment_done = 0');
      if (filters.payment === 'unknown') clauses.push('o.payment_done IS NULL');
      if (Number.isSafeInteger(filters.dateFrom)) { clauses.push('o.date_add >= ?'); params.push(filters.dateFrom); }
      if (Number.isSafeInteger(filters.dateTo)) { clauses.push('o.date_add < ?'); params.push(filters.dateTo); }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = Math.max(1, Math.min(100, Number.isSafeInteger(filters.limit) ? filters.limit : 50));
      const offset = Math.max(0, Number.isSafeInteger(filters.offset) ? filters.offset : 0);
      const total = db.prepare(`SELECT count(*) AS count FROM orders o ${where}`).get(...params).count;
      const rows = db.prepare(`SELECT o.base_order_id AS baseOrderId, o.external_order_id AS externalOrderId,
        o.date_add AS dateAdd, o.order_source AS source, o.order_source_id AS sourceId,
        o.source_name AS sourceName, o.order_status_id AS statusId, o.status_name AS statusName,
        o.display_name AS displayName, o.email, o.delivery_country AS deliveryCountry,
        o.currency, o.payment_done AS paymentDone, o.quality_status AS qualityStatus,
        o.fetched_at AS fetchedAt
        FROM orders o ${where} ORDER BY o.date_add DESC, o.base_order_id DESC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset);
      return { rows, total, limit, offset };
    },
    facets() {
      return {
        sources: db.prepare('SELECT DISTINCT order_source AS value FROM orders WHERE order_source IS NOT NULL ORDER BY value').all(),
        statuses: db.prepare('SELECT DISTINCT order_status_id AS value, status_name AS name FROM orders WHERE order_status_id IS NOT NULL ORDER BY name, value').all(),
      };
    },
    syncState() {
      const row = syncState.get();
      return { lastAttemptAt: row.last_attempt_at, lastSuccessAt: row.last_success_at,
        lastErrorCode: row.last_error_code };
    },
    markAttempt(at = new Date().toISOString()) {
      db.prepare('UPDATE order_sync_state SET last_attempt_at = ?, last_error_code = NULL WHERE id = 1').run(at);
    },
    markSuccess(at = new Date().toISOString()) {
      db.prepare('UPDATE order_sync_state SET last_success_at = ?, last_error_code = NULL WHERE id = 1').run(at);
    },
    markFailure(code) {
      db.prepare('UPDATE order_sync_state SET last_error_code = ? WHERE id = 1').run(code);
    },
    close() { db.close(); },
  };
}
