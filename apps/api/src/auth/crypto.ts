import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';

export const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1, hashLength: 32 } as const;
export const hashPassword = (password: string): Promise<string> => argon2.hash(password, passwordOptions);
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();
export const tokenHash = (token: string): string => createHash('sha256').update(token).digest('hex');
export const keyedHash = (secret: string, value: string): string => createHmac('sha256', secret).update(value).digest('hex');
export function equalToken(actual: string, expected: string): boolean {
  return /^[a-f0-9]{64}$/.test(actual) && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
// A non-account hash with identical work parameters. Never a provisioned credential.
export const dummyHash = '$argon2id$v=19$m=65536,t=3,p=1$cGlsb3QtZHVtbXktc2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
