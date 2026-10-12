import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { isIP } from 'node:net';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfig } from './auth.config';
import { keyedHash } from './crypto';

@Injectable()
export class RateLimitService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuthConfig) private readonly config: AuthConfig) {}

  source(req: Request): string {
    // Only trust this platform-overwritten header INSIDE Vercel. Express trust proxy stays false.
    // Local/proxied development deliberately shares the socket peer's budget.
    const ip = this.config.vercel ? req.get('x-vercel-forwarded-for') : req.socket.remoteAddress;
    if (!ip || !isIP(ip)) throw new ServiceUnavailableException();
    // Canonicalize IPv6 textual aliases and mapped IPv4. Aggregate IPv6 /64 to bound rotation.
    if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) return ip.slice(7);
    if (isIP(ip) === 4) return ip;
    const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
    const halves = canonical.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const groups = halves.length === 2 ? [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right] : left;
    return `${groups.slice(0, 4).join(':')}::/64`;
  }

  async consumeReport(accountId: string, action: 'create' | 'edit' | 'submit'): Promise<void> {
    const limit = { create: 20, edit: 120, submit: 20 }[action];
    const key = keyedHash(this.config.secret, `report:${action}:${accountId}`);
    try {
      const count = await this.db.$transaction(async tx => {
        const rows = await tx.$queryRaw<{ attempts: number }[]>`
          INSERT INTO outsaid."LoginThrottle" ("key", "windowStart", "attempts")
          VALUES (${key}, date_trunc('hour', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 1)
          ON CONFLICT ("key") DO UPDATE SET
            "attempts" = CASE WHEN "LoginThrottle"."windowStart" = EXCLUDED."windowStart" THEN LEAST("LoginThrottle"."attempts" + 1, 1000000) ELSE 1 END,
            "windowStart" = EXCLUDED."windowStart"
          RETURNING "attempts"`;
        await tx.$executeRaw`DELETE FROM outsaid."LoginThrottle" WHERE "key" IN
          (SELECT "key" FROM outsaid."LoginThrottle" WHERE "windowStart" < CURRENT_TIMESTAMP - interval '24 hours' LIMIT 100)`;
        return rows[0]!.attempts;
      });
      if (count > limit) throw new HttpException('Too many report mutations. Try again after the current hour.', 429);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) throw error;
      throw new ServiceUnavailableException();
    }
  }

  async consume(email: string, source: string): Promise<void> {
    const keys = [keyedHash(this.config.secret, `account:${email}`), keyedHash(this.config.secret, `source:${source}`)];
    try {
      // Both dimensions increment, even when one is exhausted; commit before returning 429.
      const counts = await this.db.$transaction(async tx => {
        const results: number[] = [];
        for (const key of keys) {
          const rows = await tx.$queryRaw<{ attempts: number }[]>`
            INSERT INTO outsaid."LoginThrottle" ("key", "windowStart", "attempts")
            VALUES (${key}, date_trunc('hour', CURRENT_TIMESTAMP) + floor(extract(minute from CURRENT_TIMESTAMP) / 15) * interval '15 minutes', 1)
            ON CONFLICT ("key") DO UPDATE SET
              "attempts" = CASE WHEN "LoginThrottle"."windowStart" = EXCLUDED."windowStart" THEN LEAST("LoginThrottle"."attempts" + 1, 1000000) ELSE 1 END,
              "windowStart" = EXCLUDED."windowStart"
            RETURNING "attempts"`;
          results.push(rows[0]!.attempts);
        }
        // Bounded per-request cleanup, with an indexed age predicate. Scheduled CLI handles idle periods.
        await tx.$executeRaw`DELETE FROM outsaid."LoginThrottle" WHERE "key" IN
          (SELECT "key" FROM outsaid."LoginThrottle" WHERE "windowStart" < CURRENT_TIMESTAMP - interval '24 hours' LIMIT 100)`;
        return results;
      });
      if (counts[0]! > 10 || counts[1]! > 50) throw new HttpException('Too many login attempts. Try again later.', 429);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) throw error;
      throw new ServiceUnavailableException();
    }
  }
}
