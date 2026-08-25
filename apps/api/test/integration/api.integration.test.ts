import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountKind, AccountStatus, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../../src/bootstrap';

const prisma = new PrismaClient();
let app: INestApplication;
describe('API session boundary', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await prisma.requestThrottle.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.userAccount.upsert({
      where: { username: 'api-admin' },
      update: {
        passwordHash: await hash('initial-admin-password'),
        status: AccountStatus.ACTIVE,
        passwordChangeRequired: true,
      },
      create: {
        username: 'api-admin',
        displayName: 'API Admin',
        accountKind: AccountKind.CARE_ADMIN,
        passwordHash: await hash('initial-admin-password'),
        passwordChangeRequired: true,
      },
    });
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  it('reports liveness without authentication', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
    const ready = await request(app.getHttpServer()).get('/ready').expect(200);
    expect(ready.body).toMatchObject({
      status: 'ready',
      checks: { database: 'ok', migrations: 'ok', storage: 'ok', outbox: 'ok' },
    });
    const release = await request(app.getHttpServer()).get('/release.json').expect(200);
    expect(release.body).toEqual({ releaseSha: 'ci', service: 'care-api' });
  });
  it('creates an opaque restricted session and requires CSRF for mutation', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ username: 'api-admin', password: 'initial-admin-password' })
      .expect(201);
    expect(login.body.passwordChangeRequired).toBe(true);
    expect(login.headers['set-cookie']?.[0]).toContain('HttpOnly');
    const csrf = await agent.get('/api/v1/auth/csrf').expect(200);
    await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'initial-admin-password', newPassword: 'changed-admin-password' })
      .expect(401);
    await agent
      .post('/api/v1/auth/change-password')
      .set('X-CSRF-Token', csrf.body.token)
      .send({ currentPassword: 'initial-admin-password', newPassword: 'changed-admin-password' })
      .expect(201);
  });
  it('persists account login throttles in PostgreSQL', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: 'rate-limited-account', password: 'incorrect-password' })
        .expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'rate-limited-account', password: 'incorrect-password' })
      .expect(429);
    expect(response.body.code).toBe('RATE_LIMITED');
  });
});
