export const SAFE_COMMANDS = Object.freeze([
  { id: 'search', label: 'Cerca prodotto', hint: 'Nome, SKU, EAN, ID Vudoo' },
  { id: 'base-catalog', label: 'Prodotti', hint: 'Catalogo Vudoo' },
  { id: 'system-problems', label: 'Problemi', hint: 'Apri pagina' },
  { id: 'base-overview', label: 'Panoramica Base.com', hint: 'Apri pagina' },
  { id: 'base-operations', label: 'Import / Operazioni', hint: 'Base.com' },
  { id: 'base-diagnostics', label: 'Diagnostica Base.com', hint: 'Apri pagina' },
  { id: 'system-settings', label: 'Impostazioni', hint: 'Catalogo condiviso' },
  { id: 'catalog', label: 'Cambia catalogo', hint: 'Apri selettore' },
]);
export function filterCommands(query) {
  const needle = String(query || '').trim().toLocaleLowerCase('it');
  return SAFE_COMMANDS.filter(command => `${command.label} ${command.hint}`.toLocaleLowerCase('it').includes(needle));
}
export function nextCommandIndex(index, key, length) {
  if (!length) return 0;
  return key === 'ArrowUp' ? (index - 1 + length) % length : (index + 1) % length;
}
