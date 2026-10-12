import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Client } from 'pg';
import request from 'supertest';
import type { PrivateReport, ReportContent } from '@outsaid/contracts';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { hashPassword, keyedHash } from '../src/auth/crypto';
import { AuthConfig } from '../src/auth/auth.config';
import { RateLimitService } from '../src/auth/rate-limit.service';

let app: NestExpressApplication, admin: PrismaService, runtime: PrismaService, sql: Client;
let embedded: PGlite | undefined, socket: PGLiteSocketServer | undefined;
let runtimeUrl = '';
const capturedLogs: unknown[][] = [];
const role = `reports_test_${randomBytes(6).toString('hex')}`;
const origin = 'http://localhost:3000';
const password = 'Disposable private reports password';
interface Actor { id: string; email: string; cookie: string; csrf: string }
const draft: ReportContent = { headline: 'Attributed public interest claim', body: 'An attributed allegation needs independent human review and original records.',
  locality: 'Delhi district', claimBasis: 'ALLEGATION', sources: [{ kind: 'LINK', label: 'Original source record', url: 'https://example.com/record', notes: 'Context supplied by the contributor for review.' }] };
let a: Actor, b: Actor;
function route(method: 'get' | 'post' | 'patch', path: string, actor?: Actor, body?: object) {
  const req = request(app.getHttpServer())[method](`/v1/reports${path}`);
  if (actor) req.set('Cookie', actor.cookie).set('Origin', origin).set('x-csrf-token', actor.csrf);
  return body === undefined ? req : req.send(body);
}
async function actor(): Promise<Actor> {
  const email = `report-${randomBytes(6).toString('hex')}@example.com`;
  const user = await admin.user.create({ data: { email, displayName: 'Private contributor', passwordHash: await hashPassword(password) } });
  const response = await request(app.getHttpServer()).post('/v1/auth/login').set('Origin', origin).send({ email, password }).expect(200);
  const cookie = (response.headers['set-cookie']![0] as string).split(';')[0]!;
  const csrf = await request(app.getHttpServer()).get('/v1/auth/csrf').set('Cookie', cookie).expect(200);
  return { id: user.id, email, cookie, csrf: csrf.body.csrfToken as string };
}
async function create(who = a, input = draft): Promise<PrivateReport> { return (await route('post', '', who, input).expect(201)).body as PrivateReport; }
async function stored(id: string) {
  return admin.report.findUniqueOrThrow({ where: { id }, include: { sources: { orderBy: { id: 'asc' } }, revisions: { orderBy: { number: 'asc' } } } });
}

