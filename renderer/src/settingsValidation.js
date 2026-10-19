export function parseNumericSettings(draft, fields) {
  const settings = { ...draft };
  for (const { key, label, min, max = Number.MAX_SAFE_INTEGER } of fields) {
    const raw = String(settings[key] ?? '').trim();
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      const range = max === Number.MAX_SAFE_INTEGER ? `almeno ${min}` : `tra ${min} e ${max}`;
      return { error: `${label}: inserisci un numero intero ${range}.` };
    }
    settings[key] = value;
  }
  return { settings };
}
