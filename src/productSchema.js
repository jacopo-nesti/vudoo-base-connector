// Fields already present in the parsed Vudoo product or supported by this Base connector.
// Keep identity and supplier classification read-only; neither can be safely rewritten per item.
export const PRODUCT_FIELDS = Object.freeze([
  { key: 'id', label: 'ID Vudoo / SKU Base', section: 'Identità', type: 'text', editable: false, base: 'sku' },
  { key: 'sku', label: 'SKU supplier', section: 'Identità', type: 'text', editable: false },
  { key: 'ean', label: 'EAN / GTIN', section: 'Identità', type: 'ean', editable: true, base: 'ean' },
  { key: 'mpn', label: 'MPN', section: 'Identità', type: 'text', editable: true, base: 'text_fields.features.MPN' },
  { key: 'item_group_id', label: 'Gruppo varianti', section: 'Identità', type: 'text', editable: true, base: 'text_fields.features.Item Group ID' },
  { key: 'title', label: 'Titolo', section: 'Contenuto', type: 'text', editable: true, required: true, base: 'text_fields.name' },
  { key: 'description', label: 'Descrizione', section: 'Contenuto', type: 'longtext', editable: true, base: 'text_fields.description' },
  { key: 'description_extra1', label: 'Descrizione aggiuntiva 1', section: 'Contenuto', type: 'longtext', editable: true, base: 'text_fields.description_extra1' },
  { key: 'description_extra2', label: 'Descrizione aggiuntiva 2', section: 'Contenuto', type: 'longtext', editable: true, base: 'text_fields.description_extra2' },
  { key: 'description_extra3', label: 'Descrizione aggiuntiva 3', section: 'Contenuto', type: 'longtext', editable: true, base: 'text_fields.description_extra3' },
  { key: 'description_extra4', label: 'Descrizione aggiuntiva 4', section: 'Contenuto', type: 'longtext', editable: true, base: 'text_fields.description_extra4' },
  { key: 'bullet5', label: 'Descrizione aggiuntiva 5', section: 'Contenuto', type: 'longtext', editable: true, base: 'text_fields.extra_field:Additional description 5' },
  { key: 'price', label: 'Prezzo EUR', section: 'Commerciale', type: 'money', editable: true, required: true, base: 'prices[priceGroup]' },
  { key: 'sale_price', label: 'Prezzo scontato EUR', section: 'Commerciale', type: 'money', editable: true, base: 'text_fields.extra_field:Vudoo Sale Price' },
  { key: 'tax_rate', label: 'IVA %', section: 'Commerciale', type: 'tax', editable: true, base: 'tax_rate' },
  { key: 'quantity', label: 'Quantità', section: 'Commerciale', type: 'quantity', editable: true, base: 'stock[warehouse]' },
  { key: 'availability', label: 'Disponibilità supplier', section: 'Commerciale', type: 'text', editable: true },
  { key: 'condition', label: 'Condizione', section: 'Commerciale', type: 'text', editable: true, base: 'text_fields.features.Condition' },
  { key: 'brand', label: 'Brand / produttore', section: 'Marca e dettagli', type: 'text', editable: true, base: 'manufacturer_id (risolto)' },
  { key: 'size', label: 'Formato / taglia', section: 'Marca e dettagli', type: 'text', editable: true, base: 'text_fields.features.Size' },
  { key: 'color', label: 'Colore', section: 'Marca e dettagli', type: 'text', editable: true, base: 'text_fields.features.Color' },
  { key: 'product_type', label: 'Categoria supplier', section: 'Classificazione', type: 'text', editable: false },
  { key: 'canonical_category', label: 'Categoria canonica', section: 'Classificazione', type: 'text', editable: true, required: true, base: 'category_id (risolto)' },
  { key: 'image_link', label: 'Immagine principale', section: 'Media', type: 'url', editable: true, base: 'images[0]' },
  { key: 'additional_image_link', label: 'Immagini aggiuntive', section: 'Media', type: 'image-list', editable: true, base: 'images[1..15]' },
  { key: 'weight', label: 'Peso kg', section: 'Fisico', type: 'decimal', editable: true, base: 'weight' },
  { key: 'height', label: 'Altezza cm', section: 'Fisico', type: 'decimal', editable: true, base: 'height' },
  { key: 'width', label: 'Larghezza cm', section: 'Fisico', type: 'decimal', editable: true, base: 'width' },
  { key: 'length', label: 'Lunghezza cm', section: 'Fisico', type: 'decimal', editable: true, base: 'length' },
  { key: 'shipping_weight', label: 'Peso spedizione kg', section: 'Logistica', type: 'decimal', editable: true, base: 'text_fields.features.Shipping Weight (kg)' },
  { key: 'shipping.country', label: 'Paese spedizione supplier', section: 'Logistica', type: 'text', editable: true, base: 'text_fields.extra_field:Shipping Country' },
  { key: 'shipping.service', label: 'Servizio spedizione supplier', section: 'Logistica', type: 'text', editable: true, base: 'text_fields.extra_field:Shipping Service' },
  { key: 'shipping.price', label: 'Costo spedizione supplier EUR', section: 'Logistica', type: 'money', editable: true, base: 'text_fields.extra_field:Shipping Price' },
  { key: 'pickup_SLA', label: 'Tempo ritiro supplier', section: 'Logistica', type: 'text', editable: true, base: 'text_fields.features.Pickup SLA' },
  { key: 'link', label: 'URL prodotto supplier', section: 'Logistica', type: 'url', editable: true, base: 'text_fields.extra_field:Vudoo Product URL' },
]);

