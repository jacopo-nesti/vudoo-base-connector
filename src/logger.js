import { token } from './config.js';

const temporarySecrets = new Set();

export function registerSecret(value) {
  if (typeof value !== 'string' || !value) return;
  temporarySecrets.add(value);
  if (temporarySecrets.size > 8) temporarySecrets.delete(temporarySecrets.values().next().value);
}

export function redactToken(message) {
  const secrets = [token, process.env.AMAZON_REFRESH_TOKEN,
    process.env.AMAZON_LWA_CLIENT_ID, process.env.AMAZON_LWA_CLIENT_SECRET,
    ...temporarySecrets].filter(value => typeof value === 'string' && value.length > 0);
  return secrets.sort((a, b) => b.length - a.length)
    .reduce((text, secret) => text.replaceAll(secret, '[TOKEN NASCOSTO]'), String(message));
}

export function log(message) {
  console.log(redactToken(message));
}
