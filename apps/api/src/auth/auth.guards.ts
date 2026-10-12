import { ForbiddenException, Inject, Injectable, SetMetadata } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { CurrentUser } from '@outsaid/contracts';
import { AuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import type { AuthRequest } from './auth.service';
import { equalToken } from './crypto';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(AuthConfig) private readonly config: AuthConfig) {}
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const origin = req.get('origin');
    if (!origin || !this.config.origins.has(origin)) throw new ForbiddenException('Origin not allowed.');
    return true;
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(AuthConfig) private readonly config: AuthConfig) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    req.auth = await this.auth.authenticate(req);
    // Any future protected mutation automatically gets both origin and CSRF protection.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!this.config.origins.has(req.get('origin') ?? '') || !equalToken(req.get('x-csrf-token') ?? '', req.auth.csrf)) {
        throw new ForbiddenException('Invalid request protection.');
      }
    }
    return true;
  }
}
export const Roles = (...roles: CurrentUser['role'][]) => SetMetadata('auth:roles', roles);
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const allowed = this.reflector.getAllAndOverride<CurrentUser['role'][]>('auth:roles', [ctx.getHandler(), ctx.getClass()]);
    const user = ctx.switchToHttp().getRequest<AuthRequest>().auth?.user;
    if (!user || !allowed?.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
