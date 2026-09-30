export function toCatalogProductDto(product) {
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    brand: product.brand,
    price: product.price,
    category: product.product_type,
    mpn: product.mpn,
    size: product.size,
    color: product.color,
    itemGroupId: product.item_group_id,
    ean: product.ean,
    description: product.description,
    availability: product.availability,
    quantity: product.quantity,
    condition: product.condition,
  };
}