before(async () => {
  let url = process.env.REPORT_TEST_DATABASE_URL;
  if (url) {
    if (!/^\/outsaid_reports_test_[a-zA-Z0-9_]+$/.test(new URL(url).pathname)) throw new Error('Use a new disposable outsaid_reports_test_* database only');
  } else {
    embedded = await PGlite.create();
    socket = new PGLiteSocketServer({ db: embedded, host: '127.0.0.1', port: 55441, maxConnections: 30 });
    await socket.start(); url = 'postgresql://postgres:postgres@127.0.0.1:55441/postgres';
  }
  sql = new Client({ connectionString: url }); await sql.connect();
  assert.equal((await sql.query("SELECT to_regnamespace('outsaid') AS schema")).rows[0].schema, null, 'Refuse existing/shared schema');
  // Reviewed existing migration SQL only; never reset/drop a supplied database.
  for (const name of ['20261012120000_foundation', '20261012140000_auth_throttling']) await sql.query(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  for (const file of ['auth-runtime-role', 'reports-runtime-role']) await sql.query(readFileSync(`prisma/operations/${file}.sql`, 'utf8'));
  await sql.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD 'disposable-only'`);
  await sql.query(`GRANT outsaid_auth_runtime, outsaid_reports_runtime TO "${role}"`);
  const target = new URL(url); target.username = role; target.password = 'disposable-only'; runtimeUrl = target.toString();
  process.env.DATABASE_URL = runtimeUrl; process.env.NODE_ENV = 'test'; process.env.AUTH_ALLOWED_ORIGINS = origin;
  process.env.AUTH_SECRET = randomBytes(32).toString('hex'); delete process.env.VERCEL;
  admin = new PrismaService(new ConfigService({ DATABASE_URL: url }));
  const { AppModule } = await import('../src/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>(); configureApp(app); await app.init();
  app.useLogger({ log: () => {}, warn: () => {}, error: (...args: unknown[]) => { capturedLogs.push(args); } });
  runtime = app.get(PrismaService);
  a = await actor(); b = await actor();
}, { timeout: 60000 });
after(async () => { await app?.close(); await admin?.$disconnect(); await sql?.end(); await socket?.stop(); await embedded?.close(); });

test('restricted runtime create → replace sources/edit → submit: atomic snapshots, private DTOs and append-only history', async () => {
  const report = await create();
  assert.equal(report.publicationStatus, 'DRAFT'); assert.equal(report.verificationStatus, 'UNVERIFIED'); assert.equal(report.version, 1);
  assert.equal(report.submittedAt, null);
  assert.deepEqual(Object.keys(report).sort(), ['id', 'headline', 'body', 'locality', 'claimBasis', 'sources', 'publicationStatus', 'verificationStatus', 'version', 'createdAt', 'updatedAt', 'submittedAt'].sort());
  let rows = await stored(report.id);
  assert.equal(rows.revisions.length, 1); assert.equal(rows.revisions[0]!.number, 1); assert.deepEqual(rows.revisions[0]!.sourceSnapshot, report.sources);
  const replacement: ReportContent = { ...draft, claimBasis: 'EYEWITNESS_ACCOUNT', body: 'This is what was directly observed, with uncertainty explicitly attributed.', sources: [
    { kind: 'EYEWITNESS', label: 'First-hand observation', notes: 'Observed the public incident without collecting personal identifying details.' },
  ] };
  const edited = await route('patch', `/${report.id}`, a, { ...replacement, expectedVersion: 1, changeSummary: 'Clarified observation and replaced source' }).expect(200);
  assert.equal(edited.body.version, 2); rows = await stored(report.id);
  assert.equal(rows.sources.length, 1); assert.equal(rows.sources[0]!.kind, 'EYEWITNESS');
  assert.equal(rows.revisions[0]!.body, draft.body); assert.deepEqual(rows.revisions[0]!.sourceSnapshot, report.sources);
  assert.deepEqual(rows.revisions[1]!.sourceSnapshot, edited.body.sources);
  const submitted = await route('post', `/${report.id}/submit`, a, { expectedVersion: 2 }).expect(201);
  assert.equal(submitted.body.publicationStatus, 'SUBMITTED'); assert.equal(submitted.body.verificationStatus, 'UNVERIFIED'); assert.equal(submitted.body.version, 3);
  assert.ok(submitted.body.submittedAt); rows = await stored(report.id);
  assert.equal(rows.revisions.length, 3); assert.deepEqual(rows.revisions[2]!.sourceSnapshot, edited.body.sources);
  assert.equal(rows.revisions[2]!.body, replacement.body);
  assert.equal(rows.approvedAt, null); assert.equal(rows.publishedAt, null); assert.equal(await admin.moderationEvent.count(), 0);
  await route('patch', `/${report.id}`, a, { ...draft, expectedVersion: 3, changeSummary: 'Disallowed edit' }).expect(409);
  await route('post', `/${report.id}/submit`, a, { expectedVersion: 3 }).expect(409);
  await assert.rejects(admin.reportRevision.updateMany({ where: { reportId: report.id }, data: { changeSummary: 'Rewrite' } }));
  await assert.rejects(admin.reportRevision.deleteMany({ where: { reportId: report.id } }));
  assert.equal((await route('get', `/${report.id}`, a).expect(200)).headers['cache-control'], 'no-store');
});

test('all endpoints require live sessions; every role is restricted to own reports; disabled/revoked/expired rejected', async () => {
  const report = await create();
  const paths = [['post', '', draft], ['get', '/mine', undefined], ['get', `/${report.id}`, undefined],
    ['patch', `/${report.id}`, { ...draft, expectedVersion: 1, changeSummary: 'Private test' }], ['post', `/${report.id}/submit`, { expectedVersion: 1 }]] as const;
  for (const [method, path, body] of paths) await route(method, path, undefined, body).expect(401);
  for (const role of ['CONTRIBUTOR', 'MODERATOR', 'ADMIN'] as const) {
    await admin.user.update({ where: { id: b.id }, data: { role } });
    for (const [method, path, body] of paths.slice(2)) await route(method, path, b, body).expect(404);
    const mine = await route('get', '/mine', b).expect(200); assert.ok(!mine.body.items.some((row: { id: string }) => row.id === report.id));
    const authored = await create(b); assert.equal(authored.publicationStatus, 'DRAFT');
  }
  const disabled = await actor();
  await admin.user.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
  for (const [method, path, body] of paths) await route(method, path, disabled, body).expect(401);
  const revoked = await actor();
  await admin.session.updateMany({ where: { userId: revoked.id }, data: { revokedAt: new Date() } });
  for (const [method, path, body] of paths) await route(method, path, revoked, body).expect(401);
  const expired = await actor();
  await admin.session.updateMany({ where: { userId: expired.id }, data: { createdAt: new Date(Date.now() - 20000), expiresAt: new Date(Date.now() - 10000) } });
  for (const [method, path, body] of paths) await route(method, path, expired, body).expect(401);
});

test('origin/session-bound CSRF, forbidden input fields, nested validation, schemes, versions and JSON byte limits', async () => {
  const report = await create();
  for (const [method, path, body] of [['post', '', draft], ['patch', `/${report.id}`, { ...draft, expectedVersion: 1, changeSummary: 'Changed headline' }], ['post', `/${report.id}/submit`, { expectedVersion: 1 }]] as const) {
    for (const [requestOrigin, token] of [[origin, ''], ['', a.csrf], ['https://evil.example', a.csrf], [origin, b.csrf]]) {
      await request(app.getHttpServer())[method](`/v1/reports${path}`).set('Cookie', a.cookie).set('Origin', requestOrigin!).set('x-csrf-token', token!).send(body).expect(403);
    }
    for (const field of ['authorId', 'ownerId', 'role', 'publicationStatus', 'verificationStatus', 'approvedAt', 'approvedById', 'publishedRevisionId']) {
      await route(method, path, a, { ...body, [field]: 'CLIENT-CONTROLLED' }).expect(400);
    }
  }
  for (const input of [
    { ...draft, sources: [] }, { ...draft, sources: Array(11).fill(draft.sources[0]) },
    { ...draft, headline: ' '.repeat(10) }, { ...draft, body: 'x'.repeat(20001) }, { ...draft, locality: 'x'.repeat(121) },
    { ...draft, claimBasis: 'CONFIRMED' }, { ...draft, sources: [null] }, { ...draft, sources: [{ ...draft.sources[0], id: report.id }] },
    ...['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com', 'example.com', null].map(url => ({ ...draft, sources: [{ ...draft.sources[0], url }] })),
    { ...draft, sources: [{ kind: 'EYEWITNESS', label: 'Witness account', notes: '' }] },
    { ...draft, body: '界'.repeat(20000), sources: Array(10).fill({ ...draft.sources[0], notes: '界'.repeat(1000) }) },
  ]) await route('post', '', a, input).expect(400);
  for (const expectedVersion of [0, -1, '1', 1.5, 2147483647]) await route('post', `/${report.id}/submit`, a, { expectedVersion }).expect(400);
  await route('get', '/not-a-uuid', a).expect(400);
});

test('stale/concurrent edits, concurrent submission and edit versus submit have one winner and intact revisions', async () => {
  const who = await actor();
  const report = await create(who);
  const requests = [0, 1].map(i => route('patch', `/${report.id}`, who, { ...draft, headline: `Concurrent edit ${i}`, expectedVersion: 1, changeSummary: `Concurrent change ${i}` }));
  const results = await Promise.all(requests); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  let rows = await stored(report.id); assert.equal(rows.version, 2); assert.equal(rows.revisions.length, 2); assert.equal(rows.headline, rows.revisions[1]!.headline);
  const before = await stored(report.id);
  await route('patch', `/${report.id}`, who, { ...draft, expectedVersion: 1, changeSummary: 'Stale change' }).expect(409);
  assert.deepEqual(await stored(report.id), before);
  const submissions = await Promise.all([0, 1].map(() => route('post', `/${report.id}/submit`, who, { expectedVersion: 2 })));
  assert.deepEqual(submissions.map(r => r.status).sort(), [201, 409]); rows = await stored(report.id);
  assert.equal(rows.version, 3); assert.equal(rows.revisions.length, 3);
  const racing = await create(who);
  const race = await Promise.all([route('patch', `/${racing.id}`, who, { ...draft, headline: 'Edit racing with submission', expectedVersion: 1, changeSummary: 'Race test' }), route('post', `/${racing.id}/submit`, who, { expectedVersion: 1 })]);
  assert.ok([200, 201].includes(race[0]!.status) || race[1]!.status === 201); assert.equal(race.filter(r => r.status === 409).length, 1);
  rows = await stored(racing.id); assert.equal(rows.version, 2); assert.equal(rows.revisions.length, 2); assert.equal(rows.body, rows.revisions[1]!.body);
});

test('revision failure rolls back create/edit/submission including source replacement and metadata; errors sanitized', async () => {
  const who = await actor(); const report = await create(who); const baseline = await stored(report.id);
  const count = await admin.report.count();
  await sql.query(`CREATE FUNCTION outsaid.test_revision_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PRIVATE_SENTINEL ${who.email} credential SQL content'; END $$;
    CREATE TRIGGER test_revision_failure BEFORE INSERT ON outsaid."ReportRevision" FOR EACH ROW EXECUTE FUNCTION outsaid.test_revision_failure()`);
  try {
    const responses = [await route('post', '', who, draft).expect(503), await route('patch', `/${report.id}`, who, { ...draft, headline: 'Rollback changed content', sources: [{ kind: 'DOCUMENT', label: 'Different source record', url: 'https://example.com/other' }], expectedVersion: 1, changeSummary: 'Rollback test' }).expect(503), await route('post', `/${report.id}/submit`, who, { expectedVersion: 1 }).expect(503)];
    assert.equal(await admin.report.count(), count); assert.deepEqual(await stored(report.id), baseline);
    for (const response of responses) assert.doesNotMatch(JSON.stringify(response.body), /PRIVATE_SENTINEL|credential|SQL content|example.com|Rollback/);
  } finally { await sql.query('DROP TRIGGER test_revision_failure ON outsaid."ReportRevision"; DROP FUNCTION outsaid.test_revision_failure()'); }
  // Corrupt legacy draft data via operator: submission revalidates and rolls back.
  await admin.report.update({ where: { id: report.id }, data: { body: '' } });
  await route('post', `/${report.id}/submit`, who, { expectedVersion: 1 }).expect(400);
  assert.doesNotMatch(JSON.stringify(capturedLogs), /PRIVATE_SENTINEL|credential|SQL content|example.com|Rollback/);
  const afterInvalid = await stored(report.id); assert.equal(afterInvalid.version, 1); assert.equal(afterInvalid.publicationStatus, 'DRAFT'); assert.equal(afterInvalid.revisions.length, 1);
});

test('private read failures are sanitized and uncached', async () => {
  const report = await create();
  await sql.query('ALTER TABLE outsaid."Report" RENAME TO "UnavailableReport"');
  try {
    for (const path of ['/mine', `/${report.id}`]) {
      const response = await route('get', path, a).expect(503);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.doesNotMatch(JSON.stringify(response.body), /UnavailableReport|example.com|Attributed|SELECT/);
    }
  } finally { await sql.query('ALTER TABLE outsaid."UnavailableReport" RENAME TO "Report"'); }
});

test('deterministic timestamp/id pagination: default/max limits, boundaries, malformed cursor and owner isolation', async () => {
  const who = await actor();
  const timestamp = new Date('2026-01-01T00:00:00.000Z');
  for (let i = 1; i <= 105; i++) await admin.report.create({ data: { ...draft, sources: undefined, authorId: who.id, createdAt: timestamp, id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}` } });
  const defaultPage = await route('get', '/mine', who).expect(200); assert.equal(defaultPage.body.items.length, 20);
  assert.equal(defaultPage.body.items[0].id, '00000000-0000-4000-8000-000000000105');
  const max = await route('get', '/mine?limit=100', who).expect(200); assert.equal(max.body.items.length, 100);
  const next = await route('get', `/mine?limit=100&cursor=${max.body.nextCursor}`, who).expect(200); assert.equal(next.body.items.length, 5); assert.equal(next.body.nextCursor, null);
  const ids = [...max.body.items, ...next.body.items].map((r: { id: string }) => r.id); assert.equal(new Set(ids).size, 105);
  const finalCursor = Buffer.from(JSON.stringify([timestamp.toISOString(), '00000000-0000-4000-8000-000000000001'])).toString('base64url');
  const empty = await route('get', `/mine?cursor=${finalCursor}`, who).expect(200); assert.deepEqual(empty.body, { items: [], nextCursor: null });
  for (const query of ['limit=0', 'limit=101', 'limit=1.5', 'limit=-1', 'limit=x', 'authorId=x', 'cursor=bad', 'cursor=%%%']) await route('get', `/mine?${query}`, who).expect(400);
  const foreignPage = await route('get', `/mine?cursor=${max.body.nextCursor}`, b).expect(200); assert.ok(!foreignPage.body.items.some((r: { id: string }) => ids.includes(r.id)));
});

