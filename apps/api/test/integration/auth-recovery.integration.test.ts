import type { INestApplication } from '@nestjs/common';
import { AccountKind, PrismaClient } from '@prisma/client';
import { hash, verify } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';

const db = new PrismaClient();
let app: INestApplication;
const noReg = '00990001';
const dob = '1990-02-28';
const cookie = (result: { headers: Record<string, unknown> }) =>
  result.headers['set-cookie'] as string[];
async function csrf(cookies: string[]) {
  return (
    await request(app.getHttpServer()).get('/api/v1/auth/csrf').set('Cookie', cookies).expect(200)
  ).body.token as string;
}
async function start(identifier = noReg) {
  return request(app.getHttpServer())
    .post('/api/v1/auth/login/start')
    .send({ noReg: identifier })
    .expect(201);
}
describe('Registration-first authentication and recovery', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });
  beforeEach(async () => {
    await db.requestThrottle.deleteMany();
    for (const [username, kind] of [
      [noReg, AccountKind.WORKFORCE],
      ['tm990001', AccountKind.WORKFORCE],
      ['recovery-union', AccountKind.UNION],
      ['recovery-admin', AccountKind.CARE_ADMIN],
    ] as const) {
      const employee =
        kind === AccountKind.WORKFORCE
          ? await db.employee.upsert({
              where: { noReg: username },
              create: {
                noReg: username,
                name: 'Synthetic Member',
                birthDate: new Date(`${dob}T00:00:00Z`),
              },
              update: { birthDate: new Date(`${dob}T00:00:00Z`) },
            })
          : null;
      const data = {
        displayName: 'Synthetic Account',
        passwordHash: await hash(username),
        accountKind: kind,
        passwordChangeRequired: true,
        status: 'ACTIVE' as const,
        employeeId: employee?.id ?? null,
      };
      await db.userAccount.upsert({
        where: { username },
        create: { username, ...data },
        update: data,
      });
    }
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });
  it('creates restricted default sessions, defers only the current session, and changes without current password', async () => {
    const initial = await start();
    expect(initial.body.next).toBe('CHANGE_PASSWORD');
    expect(initial.headers['cache-control']).toBe('no-store');
    const cookies = cookie(initial);
    await request(app.getHttpServer())
      .post('/api/v1/auth/defer-password-change')
      .set('Cookie', cookies)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/defer-password-change')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', await csrf(cookies))
      .expect(201);
    expect(
      (await db.userAccount.findUniqueOrThrow({ where: { username: noReg } }))
        .passwordChangeRequired,
    ).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', await csrf(cookies))
      .send({ newPassword: 'changed-secret' })
      .expect(400);
    const next = await start();
    const nextCookies = cookie(next);
    expect(next.body.session.passwordChangeRequired).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', nextCookies)
      .set('X-CSRF-Token', await csrf(nextCookies))
      .send({ newPassword: 'changed-secret' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookies)
      .expect(401);
    expect((await start()).body).toEqual({ next: 'PASSWORD_REQUIRED' });
    const account = await db.userAccount.findUniqueOrThrow({ where: { username: noReg } });
    expect(await verify(account.passwordHash, 'changed-secret')).toBe(true);
  });
  it('requires Union passwords, accepts TM casing and denies Admin and inactive identifiers', async () => {
    const union = await start('recovery-union');
    expect(union.body).toEqual({ next: 'PASSWORD_REQUIRED' });
    expect(union.headers['set-cookie']).toBeUndefined();
    const logged = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'recovery-union', password: 'recovery-union' })
      .expect(201);
    const cookies = cookie(logged);
    const token = await csrf(cookies);
    await request(app.getHttpServer())
      .post('/api/v1/auth/change-password')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', token)
      .send({ newPassword: 'union-secret' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/defer-password-change')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', token)
      .expect(404);
    expect((await start(' TM990001 ')).body.next).toBe('CHANGE_PASSWORD');
    for (const identifier of ['recovery-admin', 'missing-account'])
      await request(app.getHttpServer())
        .post('/api/v1/auth/login/start')
        .send({ noReg: identifier })
        .expect(400);
    await db.userAccount.update({ where: { username: noReg }, data: { status: 'INACTIVE' } });
    await request(app.getHttpServer()).post('/api/v1/auth/login/start').send({ noReg }).expect(400);
  });
  it('resets only matching DOB, revokes all sessions/push, and never returns DOB or a login cookie', async () => {
    const initial = await start();
    await db.pushSubscription.create({
      data: {
        accountId: initial.body.session.account.id,
        sessionId: initial.body.session.sessionId,
        installationId: crypto.randomUUID(),
        environment: 'test',
        endpointHash: crypto.randomUUID().replaceAll('-', '').padEnd(64, '0'),
        endpoint: 'https://example.invalid/push',
        p256dh: 'synthetic',
        auth: 'synthetic',
        active: true,
      },
    });
    const eligible = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset/eligibility')
      .send({ noReg })
      .expect(201);
    expect(eligible.body).toEqual({ eligible: true });
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset')
      .send({ noReg, birthDate: '1990-02-27' })
      .expect(400);
    const reset = await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset')
      .send({ noReg, birthDate: dob })
      .expect(201);
    expect(reset.body).toEqual({ success: true });
    expect(reset.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookie(initial))
      .expect(401);
    expect(
      await db.pushSubscription.count({
        where: { accountId: initial.body.session.account.id, active: true },
      }),
    ).toBe(0);
    expect((await start()).body.next).toBe('CHANGE_PASSWORD');
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'SELF_SERVICE_PASSWORD_RESET', resourceId: initial.body.session.account.id },
    });
    expect(JSON.stringify(audit)).not.toContain(dob);
  });
  it('rejects direct TM/Union resets even with valid DOB and returns unavailable for missing DOB', async () => {
    for (const identifier of ['tm990001', 'recovery-union']) {
      expect(
        (
          await request(app.getHttpServer())
            .post('/api/v1/auth/password-reset/eligibility')
            .send({ noReg: identifier })
            .expect(201)
        ).body,
      ).toEqual({ eligible: false });
      const result = await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset')
        .send({ noReg: identifier, birthDate: dob })
        .expect(400);
      expect(result.body.code).toBe('PASSWORD_RESET_UNAVAILABLE');
    }
    await db.employee.update({ where: { noReg }, data: { birthDate: null } });
    expect(
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/password-reset/eligibility')
          .send({ noReg })
          .expect(201)
      ).body.eligible,
    ).toBe(false);
  });
  it('limits failed reset guesses and rejects cross-origin mutations', async () => {
    for (let i = 0; i < 5; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/password-reset')
        .send({ noReg, birthDate: '1990-02-27' })
        .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/password-reset')
      .send({ noReg, birthDate: dob })
      .expect(429);
    for (const path of ['login/start', 'password-reset/eligibility', 'password-reset'])
      await request(app.getHttpServer())
        .post(`/api/v1/auth/${path}`)
        .set('Origin', 'https://evil.invalid')
        .send({ noReg, birthDate: dob })
        .expect(400);
  });
  it('serializes credential changes: a concurrent request cannot reuse a revoked default session', async () => {
    const first = await start();
    const second = await start();
    const a = cookie(first);
    const b = cookie(second);
    const ta = await csrf(a);
    const tb = await csrf(b);
    const results = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Cookie', a)
        .set('X-CSRF-Token', ta)
        .send({ newPassword: 'secret-one' }),
      request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Cookie', b)
        .set('X-CSRF-Token', tb)
        .send({ newPassword: 'secret-two' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 401]);
    expect((await start()).body.next).toBe('PASSWORD_REQUIRED');
  });
  it('a reset racing with personal-password login leaves no authenticated personal session', async () => {
    await db.userAccount.update({
      where: { username: noReg },
      data: { passwordHash: await hash('personal-secret'), passwordChangeRequired: false },
    });
    const [reset, login] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/password-reset')
        .send({ noReg, birthDate: dob }),
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ username: noReg, password: 'personal-secret' }),
    ]);
    expect(reset.status).toBe(201);
    expect([201, 401]).toContain(login.status);
    if (login.status === 201)
      await request(app.getHttpServer())
        .get('/api/v1/auth/session')
        .set('Cookie', cookie(login))
        .expect(401);
    expect((await start()).body.next).toBe('CHANGE_PASSWORD');
  });
  it('a reset racing with password change cannot be undone by a stale session', async () => {
    const initial = await start();
    const cookies = cookie(initial);
    const token = await csrf(cookies);
    const [reset, change] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/password-reset')
        .send({ noReg, birthDate: dob }),
      request(app.getHttpServer())
        .post('/api/v1/auth/change-password')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', token)
        .send({ newPassword: 'new-personal-secret' }),
    ]);
    expect(reset.status).toBe(201);
    expect([201, 401]).toContain(change.status);
    const account = await db.userAccount.findUniqueOrThrow({ where: { username: noReg } });
    expect(account.passwordChangeRequired).toBe(true);
    expect(await verify(account.passwordHash, noReg)).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/auth/session')
      .set('Cookie', cookies)
      .expect(401);
  });
});
