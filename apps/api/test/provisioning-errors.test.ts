import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProvisioningInputError, provisioningFailure } from '../src/cli/provisioning-errors';

test('operator diagnostics distinguish validation, uniqueness, permissions and TLS safely', () => {
  assert.match(provisioningFailure(new ProvisioningInputError('PASSWORD_LENGTH'), 'password_input', false), /PASSWORD_LENGTH.*12–128/);
  assert.match(provisioningFailure(new ProvisioningInputError('PASSWORD_MISMATCH'), 'password_input', false), /PASSWORD_MISMATCH/);
  assert.match(provisioningFailure({ code: 'P2002' }, 'database_insert', false), /DUPLICATE_ACCOUNT/);
  assert.match(provisioningFailure({ meta: { driverAdapterError: { cause: { originalCode: '42501' } } } }, 'database_insert', false), /DATABASE_PERMISSION/);
  assert.match(provisioningFailure({ cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }, 'database_insert', false), /TLS_TRUST/);
  assert.match(provisioningFailure({ meta: { driverAdapterError: { cause: { kind: 'TlsConnectionError', reason: 'private-connection-details' } } } }, 'database_insert', false), /TLS_TRUST/);
  assert.match(provisioningFailure({ code: 'ENOENT' }, 'database_insert', false), /CERTIFICATE_FILE/);
});
test('unknown errors and wrappers never expose secrets or raw driver metadata', () => {
  const secret = 'private-password-and-database-url';
  const error = { code: secret, message: secret, stack: secret, meta: { sql: secret, driverAdapterError: { cause: { originalCode: secret, originalMessage: secret } } } };
  const output = provisioningFailure(error, 'database_insert', false);
  assert.match(output, /code=UNKNOWN/);
  assert.ok(!output.includes(secret));
  assert.match(provisioningFailure(error, 'cleanup', true), /Account was created/);
  assert.ok(!provisioningFailure(error, 'cleanup', true).includes(secret));
});
