import { callBase } from './baseApi.js';

export async function getVudooBaseFields(products) {
  const extraNames = new Set(products.flatMap(product => Object.keys(product.additional_fields ?? {})));
  const parameterNames = new Set(products.flatMap(product => Object.keys(product.features ?? {})));
  const extraFields = new Map();
  if (extraNames.size) {
    const data = await callBase('getInventoryExtraFields');
    if (!Array.isArray(data.extra_fields)) throw new Error('Additional Fields Base: risposta non valida.');
    for (const name of extraNames) {
      const matches = data.extra_fields.filter(field => field.name === name);
      if (matches.length !== 1) throw new Error(`Additional Field mancante o ambiguo: ${name}.`);
      const field = matches[0];
      if (!Number.isSafeInteger(field.extra_field_id) || field.extra_field_id <= 0 ||
          ![0, 1].includes(field.kind) || !['text', 'number'].includes(field.editor_type)) {
        throw new Error(`Additional Field non supportato: ${name}. Attesi Textbox o Number.`);
      }
      extraFields.set(name, field);
    }
  }
  if (parameterNames.size) {
    const data = await callBase('getInventoryParameters');
    if (!Array.isArray(data.parameters) || !Array.isArray(data.parameter_groups)) {
      throw new Error('Parameters Base: risposta non valida.');
    }
    const groups = data.parameter_groups.filter(group => group.name === 'Vudoo / Marketplace');
    if (groups.length !== 1 || !Array.isArray(groups[0].parameter_keys)) {
      throw new Error('Gruppo Parameters Vudoo / Marketplace mancante o ambiguo.');
    }
    for (const name of parameterNames) {
      const matches = data.parameters.filter(parameter => Object.values(parameter.name_translations ?? {}).includes(name));
      if (matches.length !== 1 || !groups[0].parameter_keys.includes(matches[0].parameter_key)) {
        throw new Error(`Parameter mancante o ambiguo nel gruppo Vudoo / Marketplace: ${name}.`);
      }
      const type = matches[0].type;
      if (type !== 'text' && !(name === 'Shipping Weight (kg)' && type === 'number')) {
        throw new Error(`Tipo Parameter non supportato per ${name}: ${type}.`);
      }
    }
  }
  return extraFields;
}
