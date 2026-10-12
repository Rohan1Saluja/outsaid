import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { isEmail } from 'class-validator';
import { PrismaClient } from '../generated/prisma/client';
import type { UserRole } from '../generated/prisma/client';
import { hashPassword, normalizeEmail } from '../auth/crypto';
import { ProvisioningInputError, provisioningFailure } from './provisioning-errors';
import type { ProvisioningStage } from './provisioning-errors';

let stage: ProvisioningStage = 'configuration';
let created = false;

async function hiddenPassword(label: string): Promise<string> {
  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error?: Error) {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    }
    function onData(data: string) {
      for (const char of data) {
        if (char === '\u0003') { finish(new ProvisioningInputError('CANCELLED')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (char >= ' ' && value.length < 129) value += char;
      }
    }
    process.stdin.on('data', onData);
    // Disable echo and attach input BEFORE showing the prompt (including fast paste).
    process.stdout.write(label);
  });
}
async function main() {
  if (process.argv.length !== 2 || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ProvisioningInputError('TERMINAL_REQUIRED');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new ProvisioningInputError('DATABASE_URL_REQUIRED');
  let target: URL;
  try {
    target = new URL(url);
    if (!['postgres:', 'postgresql:'].includes(target.protocol) || !target.hostname || !target.pathname.slice(1)) throw new Error();
  } catch { throw new ProvisioningInputError('INVALID_DATABASE_URL'); }
  stage = 'account_input';
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Target: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
  if (await prompts.question('Confirm intended database (type PROVISION): ') !== 'PROVISION') { prompts.close(); throw new ProvisioningInputError('CANCELLED'); }
  const email = normalizeEmail(await prompts.question('Email: '));
  const displayName = (await prompts.question('Display name: ')).trim();
  const choice = (await prompts.question('Role [CONTRIBUTOR] (MODERATOR or ADMIN requires explicit choice): ')).trim();
  const role = choice || 'CONTRIBUTOR';
  prompts.close();
  if (!isEmail(email) || email.length > 254 || !displayName || displayName.length > 80 || !['CONTRIBUTOR', 'MODERATOR', 'ADMIN'].includes(role)) throw new ProvisioningInputError('INVALID_ACCOUNT_DETAILS');
  stage = 'password_input';
  const password = await hiddenPassword('Password (hidden, 12–128 characters): ');
  if (password.length < 12 || password.length > 128) throw new ProvisioningInputError('PASSWORD_LENGTH');
  const confirmation = await hiddenPassword('Confirm password (hidden): ');
  if (password !== confirmation) throw new ProvisioningInputError('PASSWORD_MISMATCH');
  stage = 'hashing';
  const passwordHash = await hashPassword(password);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  try {
    stage = 'database_insert';
    await db.user.create({ data: { email, displayName, role: role as UserRole, passwordHash } });
    created = true;
    console.log('Pilot account created.');
  } finally {
    if (created) stage = 'cleanup';
    await db.$disconnect();
  }
}
void main().catch((error: unknown) => { console.error(provisioningFailure(error, stage, created)); process.exitCode = 1; });
