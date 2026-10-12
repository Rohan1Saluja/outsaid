import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService, SESSION_MS } from './auth.service';
import type { AuthRequest } from './auth.service';
import { AuthConfig } from './auth.config';
// DTO must remain a runtime import for Nest validation metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { LoginDto } from './login.dto';
import { OriginGuard, SessionGuard } from './auth.guards';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService, @Inject(AuthConfig) private readonly config: AuthConfig) {}
  @Post('login')
  @HttpCode(200)
  @UseGuards(OriginGuard)
  async login(@Body() dto: LoginDto, @Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, req);
    res.cookie(this.config.cookieName, result.token, { ...this.config.cookieOptions(), maxAge: SESSION_MS, expires: result.expiresAt });
    return { user: result.user };
  }
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: AuthRequest) { return { user: req.auth!.user }; }
  @Get('csrf')
  @UseGuards(SessionGuard)
  csrf(@Req() req: AuthRequest) { return { csrfToken: req.auth!.csrf }; }
  @Post('logout')
  @HttpCode(204)
  @UseGuards(OriginGuard, SessionGuard)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.auth!.sessionId);
    res.clearCookie(this.config.cookieName, this.config.cookieOptions());
  }
}
