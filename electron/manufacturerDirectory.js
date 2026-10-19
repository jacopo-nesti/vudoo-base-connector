import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const MANUFACTURERS_DB_FILE_NAME = 'vudoo-manufacturers.sqlite';

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 160) {
    throw Object.assign(new Error(`${field} non valido.`), { code: 'invalidValue', field });
  }
  return value.trim().replace(/\s+/g, ' ');
}

export function suggestedManufacturerName(channelTitle, catalogCode) {
  if (typeof channelTitle !== 'string') return null;
  const name = channelTitle.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 160 || name === String(catalogCode).trim() || /^\d+$/.test(name) ||
      /^(?:catalogo|feed|prodotti|vudoo|no name|senza nome)(?:\b|$)/i.test(name)) return null;
  return name;
}

export function openManufacturerDirectory(filePath) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new DatabaseSync(filePath);
  try {
    database.exec(`CREATE TABLE IF NOT EXISTS manufacturers (
      id INTEGER PRIMARY KEY,
      catalog_code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      base_inventory_id INTEGER NULL,
      last_product_count INTEGER NULL,
      last_loaded_at TEXT NULL
    )`);
    const columns = new Set(database.prepare('PRAGMA table_info(manufacturers)').all().map(column => column.name));
    for (const [name, type] of [['base_inventory_id', 'INTEGER'], ['last_product_count', 'INTEGER'], ['last_loaded_at', 'TEXT']]) {
      if (!columns.has(name)) database.exec(`ALTER TABLE manufacturers ADD COLUMN ${name} ${type} NULL`);
    }
  } catch (error) {
    database.close();
    throw error;
  }
  const byCode = database.prepare('SELECT id, catalog_code, name, base_inventory_id, last_product_count, last_loaded_at FROM manufacturers WHERE catalog_code = ?');
  const insert = database.prepare('INSERT OR IGNORE INTO manufacturers (catalog_code, name) VALUES (?, ?)');
  const search = database.prepare(`SELECT id, catalog_code, name, base_inventory_id FROM manufacturers
    WHERE instr(lower(name), lower(?)) > 0 OR instr(catalog_code, ?) > 0
    ORDER BY CASE WHEN catalog_code = ? THEN 0 ELSE 1 END, name COLLATE NOCASE LIMIT 50`);
  const list = database.prepare(`SELECT id, catalog_code, name, base_inventory_id, last_product_count, last_loaded_at
    FROM manufacturers ORDER BY last_loaded_at IS NULL, last_loaded_at DESC, name COLLATE NOCASE, catalog_code`);
  const recordLoad = database.prepare('UPDATE manufacturers SET last_product_count = ?, last_loaded_at = ? WHERE catalog_code = ?');
  return {
    getByCode(catalogCode) {
      return byCode.get(requiredText(catalogCode, 'catalogCode')) ?? null;
    },
    save(catalogCode, name) {
      const code = requiredText(catalogCode, 'catalogCode');
      const validName = requiredText(name, 'name');
      const result = insert.run(code, validName);
      return { manufacturer: byCode.get(code), created: result.changes === 1 };
    },
    setBaseInventoryId(catalogCode, inventoryId) {
      const code = requiredText(catalogCode, 'catalogCode');
      if (!Number.isSafeInteger(inventoryId) || inventoryId <= 0) {
        throw Object.assign(new Error('baseInventoryId non valido.'), { code: 'invalidValue', field: 'baseInventoryId' });
      }
      const result = database.prepare('UPDATE manufacturers SET base_inventory_id = ? WHERE catalog_code = ?').run(inventoryId, code);
      if (result.changes !== 1) throw new Error('Produttore non presente nell’anagrafica locale.');
      return byCode.get(code);
    },
    search(query) {
      if (typeof query !== 'string') throw Object.assign(new Error('Ricerca non valida.'), { code: 'invalidValue', field: 'query' });
      const term = query.trim().slice(0, 160);
      return term ? search.all(term, term, term) : [];
    },
    list() {
      return list.all().map(row => ({ id: row.id, catalogCode: row.catalog_code, name: row.name,
        baseInventoryId: row.base_inventory_id, lastProductCount: row.last_product_count,
        lastLoadedAt: row.last_loaded_at }));
    },
    recordLoadedCatalog(catalogCode, productCount, loadedAt = new Date().toISOString()) {
      const code = requiredText(catalogCode, 'catalogCode');
      if (!Number.isSafeInteger(productCount) || productCount < 0 || typeof loadedAt !== 'string' ||
          !Number.isFinite(Date.parse(loadedAt))) throw new Error('Statistiche catalogo non valide.');
      const result = recordLoad.run(productCount, loadedAt, code);
      if (result.changes !== 1) throw new Error('Produttore non presente nell’anagrafica locale.');
      return byCode.get(code);
    },
    close() { database.close(); },
  };
}

export function registerLoadedCatalog(directory, catalogCode, channelTitle, productCount = null, loadedAt) {
  const existing = directory.getByCode(catalogCode);
  if (existing) return { status: 'known', manufacturer: productCount === null ? existing
    : directory.recordLoadedCatalog(catalogCode, productCount, loadedAt) };
  const name = suggestedManufacturerName(channelTitle, catalogCode);
  if (!name) return { status: 'needs_name', manufacturer: null };
  const saved = directory.save(catalogCode, name);
  return { status: saved.created ? 'auto_saved' : 'known', manufacturer: productCount === null ? saved.manufacturer
    : directory.recordLoadedCatalog(catalogCode, productCount, loadedAt) };
}
