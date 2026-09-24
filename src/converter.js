import { XMLParser, XMLValidator } from 'fast-xml-parser';

export function formatProductTitle(title, ...parts) {
  if (typeof title !== 'string') return title;
  const values = parts
    .filter(value => typeof value === 'string' && value.trim() !== '')
    .map(value => value.trim());
  if (!values.length) return title;
  const suffix = ` - ${values.join(' - ')}`;
  return title.endsWith(suffix) ? title : title + suffix;
}

export function parseCatalog(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Catalogo XML vuoto.');
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Catalogo XML: DOCTYPE/HTML non supportato.');
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`XML non valido: ${validation.err.msg} (riga ${validation.err.line})`);
  }

  const parser = new XMLParser({
    parseTagValue: false,
    trimValues: false,
    ignoreAttributes: false,
    transformTagName: name => name.startsWith('g:') ? name.slice(2) : name,
    isArray: (name, path) => path === 'rss.channel.item',
    // Ignora solo l'indentazione tra elementi, mai gli spazi nei valori dei campi.
    tagValueProcessor: (name, value, path, attributes, isLeaf) =>
      !isLeaf && value.trim() === '' ? '' : value,
  });
  const channel = parser.parse(xml).rss?.channel;
  const products = channel?.item;
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('Catalogo vuoto o struttura non valida: nessun item in rss.channel.item.');
  }
  if (products.some(product => !product || typeof product !== 'object' || Array.isArray(product))) {
    throw new Error('Catalogo XML: item non valido.');
  }
  return {
    channelTitle: typeof channel.title === 'string' ? channel.title : undefined,
    products,
  };
}

export function parseCatalogXml(xml) {
  return parseCatalog(xml).products;
}
