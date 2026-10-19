import { token } from './config.js';

const temporarySecrets = new Set();

export function registerSecret(value) {
  if (typeof value !== 'string' || !value) return;
  temporarySecrets.add(value);
  if (temporarySecrets.size > 8) temporarySecrets.delete(temporarySecrets.values().next().value);
}

export function redactToken(message) {
  const secrets = [token, ...Object.entries(process.env)
    .filter(([key]) => /(?:TOKEN|SECRET|PASSWORD|CLIENT_ID)$/.test(key))
    .map(([, value]) => value), ...temporarySecrets]
    .filter(value => typeof value === 'string' && value.length > 0);
  return secrets.sort((a, b) => b.length - a.length)
    .reduce((text, secret) => text.replaceAll(secret, '[TOKEN NASCOSTO]'), String(message));
}

export function log(message) {
  console.log(redactToken(message));
}
