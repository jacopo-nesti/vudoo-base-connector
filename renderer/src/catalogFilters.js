const searchableFields = ['title', 'sku', 'id', 'brand', 'category', 'mpn', 'size', 'color'];

export function hasDisplayValue(value) {
  return (typeof value === 'string' || typeof value === 'number') && String(value).trim() !== '';
}

export function variantDetails(product) {
  return [
    ['Formato / Dimensione', product?.size],
    ['Colore', product?.color],
  ].filter(([, value]) => hasDisplayValue(value));
}

export function isSelectableId(id) {
  return typeof id === 'string' && id.trim() !== '';
}

export function filterOptions(products, field) {
  const values = new Set();
  for (const product of products) {
    const value = product?.[field];
    if (typeof value === 'string' && value.trim()) values.add(value.trim());
  }
  return [...values].sort((left, right) => left.localeCompare(right, 'it', { sensitivity: 'base' }));
}

export function filterCatalogProducts(products, { searchQuery = '', categoryFilter = '', brandFilter = '' } = {}) {
  const query = searchQuery.trim().toLocaleLowerCase('it');
  const filtered = [];
  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    if (categoryFilter && (typeof product.category === 'string' ? product.category.trim() : '') !== categoryFilter) continue;
    if (brandFilter && (typeof product.brand === 'string' ? product.brand.trim() : '') !== brandFilter) continue;
    if (query && !searchableFields.some(field =>
      String(product[field] ?? '').toLocaleLowerCase('it').includes(query))) continue;
    filtered.push({ product, index });
  }
  return filtered;
}

export function toggleSelectedId(selectedIds, id) {
  if (!isSelectableId(id)) return selectedIds;
  return selectedIds.includes(id)
    ? selectedIds.filter(selectedId => selectedId !== id)
    : [...selectedIds, id];
}

export function selectFilteredIds(selectedIds, filteredProducts) {
  const next = new Set(selectedIds);
  for (const { product } of filteredProducts) {
    if (isSelectableId(product.id)) next.add(product.id);
  }
  return next.size === selectedIds.length ? selectedIds : [...next];
}

export function deselectFilteredIds(selectedIds, filteredProducts) {
  const visibleIds = new Set(filteredProducts
    .map(({ product }) => product.id).filter(isSelectableId));
  const next = selectedIds.filter(id => !visibleIds.has(id));
  return next.length === selectedIds.length ? selectedIds : next;
}

export function clearSelectedIds(selectedIds) {
  return selectedIds.length === 0 ? selectedIds : [];
}

export function getSelectedProducts(products, selectedIds) {
  const wanted = new Set(selectedIds);
  const byId = new Map();
  for (const product of products) {
    if (wanted.has(product.id) && !byId.has(product.id)) byId.set(product.id, product);
  }
  return selectedIds.map(id => byId.get(id)).filter(Boolean);
}

export function selectionChange(selectedIds, nextIds) {
  if (selectedIds.length === nextIds.length && selectedIds.every((id, index) => id === nextIds[index])) return null;
  return { selectedIds: nextIds, previousSelectedIds: [...selectedIds] };
}

export function undoSelectionChange(previousSelectedIds) {
  return previousSelectedIds == null ? null : {
    selectedIds: [...previousSelectedIds], previousSelectedIds: null,
  };
}

export function isSelectionUndoShortcut(event) {
  if (event.defaultPrevented || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey ||
      event.key?.toLowerCase() !== 'z') return false;
  const target = event.target;
  return !target?.isContentEditable && !target?.closest?.('input, select, textarea, [contenteditable]:not([contenteditable="false"])');
}

export function resetCatalogControls() {
  return { searchQuery: '', categoryFilter: '', brandFilter: '', selectedIds: [] };
}
