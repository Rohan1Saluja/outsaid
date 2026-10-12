import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Client } from 'pg';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthModule } from '../src/auth/auth.module';
import { AuthConfig } from '../src/auth/auth.config';
import { Roles, RolesGuard, SessionGuard } from '../src/auth/auth.guards';
import { hashPassword, tokenHash } from '../src/auth/crypto';
import { RateLimitService } from '../src/auth/rate-limit.service';

@Controller('test-protected')
class ProtectedController {
  @Get()
  @UseGuards(SessionGuard, RolesGuard)
  @Roles('ADMIN')
  admin() { return { ok: true }; }
}
let app: NestExpressApplication;
let db: PrismaService;
let embedded: PGlite | undefined;
let socket: PGLiteSocketServer | undefined;
let sql: Client;
const origin = 'http://localhost:3000';
const password = '  A secure pilot password  ';
let email = '';
let userId = '';
const cookieOf = (response: { headers: Record<string, unknown> }): string => (response.headers['set-cookie'] as string[])[0]!.split(';')[0]!;
const login = (address = email, pass = password) => request(app.getHttpServer()).post('/v1/auth/login').set('Origin', origin).send({ email: address, password: pass });

before(async () => {
  let url = process.env.AUTH_TEST_DATABASE_URL;
  if (url) {
    if (!new URL(url).pathname.startsWith('/outsaid_auth_test_')) throw new Error('Tests require an explicitly named disposable outsaid_auth_test_* database');
  } else {
    embedded = await PGlite.create();
    socket = new PGLiteSocketServer({ db: embedded, host: '127.0.0.1', port: 55439, maxConnections: 20 });
    await socket.start();
    url = 'postgresql://postgres:postgres@127.0.0.1:55439/postgres';
  }
  sql = new Client({ connectionString: url }); await sql.connect();
  const existing = await sql.query("SELECT to_regnamespace('outsaid') AS schema");
  assert.equal(existing.rows[0].schema, null, 'Refuse to apply migrations to an existing/shared schema');
  for (const name of ['20261012120000_foundation', '20261012140000_auth_throttling']) {
    await sql.query(readFileSync(`prisma/migrations/${name}/migration.sql`, 'utf8'));
  }
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ALLOWED_ORIGINS = origin;
  process.env.AUTH_SECRET = randomBytes(32).toString('hex');
  delete process.env.VERCEL;
  const { AppModule } = await import('../src/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule, AuthModule], controllers: [ProtectedController] }).compile();
  app = module.createNestApplication<NestExpressApplication>(); configureApp(app); await app.init();
  db = app.get(PrismaService);
}, { timeout: 60000 });
after(async () => { await app?.close(); await sql?.end(); await socket?.stop(); await embedded?.close(); });

async function account() {
  email = `pilot-${randomBytes(6).toString('hex')}@example.com`;
  const user = await db.user.create({ data: { email, displayName: 'Pilot', passwordHash: await hashPassword(password) } });
  userId = user.id;
  return user;
}

test('provisioned account, normalization, safe DTO, hashed token, CSRF and logout', async () => {
  await account();
  const response = await login(`  ${email.toUpperCase()}  `).expect(200);
  assert.deepEqual(response.body, { user: { id: userId, displayName: 'Pilot', role: 'CONTRIBUTOR' } });
  assert.equal(response.headers['cache-control'], 'no-store');
  const setCookie = response.headers['set-cookie']![0] as string;
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /SameSite=Lax/); assert.match(setCookie, /Path=\//);
  assert.doesNotMatch(setCookie, /Domain=|Secure/);
  const cookie = cookieOf(response);
  const session = await db.session.findFirstOrThrow({ where: { userId } });
  assert.equal(session.tokenHash, tokenHash(cookie.split('=')[1]!));
  assert.ok(session.expiresAt.getTime() - session.createdAt.getTime() > 6.99 * 86400000);
  await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', cookie).expect(200, response.body);
  await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).expect(403);
  await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).set('x-csrf-token', 'b'.repeat(64)).expect(403);
  const csrf = await request(app.getHttpServer()).get('/v1/auth/csrf').set('Cookie', cookie).expect(200);
  const other = await login().expect(200);
  await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookieOf(other)).set('Origin', origin).set('x-csrf-token', csrf.body.csrfToken).expect(403);
  for (const badOrigin of ['', 'https://evil.example', `${origin}.evil.example`]) {
    await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).set('Origin', badOrigin).set('x-csrf-token', csrf.body.csrfToken).expect(403);
  }
  const out = await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).set('x-csrf-token', csrf.body.csrfToken).expect(204);
  assert.match(out.headers['set-cookie']![0] as string, /Expires=Thu, 01 Jan 1970/);
  assert.ok((await db.session.findUniqueOrThrow({ where: { id: session.id } })).revokedAt);
  await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', cookie).expect(401);
});

