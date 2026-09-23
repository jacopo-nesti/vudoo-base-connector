import { readFile, writeFile } from 'node:fs/promises';
import { parseCatalogXml, formatProductTitle } from '../../src/converter.js';

const fields = [
  'title', 'brand', 'condition', 'description', 'id', 'image_link', 'link',
  'ean', 'mpn', 'price', 'sale_price', 'product_type', 'weight',
  'shipping_weight', 'availability', 'pickup_SLA', 'tax_rate', 'shipping',
];
const shippingFields = ['country', 'service', 'price'];

function completeFields(object, expected, label) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) {
    throw new Error(`${label}: struttura XML inattesa, conversione interrotta.`);
  }
  for (const field of Object.keys(object)) {
    if (!expected.includes(field)) {
      console.warn(`WARNING ${label}: campo non previsto "${field}", conservato nel JSON.`);
    }
  }
  for (const field of expected) {
    if (object[field] === undefined) object[field] = null;
  }
}

export async function convertXmlToJson() {
  const xml = await readFile(new URL('../../VUDOO.xml', import.meta.url), 'utf8');
  const products = parseCatalogXml(xml);
  const itemCount = products.length;
  for (const product of products) {
    completeFields(product, fields, `item ${product.id ?? '(id assente)'}`);
    product.tax_rate = '22';
    product.mpn = product.id;
    product.title = formatProductTitle(product.title, product.brand);
    if (product.shipping !== null) {
      completeFields(product.shipping, shippingFields, `shipping di ${product.id}`);
    }
  }

  const output = new URL('../../real_products.json', import.meta.url);
  await writeFile(output, JSON.stringify(products, null, 2) + '\n', 'utf8');
  const saved = JSON.parse(await readFile(output, 'utf8'));
  if (saved.length !== itemCount) throw new Error('Numero prodotti JSON diverso dagli item XML.');
  console.log(`XML: ${itemCount} item\nJSON: ${saved.length} prodotti\nFile creato: real_products.json`);
  console.log(`EAN mancanti (null): ${saved.filter(product => product.ean === null).length}`);
}
