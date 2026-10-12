import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Roles, RolesGuard, SessionGuard } from '../auth/auth.guards';
import type { AuthRequest } from '../auth/auth.service';
import { RateLimitService } from '../auth/rate-limit.service';
// DTO classes are runtime values for Nest's reflected ValidationPipe metadata.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { CreateReportDto, EditReportDto, MineQueryDto, SubmitReportDto } from './report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(SessionGuard, RolesGuard)
@Roles('CONTRIBUTOR', 'MODERATOR', 'ADMIN')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService, @Inject(RateLimitService) private readonly limits: RateLimitService) {}
  @Post()
  async create(@Req() req: AuthRequest, @Body() dto: CreateReportDto) {
    await this.limits.consumeReport(req.auth!.user.id, 'create');
    return this.reports.create(req.auth!.user.id, dto);
  }
  @Get('mine')
  mine(@Req() req: AuthRequest, @Query() query: MineQueryDto) { return this.reports.mine(req.auth!.user.id, query); }
  @Get(':id')
  get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.reports.get(req.auth!.user.id, id); }
  @Patch(':id')
  async edit(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EditReportDto) {
    await this.limits.consumeReport(req.auth!.user.id, 'edit');
    return this.reports.edit(req.auth!.user.id, id, dto);
  }
  @Post(':id/submit')
  async submit(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SubmitReportDto) {
    await this.limits.consumeReport(req.auth!.user.id, 'submit');
    return this.reports.submit(req.auth!.user.id, id, dto);
  }
}
