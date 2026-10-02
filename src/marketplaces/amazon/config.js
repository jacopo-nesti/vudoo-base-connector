const ENDPOINTS = {
  sandbox: { EU: 'https://sandbox.sellingpartnerapi-eu.amazon.com' },
};

export function getAmazonEndpoint({ environment, region }) {
  const endpoint = ENDPOINTS[environment]?.[region];
  if (!endpoint) throw new Error('Configurazione Amazon non supportata: usare AMAZON_ENV=sandbox e AMAZON_REGION=EU.');
  return endpoint;
}

export function getAmazonConfig(env = process.env) {
  const required = {
    refreshToken: 'AMAZON_REFRESH_TOKEN',
    clientId: 'AMAZON_LWA_CLIENT_ID',
    clientSecret: 'AMAZON_LWA_CLIENT_SECRET',
  };
  const credentials = {};
  for (const [key, name] of Object.entries(required)) {
    const value = env[name];
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Configurazione Amazon incompleta: ${name} mancante.`);
    }
    credentials[key] = value.trim();
  }

  const environment = typeof env.AMAZON_ENV === 'string' ? env.AMAZON_ENV.trim().toLowerCase() : null;
  const region = typeof env.AMAZON_REGION === 'string' ? env.AMAZON_REGION.trim().toUpperCase() : null;
  if (environment !== 'sandbox') {
    throw new Error('AMAZON_ENV non valido: per ora è supportato solo sandbox.');
  }
  if (region !== 'EU') {
    throw new Error('AMAZON_REGION non valida: per ora è supportata solo EU.');
  }
  return { ...credentials, environment, region, endpoint: getAmazonEndpoint({ environment, region }) };
}
