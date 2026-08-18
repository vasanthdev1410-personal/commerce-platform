const requiredProductionStrings = [
  'DATABASE_URL',
  'WEB_ORIGIN',
  'JWT_ACCESS_SECRET',
  'IMAGEKIT_PUBLIC_KEY',
  'IMAGEKIT_PRIVATE_KEY',
  'IMAGEKIT_URL_ENDPOINT',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'SELLER_STATE',
  'SELLER_LEGAL_NAME',
  'SELLER_BILLING_ADDRESS',
] as const;

const boundedInteger = (
  config: Record<string, unknown>,
  name: string,
  minimum: number,
  maximum: number,
): void => {
  const value = Number(config[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
};

export const validateEnvironment = (
  config: Record<string, unknown>,
): Record<string, unknown> => {
  const isProduction = config.NODE_ENV === 'production';
  const defaults: Record<string, number> = {
    JWT_ACCESS_TTL_SECONDS: 900,
    REFRESH_TOKEN_TTL_DAYS: 30,
    ORDER_RESERVATION_TTL_MINUTES: 15,
    RETURN_WINDOW_DAYS: 7,
  };
  for (const [name, fallback] of Object.entries(defaults)) {
    if (config[name] === undefined || config[name] === '') {
      if (isProduction) throw new Error(`${name} must be configured in production`);
      config[name] = fallback;
    }
  }

  boundedInteger(config, 'JWT_ACCESS_TTL_SECONDS', 60, 86_400);
  boundedInteger(config, 'REFRESH_TOKEN_TTL_DAYS', 1, 365);
  boundedInteger(config, 'ORDER_RESERVATION_TTL_MINUTES', 1, 1_440);
  boundedInteger(config, 'RETURN_WINDOW_DAYS', 1, 365);

  if (!isProduction) return config;

  if (!['google', 'osm'].includes(String(config.LOCATION_PROVIDER))) {
    throw new Error('LOCATION_PROVIDER must be google or osm in production');
  }
  if (config.LOCATION_PROVIDER === 'google' && !config.GOOGLE_MAPS_SERVER_API_KEY) {
    throw new Error('GOOGLE_MAPS_SERVER_API_KEY must be configured for Google locations');
  }
  if (config.LOCATION_PROVIDER === 'osm' && !config.NOMINATIM_BASE_URL) {
    throw new Error('NOMINATIM_BASE_URL must be configured for OSM locations');
  }

  for (const name of requiredProductionStrings) {
    const value = config[name];
    if (
      typeof value !== 'string' ||
      value.trim().length === 0 ||
      value.includes('CHANGE_ME')
    ) {
      throw new Error(`${name} must be configured in production`);
    }
  }

  if ((config.JWT_ACCESS_SECRET as string).length < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 characters');
  }

  for (const name of ['DATABASE_URL', 'WEB_ORIGIN', 'IMAGEKIT_URL_ENDPOINT']) {
    try {
      const url = new URL(config[name] as string);
      if (name !== 'DATABASE_URL' && url.protocol !== 'https:') {
        throw new Error();
      }
    } catch {
      throw new Error(`${name} must be a valid production URL`);
    }
  }

  return config;
};