test('atomic account mutation budgets persist across clients; separate actions/windows, retention and fail-closed storage', async () => {
  const config = app.get(AuthConfig), accountId = randomBytes(16).toString('hex');
  const db2 = new PrismaService(new ConfigService({ DATABASE_URL: runtimeUrl }));
  const one = new RateLimitService(runtime, config), two = new RateLimitService(db2, config);
  try {
    const results = await Promise.allSettled(Array.from({ length: 22 }, (_, i) => (i % 2 ? one : two).consumeReport(accountId, 'create')));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 20); assert.equal(results.filter(r => r.status === 'rejected').length, 2);
    for (const r of results) if (r.status === 'rejected') assert.equal((r.reason as { status: number }).status, 429);
    for (let i = 0; i < 120; i++) await one.consumeReport(accountId, 'edit');
    await assert.rejects(two.consumeReport(accountId, 'edit'), { status: 429 });
    for (let i = 0; i < 20; i++) await one.consumeReport(accountId, 'submit');
    await assert.rejects(two.consumeReport(accountId, 'submit'), { status: 429 });
    const key = keyedHash(config.secret, `report:create:${accountId}`);
    assert.equal((await admin.loginThrottle.findUniqueOrThrow({ where: { key } })).attempts, 22);
    await admin.loginThrottle.update({ where: { key }, data: { windowStart: new Date(Date.now() - 3600000) } });
    await two.consumeReport(accountId, 'create'); assert.equal((await admin.loginThrottle.findUniqueOrThrow({ where: { key } })).attempts, 1);
    const old = 'e'.repeat(64); await admin.loginThrottle.create({ data: { key: old, windowStart: new Date(Date.now() - 25 * 3600000), attempts: 1 } });
    await one.consumeReport(accountId, 'create'); assert.equal(await admin.loginThrottle.findUnique({ where: { key: old } }), null);
    const report = await create(b), baseline = await stored(report.id), count = await admin.report.count();
    await sql.query('ALTER TABLE outsaid."LoginThrottle" RENAME TO "UnavailableThrottle"');
    try {
      for (const [method, path, body] of [['post', '', draft], ['patch', `/${report.id}`, { ...draft, expectedVersion: 1, changeSummary: 'Fail closed' }], ['post', `/${report.id}/submit`, { expectedVersion: 1 }]] as const) await route(method, path, b, body).expect(503);
      assert.equal(await admin.report.count(), count); assert.deepEqual(await stored(report.id), baseline);
    } finally { await sql.query('ALTER TABLE outsaid."UnavailableThrottle" RENAME TO "LoginThrottle"'); }
    const who = await actor();
    await Promise.all(Array.from({ length: 20 }, () => one.consumeReport(who.id, 'create')));
    await route('post', '', who, draft).expect(429);
  } finally { await db2.$disconnect(); }
});

