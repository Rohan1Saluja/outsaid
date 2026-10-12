import 'reflect-metadata';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { configureApp } from '../src/configure-app';
import { validateEnvironment } from '../src/config/environment';

let app: NestExpressApplication;
before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.AUTH_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.AUTH_SECRET = 'a'.repeat(64);
  // Deliberately unavailable: this test must not query a real database.
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/outsaid';
  const { AppModule } = await import('../src/app.module');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
});
after(async () => { await app?.close(); });

test('GET /v1/health returns the exact liveness contract without a database', async () => {
  const response = await request(app.getHttpServer()).get('/v1/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok', service: 'outsaid-api' });
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['x-powered-by'], undefined);
});
test('unversioned health is absent; unimplemented API routes use the error envelope', async () => {
  await request(app.getHttpServer()).get('/health').expect(404);
  for (const path of ['/v1/reports', '/v1/auth/register']) {
    const response = await request(app.getHttpServer()).get(path).expect(404);
    assert.equal(response.body.error.code, 'HTTP_404');
    assert.equal(response.body.stack, undefined);
  }
});
test('invalid environment fails without echoing credentials', () => {
  assert.throws(() => validateEnvironment({ DATABASE_URL: 'https://secret@example.com/db' }),
    { message: 'DATABASE_URL must be a PostgreSQL connection URL' });
  assert.throws(() => validateEnvironment({}), { message: 'DATABASE_URL is required' });
  assert.throws(() => validateEnvironment({ PORT: 'bad' }), /PORT/);
});
