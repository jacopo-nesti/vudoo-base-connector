export function buildBaseCategoryTree(categories) {
  const byId = new Map(categories.map(category => [category.categoryId, { ...category, children: [] }]));
  const roots = [];
  for (const entry of byId.values()) {
    const parent = byId.get(entry.parentId);
    if (parent) parent.children.push(entry);
    else roots.push(entry);
  }
  const sort = nodes => { nodes.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    nodes.forEach(node => sort(node.children)); };
  sort(roots);
  return roots;
}

export function searchBaseCategories(categories, query) {
  const normalized = String(query).trim().toLocaleLowerCase('it');
  if (!normalized) return [];
  return categories.filter(category =>
    `${category.path.join(' > ')} ${category.categoryId}`.toLocaleLowerCase('it').includes(normalized))
    .slice(0, 100);
}
