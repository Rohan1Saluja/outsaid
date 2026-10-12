import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { isEmail } from 'class-validator';
import { PrismaClient } from '../generated/prisma/client';
import type { UserRole } from '../generated/prisma/client';
import { hashPassword, normalizeEmail } from '../auth/crypto';

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
        if (char === '\u0003') { finish(new Error('Cancelled')); return; }
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
    throw new Error('Use an interactive terminal without arguments.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required.');
  const target = new URL(url);
  const prompts = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Target: ${target.hostname}:${target.port || '5432'}${target.pathname}`);
  if (await prompts.question('Confirm intended database (type PROVISION): ') !== 'PROVISION') { prompts.close(); throw new Error('Cancelled'); }
  const email = normalizeEmail(await prompts.question('Email: '));
  const displayName = (await prompts.question('Display name: ')).trim();
  const choice = (await prompts.question('Role [CONTRIBUTOR] (MODERATOR or ADMIN requires explicit choice): ')).trim();
  const role = choice || 'CONTRIBUTOR';
  prompts.close();
  if (!isEmail(email) || email.length > 254 || !displayName || displayName.length > 80 || !['CONTRIBUTOR', 'MODERATOR', 'ADMIN'].includes(role)) throw new Error('Invalid account details');
  const password = await hiddenPassword('Password (hidden, 12–128 characters): ');
  const confirmation = await hiddenPassword('Confirm password (hidden): ');
  if (password.length < 12 || password.length > 128 || password !== confirmation) throw new Error('Password requirements or confirmation failed');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 1 }) });
  try {
    await db.user.create({ data: { email, displayName, role: role as UserRole, passwordHash: await hashPassword(password) } });
    console.log('Pilot account created.');
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error('Provisioning failed. Check target, input and account uniqueness. No account was overwritten.'); process.exitCode = 1; });
