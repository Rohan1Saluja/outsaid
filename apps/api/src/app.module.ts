import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }), PrismaModule, AuthModule, ReportsModule],
  controllers: [HealthController],
})
export class AppModule {}
