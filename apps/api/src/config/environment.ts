export interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  AUTH_ALLOWED_ORIGINS: string;
  AUTH_SECRET: string;
  DATABASE_URL: string;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const nodeEnv = input.NODE_ENV ?? 'development';
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const port = Number(input.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const databaseUrl = input.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || !databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  try {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
      throw new Error();
    }
  } catch {
    // Never include the supplied URL or credentials in errors.
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  const origins = input.AUTH_ALLOWED_ORIGINS;
  const secret = input.AUTH_SECRET;
  if (typeof origins !== 'string' || !origins || origins.split(',').some(value => {
    try {
      const url = new URL(value);
      return url.hostname.includes('*') || url.origin !== value || !['http:', 'https:'].includes(url.protocol)
        || url.username !== '' || url.password !== ''
        || ((nodeEnv === 'production' || input.VERCEL === '1') && url.protocol !== 'https:');
    } catch { return true; }
  })) throw new Error('AUTH_ALLOWED_ORIGINS must contain exact comma-separated web origins (HTTPS when deployed)');
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/.test(secret)) {
    throw new Error('AUTH_SECRET must be 32 random bytes encoded as 64 lowercase hex characters');
  }
  return { AUTH_ALLOWED_ORIGINS: origins, AUTH_SECRET: secret, NODE_ENV: nodeEnv, PORT: port, DATABASE_URL: databaseUrl };
}
