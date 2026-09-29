import { token } from './config.js';

export function redactToken(message) {
  const text = String(message);
  return token ? text.replaceAll(token, '[TOKEN NASCOSTO]') : text;
}

export function log(message) {
  console.log(redactToken(message));
}
