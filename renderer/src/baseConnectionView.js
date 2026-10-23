export function connectionResultFromChecks(checks) {
  return checks.find(check => check.title === 'Connessione Base.com & Inventory')?.ok;
}

export function baseConnectionView(baseConfigured, connectionResult) {
  if (baseConfigured === false) return { tone: 'neutral', text: 'Non configurato' };
  if (baseConfigured !== true) return { tone: 'warning', text: 'Da verificare' };
  if (connectionResult === true) return { tone: 'success', text: 'Configurato - connesso a Base.com' };
  if (connectionResult === false) return { tone: 'error', text: 'Configurato - connessione non riuscita' };
  return { tone: 'warning', text: 'Configurato - connessione da verificare' };
}