test('runtime role cannot approve, verify, publish, mutate submitted sources/history or read moderation; public denied', async () => {
  const report = await create(b);
  await route('post', `/${report.id}/submit`, b, { expectedVersion: 1 }).expect(201);
  await sql.query(`SET ROLE "${role}"`);
  try {
    const identity = (await sql.query('SELECT current_user')).rows[0].current_user; assert.equal(identity, role);
    const privileges = await sql.query('SELECT rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
    assert.ok(Object.values(privileges.rows[0]).every(value => value === false));
    for (const query of ['UPDATE outsaid."Report" SET "verificationStatus" = \'CORROBORATED\'', 'UPDATE outsaid."Report" SET "approvedAt" = now()', 'UPDATE outsaid."Report" SET "publicationStatus" = \'PUBLISHED\'', 'DELETE FROM outsaid."Report"', 'UPDATE outsaid."ReportRevision" SET "changeSummary" = \'Rewrite\'', 'DELETE FROM outsaid."ReportRevision"', 'SELECT * FROM outsaid."ModerationEvent"', 'SELECT * FROM outsaid."ContentFlag"', 'CREATE TABLE outsaid.escalation(id int)']) await assert.rejects(sql.query(query));
    assert.equal((await sql.query('DELETE FROM outsaid."ReportSource" WHERE "reportId" = $1', [report.id])).rowCount, 0);
    assert.equal((await sql.query('UPDATE outsaid."Report" SET headline = \'Forbidden submitted edit\' WHERE id = $1', [report.id])).rowCount, 0);
  } finally { await sql.query('RESET ROLE'); }
  const publicRole = `public_test_${randomBytes(6).toString('hex')}`; await sql.query(`CREATE ROLE "${publicRole}" NOLOGIN`);
  await sql.query(`SET ROLE "${publicRole}"`);
  try { for (const table of ['Report', 'ReportSource', 'ReportRevision', 'LoginThrottle', 'Session', 'User']) await assert.rejects(sql.query(`SELECT * FROM outsaid."${table}"`)); }
  finally { await sql.query('RESET ROLE'); }
  const before = await stored(report.id); assert.equal(before.headline, draft.headline);
  await request(app.getHttpServer()).get('/v1/health').expect(200, { status: 'ok', service: 'outsaid-api' });
});

test('actual Next rewrite: login → create → edit → submit → read-only → mine → logout', { skip: process.env.REPORT_TEST_WEB !== '1', timeout: 90000 }, async () => {
  const who = await actor();
  await app.listen(0, '127.0.0.1');
  const web = spawn(process.execPath, ['../web/node_modules/next/dist/bin/next', 'dev', '../web', '--hostname', '127.0.0.1', '--port', '55442'], {
    env: { ...process.env, API_ORIGIN: await app.getUrl(), NODE_ENV: 'development' }, stdio: 'ignore',
  });
  const webOrigin = 'http://127.0.0.1:55442'; app.get(AuthConfig).origins.add(webOrigin);
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${webOrigin}/login`)).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready);
    const login = await fetch(`${webOrigin}/api/v1/auth/login`, { method: 'POST', headers: { Origin: webOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: who.email, password }) });
    assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    const csrf = await fetch(`${webOrigin}/api/v1/auth/csrf`, { headers: { Cookie: cookie } });
    const token = (await csrf.json()) as { csrfToken: string };
    const headers = { Origin: webOrigin, Cookie: cookie, 'Content-Type': 'application/json', 'x-csrf-token': token.csrfToken };
    const created = await fetch(`${webOrigin}/api/v1/reports`, { method: 'POST', headers, body: JSON.stringify(draft) });
    assert.equal(created.status, 201); assert.equal(created.headers.get('cache-control'), 'no-store');
    const report = await created.json() as PrivateReport;
    const edited = await fetch(`${webOrigin}/api/v1/reports/${report.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...draft, expectedVersion: 1, changeSummary: 'Rewrite transport test' }) }); assert.equal(edited.status, 200);
    const submitted = await fetch(`${webOrigin}/api/v1/reports/${report.id}/submit`, { method: 'POST', headers, body: JSON.stringify({ expectedVersion: 2 }) }); assert.equal(submitted.status, 201);
    const readOnly = await fetch(`${webOrigin}/api/v1/reports/${report.id}`, { method: 'PATCH', headers, body: JSON.stringify({ ...draft, expectedVersion: 3, changeSummary: 'Denied after submission' }) }); assert.equal(readOnly.status, 409);
    assert.equal((await fetch(`${webOrigin}/api/v1/reports/mine`, { headers })).status, 200);
    assert.equal((await fetch(`${webOrigin}/reports/${report.id}`)).status, 200);
    assert.equal((await fetch(`${webOrigin}/api/v1/auth/logout`, { method: 'POST', headers })).status, 204);
    assert.equal((await fetch(`${webOrigin}/api/v1/reports/mine`, { headers })).status, 401);
  } finally { web.kill('SIGTERM'); await once(web, 'exit'); }
});