test('generic failures, passwords preserved, disabled accounts and DTO validation', async () => {
  await account();
  const bad = await login(email, password.trim()).expect(401);
  const absent = await login('absent@example.com').expect(401);
  assert.deepEqual(absent.body, bad.body);
  await db.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  assert.deepEqual((await login().expect(401)).body, bad.body);
  await request(app.getHttpServer()).post('/v1/auth/login').set('Origin', origin).send({ email, password, role: 'ADMIN' }).expect(400);
  await request(app.getHttpServer()).post('/v1/auth/login').send({ email, password }).expect(403);
  await request(app.getHttpServer()).post('/v1/auth/login').set('Origin', 'https://evil.example').send({ email, password }).expect(403);
  await request(app.getHttpServer()).post('/v1/auth/register').send({ email, password }).expect(404);
});

test('session expiry, revocation, disabled status, and current-role guard', async () => {
  await account();
  const cookie = cookieOf(await login().expect(200));
  await request(app.getHttpServer()).get('/v1/test-protected').expect(401);
  await request(app.getHttpServer()).get('/v1/test-protected').set('Cookie', cookie).expect(403);
  await db.user.update({ where: { id: userId }, data: { role: 'ADMIN' } });
  await request(app.getHttpServer()).get('/v1/test-protected').set('Cookie', cookie).expect(200);
  await db.user.update({ where: { id: userId }, data: { role: 'CONTRIBUTOR', disabledAt: new Date() } });
  await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', cookie).expect(401);
  await db.user.update({ where: { id: userId }, data: { disabledAt: null } });
  await db.session.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 20000), expiresAt: new Date(Date.now() - 10000) } });
  await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', cookie).expect(401);
  const newCookie = cookieOf(await login().expect(200));
  await db.session.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
  await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', newCookie).expect(401);
});

test('atomic persistent counters across clients, source dimension, retention and fail closed', async () => {
  const config = app.get(AuthConfig);
  const db2 = new PrismaService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
  const a = new RateLimitService(db, config), b = new RateLimitService(db2, config);
  try {
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).consume('parallel@example.com', '198.51.100.1')));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 10);
    assert.equal(results.filter(r => r.status === 'rejected').length, 2);
    for (let i = 0; i < 50; i++) await a.consume(`source-${i}@example.com`, '198.51.100.2');
    await assert.rejects(b.consume('next@example.com', '198.51.100.2'), { status: 429 });
    await db.loginThrottle.create({ data: { key: 'c'.repeat(64), windowStart: new Date(Date.now() - 25 * 3600000), attempts: 1 } });
    await a.consume('cleanup@example.com', '198.51.100.3');
    assert.equal(await db.loginThrottle.findUnique({ where: { key: 'c'.repeat(64) } }), null);
    await sql.query('ALTER TABLE outsaid."LoginThrottle" RENAME TO "UnavailableThrottle"');
    try { await login().expect(503); } finally { await sql.query('ALTER TABLE outsaid."UnavailableThrottle" RENAME TO "LoginThrottle"'); }
  } finally { await db2.$disconnect(); }
});

