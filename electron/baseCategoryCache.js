export function createBaseCategoryCache({ read, buildIndex }) {
  let snapshot = null;
  let pending = null;
  let revision = 0;
  function replace(categories) {
    const index = buildIndex(categories.map(row => ({
      category_id: row.categoryId, parent_id: row.parentId, name: row.name,
    })));
    snapshot = { categories, index, categoriesLoaded: true, categoriesVerified: true,
      lastCategoriesRefresh: new Date().toISOString() };
    revision++;
    return snapshot;
  }
  async function ensure({ force = false } = {}) {
    if (pending) return pending;
    if (snapshot && !force) return snapshot;
    const startedAtRevision = revision;
    pending = read().then(categories => revision === startedAtRevision
      ? replace(categories) : snapshot).finally(() => { pending = null; });
    return pending;
  }
  return { ensure, replace, current: () => snapshot };
}
