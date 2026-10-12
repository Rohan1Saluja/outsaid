import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
async function main() {
  if (!process.env.DATABASE_URL) throw new Error();
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }) });
  try {
    await db.$executeRaw`DELETE FROM outsaid."LoginThrottle" WHERE "windowStart" < CURRENT_TIMESTAMP - interval '24 hours'`;
    await db.$executeRaw`DELETE FROM outsaid."Session" WHERE "expiresAt" < CURRENT_TIMESTAMP - interval '24 hours' OR "revokedAt" < CURRENT_TIMESTAMP - interval '24 hours'`;
    console.log('Expired auth records removed.');
  } finally { await db.$disconnect(); }
}
void main().catch(() => { console.error('Auth cleanup failed.'); process.exitCode = 1; });
