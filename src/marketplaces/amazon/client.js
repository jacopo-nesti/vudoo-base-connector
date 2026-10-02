import { getAmazonConfig } from './config.js';

// Builds a request without sending it. Operation-specific API calls belong to later steps.
export function buildAmazonRequest(path, accessToken, config = getAmazonConfig()) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Percorso SP-API Amazon non valido.');
  }
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    throw new Error('Access token Amazon mancante.');
  }
  const url = new URL(path, config.endpoint);
  if (url.origin !== new URL(config.endpoint).origin) {
    throw new Error('Percorso SP-API Amazon non valido.');
  }
  const date = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  return new Request(url, {
    method: 'GET',
    headers: {
      'x-amz-access-token': accessToken,
      'x-amz-date': date,
      'user-agent': 'VudooBaseConnector/1.4.0 (Language=Node.js)',
    },
  });
}
