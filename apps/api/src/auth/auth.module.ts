import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthConfig } from './auth.config';
import { RateLimitService } from './rate-limit.service';
import { OriginGuard, SessionGuard, RolesGuard } from './auth.guards';
@Module({ imports: [PrismaModule], controllers: [AuthController],
  providers: [AuthService, AuthConfig, RateLimitService, OriginGuard, SessionGuard, RolesGuard],
  exports: [AuthService, AuthConfig, SessionGuard, RolesGuard] })
export class AuthModule {}
