import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthConfig {
  readonly origins: Set<string>;
  readonly secret: string;
  readonly secure: boolean;
  readonly cookieName: string;
  readonly vercel: boolean;
  constructor(@Inject(ConfigService) config: ConfigService) {
    this.origins = new Set(config.getOrThrow<string>('AUTH_ALLOWED_ORIGINS').split(','));
    this.secret = config.getOrThrow<string>('AUTH_SECRET');
    this.secure = config.get<string>('NODE_ENV') === 'production' || config.get<string>('VERCEL') === '1';
    this.cookieName = this.secure ? '__Host-outsaid-session' : 'outsaid-session-local';
    this.vercel = config.get<string>('VERCEL') === '1';
  }
  cookieOptions() {
    return { httpOnly: true, secure: this.secure, sameSite: 'lax' as const, path: '/' };
  }
}
