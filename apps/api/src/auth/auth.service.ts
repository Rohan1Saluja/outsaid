import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import type { Request } from 'express';
import type { CurrentUser } from '@outsaid/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { AuthConfig } from './auth.config';
import { dummyHash, keyedHash, tokenHash } from './crypto';
import { RateLimitService } from './rate-limit.service';
import type { LoginDto } from './login.dto';

export const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export const safeUserSelect = { id: true, displayName: true, role: true } as const;
export interface AuthContext { sessionId: string; user: CurrentUser; csrf: string }
export type AuthRequest = Request & { auth?: AuthContext };

@Injectable()
export class AuthService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthConfig) private readonly config: AuthConfig,
    @Inject(RateLimitService) private readonly limits: RateLimitService) {}

  async login(dto: LoginDto, req: Request) {
    await this.limits.consume(dto.email, this.limits.source(req));
    try {
      const user = await this.db.user.findUnique({ where: { email: dto.email },
        select: { ...safeUserSelect, passwordHash: true, disabledAt: true } });
      const valid = await argon2.verify(user?.passwordHash ?? dummyHash, dto.password);
      if (!user || !valid || user.disabledAt) throw new UnauthorizedException('Invalid email or password.');
      const token = randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + SESSION_MS);
      await this.db.session.create({ data: { userId: user.id, tokenHash: tokenHash(token), expiresAt } });
      return { token, expiresAt, user: { id: user.id, displayName: user.displayName, role: user.role } };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException();
    }
  }

  async authenticate(req: Request): Promise<AuthContext> {
    const cookies = (req.headers.cookie ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(`${this.config.cookieName}=`));
    const token = cookies.length === 1 ? cookies[0]!.slice(this.config.cookieName.length + 1) : '';
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new UnauthorizedException();
    try {
      const session = await this.db.session.findUnique({ where: { tokenHash: tokenHash(token) },
        select: { id: true, expiresAt: true, revokedAt: true, user: { select: { ...safeUserSelect, disabledAt: true } } } });
      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now() || session.user.disabledAt) throw new UnauthorizedException();
      return { sessionId: session.id, csrf: keyedHash(this.config.secret, `csrf:${token}`),
        user: { id: session.user.id, displayName: session.user.displayName, role: session.user.role } };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new ServiceUnavailableException();
    }
  }
  async logout(sessionId: string): Promise<void> {
    try { await this.db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }); }
    catch { throw new ServiceUnavailableException(); }
  }
}