export const BASE_OVERRIDE_FIELDS = Object.freeze([
  { key: 'title', label: 'Titolo Base', type: 'text', base: 'text_fields.name' },
  { key: 'description', label: 'Descrizione Base', type: 'longtext', base: 'text_fields.description' },
  { key: 'image_link', label: 'Immagine principale Base', type: 'url', base: 'images[0]' },
  { key: 'tags', label: 'Tag Base', type: 'tags', base: 'tags' },
  { key: 'quantity', label: 'Stock', type: 'quantity', base: 'stock[warehouse]', bulkEditable: true },
  { key: 'price', label: 'Prezzo di vendita EUR', type: 'money', base: 'prices[priceGroup]', bulkEditable: true },
  { key: 'tax_rate', label: 'IVA %', type: 'tax', base: 'tax_rate', bulkEditable: true },
  { key: 'weight', label: 'Peso kg', type: 'decimal', base: 'weight', bulkEditable: true },
  { key: 'height', label: 'Altezza cm', type: 'decimal', base: 'height', bulkEditable: true },
  { key: 'width', label: 'Larghezza cm', type: 'decimal', base: 'width', bulkEditable: true },
  { key: 'length', label: 'Lunghezza cm', type: 'decimal', base: 'length', bulkEditable: true },
]);

export const BULK_BASE_FIELDS = Object.freeze(BASE_OVERRIDE_FIELDS.filter(field => field.bulkEditable));

export function validateBulkBaseInput(key, value) {
  const field = BULK_BASE_FIELDS.find(item => item.key === key);
  if (!field) throw new Error('Campo non disponibile per la modifica massiva Base.com.');
  if (value == null || String(value).trim() === '') throw new Error(`${field.label}: inserisci un valore.`);
  if (key === 'quantity' && typeof value === 'string' && !/^\d+$/.test(value.trim())) {
    throw new Error('Stock: inserisci un numero intero non negativo.');
  }
  const normalized = validateFieldInput(key, value, 'base');
  if (key === 'price' && normalized <= 0) throw new Error('Prezzo di vendita EUR: inserisci un valore maggiore di zero.');
  return normalized;
}

export const FIELD_BY_KEY = new Map(PRODUCT_FIELDS.map(field => [field.key, field]));
export const BASE_FIELD_BY_KEY = new Map(BASE_OVERRIDE_FIELDS.map(field => [field.key, field]));
export const getField = (value, key) => key.split('.').reduce((part, name) => part?.[name], value);
export function setField(value, key, nextValue) {
  const [head, tail] = key.split('.');
  return tail ? { ...value, [head]: { ...value?.[head], [tail]: nextValue } } : { ...value, [head]: nextValue };
}
export const hasValue = value => value != null && value !== '' && (!Array.isArray(value) || value.length > 0);

export function validateFieldInput(key, value, marketplace = 'manual') {
  const field = marketplace === 'base' ? BASE_FIELD_BY_KEY.get(key) : FIELD_BY_KEY.get(key);
  if (!field || (marketplace === 'manual' && !field.editable)) throw new Error(`Campo non modificabile: ${key}.`);
  if (field.type === 'tags' || field.type === 'image-list') {
    const values = typeof value === 'string' ? value.split(/\r?\n|,/).map(v => v.trim()).filter(Boolean) : value;
    if (!Array.isArray(values) || values.length > (field.type === 'tags' ? 50 : 15) ||
        values.some(v => typeof v !== 'string' || !v.trim() || v.length > 1000)) throw new Error(`${field.label}: elenco non valido.`);
    if (field.type === 'image-list' && values.some(v => !isWebUrl(v))) throw new Error(`${field.label}: URL HTTP/HTTPS non valido.`);
    return values;
  }
  if (['money', 'decimal', 'quantity', 'tax'].includes(field.type)) {
    if (value === '' || value == null) {
      if (field.required) throw new Error(`${field.label} obbligatorio.`);
      return null;
    }
    const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
    if (!Number.isFinite(number) || (field.type === 'quantity' && !Number.isSafeInteger(number)) ||
        (field.type === 'tax' ? !(number >= 0 && number <= 100) && ![-1, -0.02, -0.03].includes(number) : number < 0)) {
      throw new Error(`${field.label}: valore numerico non valido.`);
    }
    return number;
  }
  if (typeof value !== 'string' || value.length > (field.type === 'longtext' ? 30000 : 1000)) throw new Error(`${field.label}: testo non valido.`);
  if (field.required && !value.trim()) throw new Error(`${field.label} obbligatorio.`);
  if (field.type === 'ean' && value && !/^\d{8,14}$/.test(value)) throw new Error('EAN: usare da 8 a 14 cifre, senza spazi.');
  if (field.type === 'url' && value && !isWebUrl(value)) throw new Error(`${field.label}: URL HTTP/HTTPS non valido.`);
  return value;
}

function isWebUrl(value) {
  if (!URL.canParse(value)) return false;
  return ['http:', 'https:'].includes(new URL(value).protocol);
}
