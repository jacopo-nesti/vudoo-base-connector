import { token } from './config.js';
import { getProducts } from './products.js';
import { getManufacturerMap, ensureManufacturer } from './manufacturers.js';
import { log } from './logger.js';

export async function syncManufacturers(sourceProducts) {
  if (!token) throw new Error('BASE_API_TOKEN mancante nel file .env');
  const manufacturers = await getManufacturerMap();
  const products = sourceProducts ?? await getProducts();
  for (const product of products) {
    if (typeof product?.brand !== 'string' || !product.brand.trim()) continue;
    const id = await ensureManufacturer(product.brand, manufacturers);
    if (id != null) log(`Produttore: ${product.brand} (ID: ${id})`);
  }
}
