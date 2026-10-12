export type ProvisioningStage = 'configuration' | 'account_input' | 'password_input' | 'hashing' | 'database_insert' | 'cleanup';
export class ProvisioningInputError extends Error {
  constructor(readonly code: 'TERMINAL_REQUIRED' | 'DATABASE_URL_REQUIRED' | 'INVALID_DATABASE_URL' | 'CANCELLED' | 'INVALID_ACCOUNT_DETAILS' | 'PASSWORD_LENGTH' | 'PASSWORD_MISMATCH') {
    super(code);
  }
}

const hints: Record<string, string> = {
  TERMINAL_REQUIRED: 'Use an interactive terminal without command-line arguments.',
  DATABASE_URL_REQUIRED: 'Set DATABASE_URL privately in the API environment.',
  INVALID_DATABASE_URL: 'DATABASE_URL must be a PostgreSQL URL with a database name.',
  CANCELLED: 'Provisioning cancelled.',
  INVALID_ACCOUNT_DETAILS: 'Check email, display name and the explicit role choice.',
  PASSWORD_LENGTH: 'Password must contain 12–128 characters. It is not trimmed.',
  PASSWORD_MISMATCH: 'Password confirmation does not match. Retype both passwords.',
  DUPLICATE_ACCOUNT: 'An account with this email already exists. No account was overwritten.',
  DATABASE_AUTH: 'Check the database username and password in the operator connection.',
  DATABASE_PERMISSION: 'Use the trusted provisioning operator connection, not the restricted backend role.',
  DATABASE_SCHEMA: 'Confirm both committed migrations are applied to the selected database.',
  TLS_TRUST: 'Configure the trusted CA certificate and retain TLS certificate verification.',
  CERTIFICATE_FILE: 'Check that the configured CA certificate file exists in the API working directory.',
  DATABASE_UNAVAILABLE: 'Check database availability, host, port and network access.',
  UNKNOWN: 'This stage failed; no raw error details are printed. Check its configuration.',
};
const driverCodes: Record<string, string> = {
  P2002: 'DUPLICATE_ACCOUNT', '23505': 'DUPLICATE_ACCOUNT',
  P1000: 'DATABASE_AUTH', '28P01': 'DATABASE_AUTH',
  P1011: 'TLS_TRUST', P1010: 'DATABASE_PERMISSION', '42501': 'DATABASE_PERMISSION',
  P2021: 'DATABASE_SCHEMA', P2022: 'DATABASE_SCHEMA', '42P01': 'DATABASE_SCHEMA', '42703': 'DATABASE_SCHEMA',
  SELF_SIGNED_CERT_IN_CHAIN: 'TLS_TRUST', DEPTH_ZERO_SELF_SIGNED_CERT: 'TLS_TRUST',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS_TRUST', UNABLE_TO_GET_ISSUER_CERT_LOCALLY: 'TLS_TRUST',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS_TRUST', CERT_HAS_EXPIRED: 'TLS_TRUST',
  ENOENT: 'CERTIFICATE_FILE', P1001: 'DATABASE_UNAVAILABLE', P1002: 'DATABASE_UNAVAILABLE',
  ECONNREFUSED: 'DATABASE_UNAVAILABLE', ETIMEDOUT: 'DATABASE_UNAVAILABLE', ENOTFOUND: 'DATABASE_UNAVAILABLE',
};
function classify(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== 'object' || depth > 4) return undefined;
  const obj = value as Record<string, unknown>;
  for (const name of ['code', 'originalCode']) {
    const code = obj[name];
    if (typeof code === 'string' && Object.hasOwn(driverCodes, code)) return driverCodes[code];
  }
  const kindCodes: Record<string, string> = { TlsConnectionError: 'TLS_TRUST', DatabaseNotReachable: 'DATABASE_UNAVAILABLE', ConnectionClosed: 'DATABASE_UNAVAILABLE', SocketTimeout: 'DATABASE_UNAVAILABLE' };
  if (typeof obj.kind === 'string' && Object.hasOwn(kindCodes, obj.kind)) return kindCodes[obj.kind];
  // Only inspect known wrapper fields. Never serialize error messages, SQL, metadata or URLs.
  for (const name of ['cause', 'meta', 'driverAdapterError']) {
    const result = classify(obj[name], depth + 1);
    if (result) return result;
  }
  return undefined;
}
export function provisioningFailure(error: unknown, stage: ProvisioningStage, created: boolean): string {
  if (created) return 'Account was created, but connection cleanup failed. Do not provision it again.';
  const code = error instanceof ProvisioningInputError ? error.code : classify(error) ?? 'UNKNOWN';
  return `Provisioning failed [stage=${stage}, code=${code}]. ${hints[code]}`;
}
