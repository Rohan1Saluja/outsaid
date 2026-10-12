import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { CursorPage, PrivateReport, PrivateReportSummary, SourceReference } from '@outsaid/contracts';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReportDto } from './report.dto';
import type { EditReportDto, MineQueryDto, SubmitReportDto } from './report.dto';

// Explicit private selections: no author/editor identity, approval metadata or full ORM serialization.
const summarySelect = { id: true, headline: true, claimBasis: true, publicationStatus: true, verificationStatus: true,
  version: true, createdAt: true, updatedAt: true, submittedAt: true } as const;
const sourceSelect = { kind: true, label: true, url: true, notes: true } as const;
const detailSelect = { ...summarySelect, body: true, locality: true,
  sources: { select: sourceSelect, orderBy: { id: 'asc' as const } } } as const;
type SummaryRow = Prisma.ReportGetPayload<{ select: typeof summarySelect }>;
type DetailRow = Prisma.ReportGetPayload<{ select: typeof detailSelect }>;
function summary(row: SummaryRow): PrivateReportSummary {
  return { id: row.id, headline: row.headline, claimBasis: row.claimBasis, publicationStatus: row.publicationStatus,
    verificationStatus: row.verificationStatus, version: row.version, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(), submittedAt: row.submittedAt?.toISOString() ?? null };
}
function detail(row: DetailRow): PrivateReport {
  return { ...summary(row), body: row.body, locality: row.locality,
    sources: row.sources.map(source => ({ kind: source.kind as SourceReference['kind'], label: source.label, url: source.url, notes: source.notes })) };
}
function content(input: Pick<CreateReportDto, 'headline' | 'body' | 'locality' | 'claimBasis'>) {
  // Whitelisted copy rather than spreading user input into Prisma data.
  return { headline: input.headline, body: input.body, locality: input.locality ?? null, claimBasis: input.claimBasis };
}
function sources(input: CreateReportDto) {
  return input.sources.map(source => ({ kind: source.kind, label: source.label, url: source.url ?? null, notes: source.notes ?? null }));
}
function size(input: CreateReportDto): void {
  if (Buffer.byteLength(JSON.stringify({ ...content(input), sources: sources(input) }), 'utf8') > 65536) {
    throw new BadRequestException('Report content and sources must fit within 64 KiB of JSON.');
  }
}
function cursor(value?: string): { createdAt: Date; id: string } | undefined {
  if (!value) return undefined;
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== 'string' || typeof decoded[1] !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded[1])) throw new Error();
    const date = new Date(decoded[0]);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== decoded[0]) throw new Error();
    return { createdAt: date, id: decoded[1] };
  } catch { throw new BadRequestException('Invalid report cursor.'); }
}
@Injectable()
export class ReportsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  private async persisted<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) { if (error instanceof HttpException) throw error; throw new ServiceUnavailableException(); }
  }
  async create(authorId: string, input: CreateReportDto): Promise<PrivateReport> {
    size(input);
    return this.persisted(() => this.db.$transaction(async tx => {
      const report = await tx.report.create({ data: { authorId, ...content(input), sources: { create: sources(input) } }, select: detailSelect });
      await this.revision(tx, authorId, report, 'Initial draft');
      return detail(report);
    }));
  }
  async mine(authorId: string, query: MineQueryDto): Promise<CursorPage<PrivateReportSummary>> {
    const limit = query.limit === undefined ? 20 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException('Limit must be between 1 and 100.');
    const after = cursor(query.cursor);
    return this.persisted(async () => {
      const rows = await this.db.report.findMany({ where: { authorId, ...(after ? { OR: [
        { createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } },
      ] } : {}) }, select: summarySelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
      const more = rows.length > limit;
      const items = rows.slice(0, limit);
      const last = items.at(-1);
      return { items: items.map(summary), nextCursor: more && last ? Buffer.from(JSON.stringify([last.createdAt.toISOString(), last.id])).toString('base64url') : null };
    });
  }
  async get(authorId: string, id: string): Promise<PrivateReport> {
    return this.persisted(async () => {
      const report = await this.db.report.findFirst({ where: { id, authorId }, select: detailSelect });
      if (!report) throw new NotFoundException('Report not found.');
      return detail(report);
    });
  }
  async edit(authorId: string, id: string, input: EditReportDto): Promise<PrivateReport> {
    size(input);
    return this.persisted(() => this.db.$transaction(async tx => {
      await this.checkDraft(tx, authorId, id, input.expectedVersion);
      // PostgreSQL rechecks this predicate after a competing update releases its row lock.
      const changed = await tx.report.updateMany({ where: { id, authorId, publicationStatus: 'DRAFT', version: input.expectedVersion },
        data: { ...content(input), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Report changed. Reload before editing.');
      // Sources have no inbound history FK: revisions hold independent JSON copies.
      await tx.reportSource.deleteMany({ where: { reportId: id } });
      await tx.reportSource.createMany({ data: sources(input).map(source => ({ ...source, reportId: id })) });
      const report = await tx.report.findFirstOrThrow({ where: { id, authorId }, select: detailSelect });
      await this.revision(tx, authorId, report, input.changeSummary);
      return detail(report);
    }));
  }
  async submit(authorId: string, id: string, input: SubmitReportDto): Promise<PrivateReport> {
    return this.persisted(() => this.db.$transaction(async tx => {
      await this.checkDraft(tx, authorId, id, input.expectedVersion);
      // Acquire the same CAS row lock as edit, before reading sources, so submitted snapshot cannot be torn.
      const changed = await tx.report.updateMany({ where: { id, authorId, publicationStatus: 'DRAFT', version: input.expectedVersion },
        data: { publicationStatus: 'SUBMITTED', submittedAt: new Date(), version: { increment: 1 } } });
      if (changed.count !== 1) throw new ConflictException('Report changed. Reload before submitting.');
      const report = await tx.report.findFirstOrThrow({ where: { id, authorId }, select: detailSelect });
      const dto = plainToInstance(CreateReportDto, { ...content(report), sources: report.sources });
      if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length) {
        throw new BadRequestException('Complete the required report content and source references before submitting.');
      }
      size(dto);
      await this.revision(tx, authorId, report, 'Submitted for human review; remains unverified and private');
      return detail(report);
    }));
  }
  private async checkDraft(tx: Prisma.TransactionClient, authorId: string, id: string, version: number): Promise<void> {
    const report = await tx.report.findFirst({ where: { id, authorId }, select: { publicationStatus: true, version: true } });
    if (!report) throw new NotFoundException('Report not found.');
    if (report.publicationStatus !== 'DRAFT' || report.version !== version) throw new ConflictException('Report is read-only or changed. Reload to see its current state.');
  }
  private async revision(tx: Prisma.TransactionClient, editorId: string, row: DetailRow, changeSummary: string): Promise<void> {
    await tx.reportRevision.create({ data: { reportId: row.id, editorId, number: row.version, ...content(row),
      sourceSnapshot: row.sources.map(source => ({ kind: source.kind, label: source.label, url: source.url, notes: source.notes })), changeSummary }, select: { id: true } });
  }
}
