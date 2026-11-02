import type { INestApplication } from '@nestjs/common';
import { AccountKind, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';

const db = new PrismaClient();
let app: INestApplication;
const DAY = 86_400_000;

const login = async (username: string) => {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password: 'session-secret' })
    .expect(201);
  return {
    cookie: response.headers['set-cookie'] as unknown as string[],
    sessionId: response.body.sessionId as string,
  };
};
const session = (cookie: string[]) =>
  request(app.getHttpServer()).get('/api/v1/auth/session').set('Cookie', cookie);
const cookieExpiry = (header: string[]) =>
  new Date(/Expires=([^;]+)/.exec(header.find((value) => value.startsWith('care_session='))!)![1]!);

describe('Session persistence', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "Session", "PushSubscription", "AuditEvent", "RequestThrottle" CASCADE',
    );
    const passwordHash = await hash('session-secret');
    for (const [username, accountKind] of [
      ['sp-member', AccountKind.WORKFORCE],
      ['sp-admin', AccountKind.CARE_ADMIN],
    ] as const)
      await db.userAccount.create({
        data: {
          username,
          displayName: username,
          passwordHash,
          accountKind,
          passwordChangeRequired: false,
        },
      });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('keeps a workforce session signed in well past the former 8-hour and 7-day limits', async () => {
    const { cookie, sessionId } = await login('sp-member');
    const created = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(created.absoluteExpiresAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
    expect(created.expiresAt).toEqual(created.absoluteExpiresAt);
    expect(cookieExpiry(cookie).getTime()).toBeCloseTo(created.absoluteExpiresAt.getTime(), -4);

    // Simulate a phone left untouched for 30 days on a session signed in 60 days ago.
    await db.session.update({
      where: { id: sessionId },
      data: {
        createdAt: new Date(Date.now() - 60 * DAY),
        lastSeenAt: new Date(Date.now() - 30 * DAY),
        expiresAt: new Date(Date.now() + 60 * DAY),
        absoluteExpiresAt: new Date(Date.now() + 60 * DAY),
      },
    });
    const resumed = await session(cookie).expect(200);
    const renewed = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(renewed.absoluteExpiresAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
    expect(renewed.expiresAt).toEqual(renewed.absoluteExpiresAt);
    // The browser cookie moves with the server-side expiry so it never lapses first.
    expect(cookieExpiry(resumed.headers['set-cookie'] as unknown as string[]).getTime()).toBe(
      Math.floor(renewed.absoluteExpiresAt.getTime() / 1000) * 1000,
    );

    // Within the same day the expiry and cookie are not rewritten on every request.
    const repeat = await session(cookie).expect(200);
    expect(repeat.headers['set-cookie']).toBeUndefined();
    expect(
      (await db.session.findUniqueOrThrow({ where: { id: sessionId } })).absoluteExpiresAt,
    ).toEqual(renewed.absoluteExpiresAt);
  });

  it('upgrades a workforce session created under the old seven-day limit', async () => {
    const { cookie, sessionId } = await login('sp-member');
    await db.session.update({
      where: { id: sessionId },
      data: {
        expiresAt: new Date(Date.now() + 2 * 3_600_000),
        absoluteExpiresAt: new Date(Date.now() + DAY),
      },
    });
    await session(cookie).expect(200);
    const upgraded = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(upgraded.absoluteExpiresAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
  });

  it('still ends a workforce session after the inactivity window or a logout', async () => {
    const stale = await login('sp-member');
    await db.session.update({
      where: { id: stale.sessionId },
      data: {
        expiresAt: new Date(Date.now() - 1_000),
        absoluteExpiresAt: new Date(Date.now() - 1_000),
      },
    });
    await session(stale.cookie).expect(401);

    const active = await login('sp-member');
    const csrf = await request(app.getHttpServer())
      .get('/api/v1/auth/csrf')
      .set('Cookie', active.cookie)
      .expect(200);
    // A session due for renewal must not have its cookie re-issued by the logout request.
    await db.session.update({
      where: { id: active.sessionId },
      data: { absoluteExpiresAt: new Date(Date.now() + 60 * DAY) },
    });
    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', active.cookie)
      .set('X-CSRF-Token', csrf.body.token as string)
      .expect(201);
    const cleared = (logout.headers['set-cookie'] as unknown as string[]).filter((value) =>
      value.startsWith('care_session='),
    );
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatch(/^care_session=;/);
    await session(active.cookie).expect(401);
  });

  it('applies the same persistent session to Admin-app accounts', async () => {
    const { cookie, sessionId } = await login('sp-admin');
    const created = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(created.absoluteExpiresAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
    expect(created.expiresAt).toEqual(created.absoluteExpiresAt);

    // An Admin who signed in 10 days ago and left the browser overnight stays signed in.
    await db.session.update({
      where: { id: sessionId },
      data: {
        createdAt: new Date(Date.now() - 10 * DAY),
        lastSeenAt: new Date(Date.now() - 12 * 3_600_000),
        expiresAt: new Date(Date.now() + 80 * DAY),
        absoluteExpiresAt: new Date(Date.now() + 80 * DAY),
      },
    });
    const resumed = await session(cookie).expect(200);
    expect(resumed.headers['set-cookie']).toBeDefined();
    const renewed = await db.session.findUniqueOrThrow({ where: { id: sessionId } });
    expect(renewed.absoluteExpiresAt.getTime() - Date.now()).toBeGreaterThan(89 * DAY);
  });
});