test('schema constraints, private RLS, and secure deployed cookie configuration', async () => {
  const user = await account();
  await assert.rejects(db.user.create({ data: { email, displayName: 'Duplicate', passwordHash: user.passwordHash } }));
  await assert.rejects(db.user.create({ data: { email: 'UPPER@example.com', displayName: 'Bad', passwordHash: user.passwordHash } }));
  await assert.rejects(db.session.create({ data: { userId, tokenHash: 'raw-token', expiresAt: new Date(Date.now() + 60000) } }));
  const hash = 'd'.repeat(64);
  await db.session.create({ data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + 60000) } });
  await assert.rejects(db.session.create({ data: { userId, tokenHash: hash, expiresAt: new Date(Date.now() + 60000) } }));
  await sql.query(readFileSync('prisma/operations/auth-runtime-role.sql', 'utf8'));
  await sql.query('SET ROLE outsaid_auth_runtime');
  try {
    assert.ok((await sql.query('SELECT id FROM outsaid."User"')).rows.length);
    await assert.rejects(sql.query('SELECT * FROM outsaid."Report"'));
    await assert.rejects(sql.query('UPDATE outsaid."User" SET role = \'ADMIN\''));
  } finally { await sql.query('RESET ROLE'); }
  await sql.query('CREATE ROLE pilot_public NOLOGIN');
  await sql.query('SET ROLE pilot_public');
  try { await assert.rejects(sql.query('SELECT * FROM outsaid."User"')); } finally { await sql.query('RESET ROLE'); }
  const rows = await sql.query("SELECT relrowsecurity FROM pg_class WHERE relnamespace = 'outsaid'::regnamespace AND relkind = 'r'");
  assert.equal(rows.rows.length, 8); assert.ok(rows.rows.every(row => row.relrowsecurity));
  const deployed = new AuthConfig(new ConfigService({ NODE_ENV: 'production', AUTH_ALLOWED_ORIGINS: 'https://pilot.example.com', AUTH_SECRET: 'a'.repeat(64) }));
  assert.equal(deployed.cookieName, '__Host-outsaid-session');
  assert.deepEqual(deployed.cookieOptions(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
  const response = await request(app.getHttpServer()).get('/v1/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok', service: 'outsaid-api' });
});


test('forwarded headers cannot change the local source; deployed source fails closed', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' }, get: () => '198.51.100.42' } as unknown as Request;
  assert.equal(app.get(RateLimitService).source(req), '127.0.0.1');
  const deployed = new AuthConfig(new ConfigService({ VERCEL: '1', AUTH_ALLOWED_ORIGINS: 'https://pilot.example', AUTH_SECRET: 'a'.repeat(64) }));
  const limits = new RateLimitService(db, deployed);
  assert.equal(limits.source(req), '198.51.100.42');
  assert.throws(() => limits.source({ get: () => '198.51.100.1, 198.51.100.2' } as unknown as Request), { status: 503 });
  assert.equal(limits.source({ get: () => '2001:db8:abcd:12::1' } as unknown as Request),
    limits.source({ get: () => '2001:0db8:abcd:0012::2' } as unknown as Request));
});


