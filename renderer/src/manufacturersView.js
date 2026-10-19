export function filterManufacturers(manufacturers, query) {
  const needle = String(query).trim().toLocaleLowerCase('it');
  return needle ? manufacturers.filter(item => `${item.name} ${item.catalogCode}`.toLocaleLowerCase('it').includes(needle))
    : manufacturers;
}

export function recentManufacturers(manufacturers, limit = 4) {
  return manufacturers.filter(item => item.lastLoadedAt && Number.isFinite(Date.parse(item.lastLoadedAt)))
    .sort((a, b) => Date.parse(b.lastLoadedAt) - Date.parse(a.lastLoadedAt) ||
      a.name.localeCompare(b.name, 'it') || a.catalogCode.localeCompare(b.catalogCode))
    .slice(0, limit);
}
