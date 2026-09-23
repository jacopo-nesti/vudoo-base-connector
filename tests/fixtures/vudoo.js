export const itemXml = `<item>
  <title>Prodotto test</title><description>Descrizione è Unicode ✨ 💧</description>
  <link>https://example.com/product</link>
  <g:id>389578</g:id><g:sku>HKZDVHCW</g:sku><g:size>3000 ml.</g:size><g:color>Bottone Oro</g:color><g:brand>Marca</g:brand>
  <g:price>3.20 EUR</g:price><g:sale_price>2.90 EUR</g:sale_price>
  <g:tax_rate>10</g:tax_rate><g:quantity>234</g:quantity><g:availability>in stock</g:availability>
  <g:weight>0.5 kg</g:weight><g:shipping_weight>0.7 kg</g:shipping_weight>
  <conf_alt>10</conf_alt><conf_lar>20</conf_lar><conf_lun>30</conf_lun>
  <g:product_type>Vini, Gastronomia &gt; Birra &gt; Birra Artigianale</g:product_type>
  <g:image_link>https://example.com/main.jpg</g:image_link>
  <g:additional_image_link>https://example.com/extra1.jpg</g:additional_image_link>
  <g:additional_image_link>https://example.com/extra2.jpg</g:additional_image_link>
  <g:mpn>MANUFACTURER-PART</g:mpn><g:condition>new</g:condition>
  <g:pickup_SLA>same day</g:pickup_SLA><g:item_group_id>GROUP-A</g:item_group_id>
  <bullet1>Uno</bullet1><bullet2>Due</bullet2><bullet3>Tre</bullet3><bullet4>Quattro</bullet4><bullet5>Cinque</bullet5>
  <g:shipping><g:country>IT</g:country><g:service>Standard</g:service><g:price>8.40 EUR</g:price></g:shipping>
</item>`;

export function catalogXml(items = itemXml) {
  return `<rss xmlns:g="http://base.google.com/ns/1.0"><channel>${items}</channel></rss>`;
}

export const extraFields = [
  'Vudoo Sale Price', 'Vudoo Product URL', 'Vudoo Original Title', 'Shipping Country',
  'Shipping Service', 'Shipping Price', 'Additional description 5',
].map((name, index) => ({
  extra_field_id: 101 + index, name, kind: 1,
  editor_type: ['Vudoo Sale Price', 'Shipping Price'].includes(name) ? 'number' : 'text',
}));

export const parameters = ['MPN', 'Condition', 'Pickup SLA', 'Item Group ID', 'Shipping Weight (kg)', 'Vudoo SKU', 'Size', 'Color']
  .map((name, index) => ({ parameter_key: `test_parameter_${index}`, type: name === 'Shipping Weight (kg)' ? 'number' : 'text', name_translations: { en: name } }));

export const parameterGroups = [{ name: 'Vudoo / Marketplace', group_id: 1, parameter_keys: parameters.map(parameter => parameter.parameter_key) }];