test('Next rewrite preserves cookie, origin, CSRF, safe responses and logout', { skip: process.env.AUTH_TEST_WEB !== '1', timeout: 60000 }, async () => {
  await account();
  await app.listen(0, '127.0.0.1');
  const apiOrigin = await app.getUrl();
  const web = spawn(process.execPath, ['../web/node_modules/next/dist/bin/next', 'dev', '../web', '--hostname', '127.0.0.1', '--port', '55440'], {
    env: { ...process.env, API_ORIGIN: apiOrigin, NODE_ENV: 'development' }, stdio: 'ignore',
  });
  const webOrigin = 'http://127.0.0.1:55440';
  app.get(AuthConfig).origins.add(webOrigin);
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${webOrigin}/login`)).ok) { ready = true; break; } } catch { /* starting */ }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(ready, 'Next web server started');
    assert.equal((await fetch(`${webOrigin}/account`)).status, 200);
    const loggedIn = await fetch(`${webOrigin}/api/v1/auth/login`, { method: 'POST', headers: { Origin: webOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(loggedIn.status, 200);
    const cookie = loggedIn.headers.get('set-cookie')!.split(';')[0]!;
    assert.match(loggedIn.headers.get('set-cookie')!, /HttpOnly/);
    assert.equal(loggedIn.headers.get('cache-control'), 'no-store');
    const me = await fetch(`${webOrigin}/api/v1/auth/me`, { headers: { Cookie: cookie } });
    assert.deepEqual(await me.json(), { user: { id: userId, displayName: 'Pilot', role: 'CONTRIBUTOR' } });
    const csrf = await fetch(`${webOrigin}/api/v1/auth/csrf`, { headers: { Cookie: cookie } });
    const token = (await csrf.json()) as { csrfToken: string };
    const out = await fetch(`${webOrigin}/api/v1/auth/logout`, { method: 'POST', headers: { Origin: webOrigin, Cookie: cookie, 'x-csrf-token': token.csrfToken } });
    assert.equal(out.status, 204); assert.match(out.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await fetch(`${webOrigin}/api/v1/auth/me`, { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await fetch(`${webOrigin}/api/v1/health`)).status, 200);
  } finally {
    web.kill('SIGTERM');
    await once(web, 'exit');
  }
});


test('interactive provisioning CLI hides password and defaults to contributor', { skip: process.env.AUTH_TEST_CLI !== '1', timeout: 30000 }, async () => {
  const cliEmail = `cli-${randomBytes(6).toString('hex')}@example.com`;
  const helper = String.raw`
import os, pty, subprocess, select, sys, json, time
values=json.load(sys.stdin)
master,slave=pty.openpty()
proc=subprocess.Popen([values['node'],'dist-test/src/cli/provision.js'],stdin=slave,stdout=slave,stderr=slave,env=os.environ)
os.close(slave)
transcript=b''
steps=[(b'PROVISION): ',b'PROVISION'),(b'Email: ',values['email'].encode()),(b'Display name: ',b'CLI Pilot'),(b'explicit choice): ',b''),(b'12\xe2\x80\x93128 characters): ',values['password'].encode()),(b'Confirm password (hidden): ',values['password'].encode())]
# The password prompt contains a Unicode en dash; match its ASCII suffix.
steps[4]=(b'characters): ',values['password'].encode())
index=0
deadline=time.time()+20
while time.time()<deadline:
    if select.select([master],[],[],0.1)[0]:
        try: chunk=os.read(master,65536)
        except OSError: break
        transcript+=chunk
        if index<len(steps) and steps[index][0] in transcript:
            os.write(master,steps[index][1]+b'\n')
            index+=1
    if proc.poll() is not None: break
if proc.poll() is None: proc.kill()
proc.wait()
os.close(master)
print(json.dumps({'ok':proc.returncode==0 and b'Pilot account created.' in transcript,'leaked':values['password'].encode() in transcript,'steps':index}))
`;
  const child = spawn('python3', ['-c', helper], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
  child.stdin.end(JSON.stringify({ node: process.execPath, email: cliEmail, password }));
  const [code] = await once(child, 'exit');
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(output), { ok: true, leaked: false, steps: 6 });
  const user = await db.user.findUniqueOrThrow({ where: { email: cliEmail } });
  assert.equal(user.role, 'CONTRIBUTOR');
  assert.ok(user.passwordHash.startsWith('$argon2id$v=19$'));
  assert.deepEqual(user.passwordHash.split('$')[3]!.split(',').sort(), ['m=65536', 'p=1', 't=3']);
  await login(cliEmail).expect(200);
});
