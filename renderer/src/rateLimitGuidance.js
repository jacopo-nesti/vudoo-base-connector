export function rateLimitGuidance(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return '';
  if (limit <= 95) {
    return 'Valore consigliato per account Base.com con limite standard di 100 richieste al minuto.';
  }
  if (limit > 100) {
    return 'Attenzione: aumentare questo valore non aumenta il limite API del tuo account Base.com. Usa valori superiori solo se il tuo account dispone di una quota API maggiore. Superare il limite effettivo può causare rallentamenti, errori temporanei o blocchi delle richieste.';
  }
  return 'Valore vicino al limite standard di 100 richieste al minuto: resta meno margine per altre operazioni Base.com.';
}
