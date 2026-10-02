import { getAmazonConfig } from './config.js';
import { registerSecret } from '../../logger.js';

export const AMAZON_LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';
export const AMAZON_LWA_TIMEOUT_MS = 15000;

export async function getAmazonAccessToken({
  config = getAmazonConfig(), fetchImpl = globalThis.fetch, timeoutMs = AMAZON_LWA_TIMEOUT_MS,
} = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Timeout autenticazione Amazon non valido.');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetchImpl(AMAZON_LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
      signal,
    });
  } catch {
    if (signal.aborted) throw new Error('Timeout durante l’autenticazione Amazon.');
    throw new Error('Errore di rete durante l’autenticazione Amazon.');
  }
  if (!response.ok) {
    throw new Error(`Autenticazione Amazon fallita (HTTP ${response.status}).`);
  }
  let data;
  try {
    data = await response.json();
  } catch {
    if (signal.aborted) throw new Error('Timeout durante l’autenticazione Amazon.');
    throw new Error('Risposta JSON non valida durante l’autenticazione Amazon.');
  }
  if (typeof data?.access_token !== 'string' || !data.access_token.trim()) {
    throw new Error('Autenticazione Amazon: access_token assente dalla risposta.');
  }
  registerSecret(data.access_token);
  return {
    accessToken: data.access_token,
    expiresIn: Number.isFinite(data.expires_in) && data.expires_in > 0 ? data.expires_in : null,
  };
}
