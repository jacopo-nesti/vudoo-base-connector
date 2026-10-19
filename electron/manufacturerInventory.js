const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const marker = code => `Vudoo catalog ${code}`;
const inventoryName = manufacturer => {
  const prefix = `${manufacturer.catalog_code} - `;
  if (prefix.length >= 100) throw new Error('Codice catalogo troppo lungo per il nome Inventory Base.com.');
  return `${prefix}${manufacturer.name.slice(0, 100 - prefix.length)}`;
};

export function inventoryIdentity(manufacturer) {
  if (!manufacturer?.catalog_code || !manufacturer?.name) throw new Error('Produttore locale incompleto.');
  return { name: inventoryName(manufacturer), description: `${marker(manufacturer.catalog_code)} | ${manufacturer.name}` };
}

function markerMatches(description, code) {
  if (typeof description !== 'string') return false;
  const needle = marker(code);
  let index = description.indexOf(needle);
  while (index !== -1) {
    const before = description[index - 1];
    const after = description[index + needle.length];
    if ((!before || !/[\w]/.test(before)) && (!after || !/[\w]/.test(after))) return true;
    index = description.indexOf(needle, index + needle.length);
  }
  return false;
}

function candidates(inventories, manufacturer, identity) {
  const byMarker = inventories.filter(item => markerMatches(item.description, manufacturer.catalog_code));
  return byMarker.length ? byMarker : inventories.filter(item => item.name === identity.name);
}

function configuredTemplate(inventories, configuredInventoryId) {
  if (configuredInventoryId) {
    const found = inventories.find(item => validId(item.inventory_id) === validId(configuredInventoryId));
    if (found) return found;
  } else {
    const defaults = inventories.filter(item => item.is_default === true);
    if (defaults.length === 1) return defaults[0];
  }
  throw Object.assign(new Error('Inventory Base.com configurato non trovato in getInventories.'),
    { code: 'CONFIGURED_INVENTORY_NOT_FOUND' });
}

function creationParameters(identity, template) {
  const required = ['languages', 'default_language', 'price_groups', 'default_price_group',
    'warehouses', 'default_warehouse', 'reservations'];
  if (required.some(key => template[key] == null) || !Array.isArray(template.languages) ||
      !Array.isArray(template.price_groups) || !Array.isArray(template.warehouses) ||
      !template.languages.includes(template.default_language) ||
      !template.price_groups.some(id => String(id) === String(template.default_price_group)) ||
      !template.warehouses.includes(template.default_warehouse) ||
      typeof template.reservations !== 'boolean') {
    throw Object.assign(new Error('Configurazione dell’Inventory template incompleta o incoerente.'),
      { code: 'INVALID_TEMPLATE_INVENTORY' });
  }
  return { ...identity, languages: [...template.languages], default_language: template.default_language,
    price_groups: [...template.price_groups], default_price_group: template.default_price_group,
    warehouses: [...template.warehouses], default_warehouse: template.default_warehouse,
    reservations: template.reservations };
}

export function createManufacturerInventoryService({ directory, getInventories, addInventory,
  configuredInventoryId = null, isSimulation }) {
  const locks = new Map();
  async function execute(manufacturer, selectedInventoryId) {
    if (!manufacturer?.catalog_code || !manufacturer?.name) throw new Error('Produttore locale incompleto.');
    const data = await getInventories();
    if (!Array.isArray(data?.inventories)) throw new Error('getInventories: elenco Inventory non valido.');
    const inventories = data.inventories;
    const identity = inventoryIdentity(manufacturer);
    const currentId = validId(manufacturer.base_inventory_id);
    const current = currentId && inventories.find(item => validId(item.inventory_id) === currentId);
    if (current && !selectedInventoryId) return { status: 'LINKED', inventoryId: currentId,
      inventory: current, created: false, simulated: false };

    const matches = candidates(inventories, manufacturer, identity);
    if (selectedInventoryId) {
      const selected = matches.find(item => validId(item.inventory_id) === validId(selectedInventoryId));
      if (!selected) throw Object.assign(new Error('Inventory selezionato non più compatibile: ripeti la verifica.'),
        { code: 'INVALID_INVENTORY_SELECTION' });
      directory.setBaseInventoryId(manufacturer.catalog_code, validId(selected.inventory_id));
      return { status: 'RECONCILED', inventoryId: validId(selected.inventory_id), inventory: selected,
        created: false, simulated: false };
    }
    if (matches.length > 1) return { status: 'AMBIGUOUS', inventoryId: null, inventory: null,
      candidates: matches.map(item => ({ inventory_id: validId(item.inventory_id), name: item.name, description: item.description })),
      created: false, simulated: false };
    if (matches.length === 1) {
      const matched = matches[0];
      const id = validId(matched.inventory_id);
      if (!id) throw new Error('Inventory Base.com riconciliato senza ID valido.');
      directory.setBaseInventoryId(manufacturer.catalog_code, id);
      return { status: 'RECONCILED', inventoryId: id, inventory: matched, created: false, simulated: false };
    }

    const template = configuredTemplate(inventories, configuredInventoryId);
    const parameters = creationParameters(identity, template);
    if (isSimulation()) return { status: 'SIMULATED_CREATE', inventoryId: null, inventory: null,
      planned: parameters, created: false, simulated: true };
    const response = await addInventory(parameters);
    const id = validId(response?.inventory_id);
    if (!id) throw new Error('addInventory: risposta senza inventory_id valido.');
    directory.setBaseInventoryId(manufacturer.catalog_code, id);
    return { status: 'CREATED', inventoryId: id, inventory: { ...parameters, inventory_id: id },
      created: true, simulated: false };
  }

  return {
    ensureInventoryForManufacturer(manufacturer, { selectedInventoryId = null } = {}) {
      const code = manufacturer?.catalog_code;
      if (typeof code !== 'string' || !code.trim()) return Promise.reject(new Error('Codice catalogo non valido.'));
      const prior = locks.get(code);
      if (prior && !selectedInventoryId) return prior;
      const task = (prior ? prior.catch(() => {}) : Promise.resolve()).then(() =>
        execute(directory.getByCode(code) ?? manufacturer, selectedInventoryId));
      locks.set(code, task);
      void task.finally(() => { if (locks.get(code) === task) locks.delete(code); }).catch(() => {});
      return task;
    },
  };
}
