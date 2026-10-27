export function prepareBaseCategoryMove(categories, sourceId, parentId) {
  const byId = new Map(categories.map(category => [category.categoryId, category]));
  const source = byId.get(sourceId);
  const parent = parentId === 0 ? null : byId.get(parentId);
  if (!source || (parentId !== 0 && !parent)) return null;
  if (source.parentId === parentId || sourceId === parentId) return null;
  let current = parent;
  while (current) {
    if (current.categoryId === sourceId) return null;
    current = byId.get(current.parentId);
  }
  return { categoryId: sourceId, name: source.name, fromPath: source.path,
    parentId, toPath: parent?.path ?? [], currentParentId: source.parentId };
}
