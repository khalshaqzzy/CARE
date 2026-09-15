import type { INestApplication } from '@nestjs/common';
import { AccountKind, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';
import { resetConfigForTests } from '../../src/config';

const db = new PrismaClient();
let app: INestApplication;
const password = 'push-secret';
const endpoint = 'https://fcm.googleapis.com/fcm/send/browser-profile';
const wnsEndpoint = 'https://wns2-par02p.notify.windows.com/w/?token=abc';
const keys = { p256dh: 'p'.repeat(22), auth: 'a'.repeat(11) };

type Session = { cookies: string[]; csrf: string; accountId: string };

async function seedAccount(noReg: string): Promise<void> {
  const employee = await db.employee.upsert({
    where: { noReg },
    update: {},
    create: { noReg, name: `Push Tester ${noReg}` },
  });
  await db.userAccount.upsert({
    where: { username: noReg },
    update: { status: 'ACTIVE', passwordChangeRequired: false },
    create: {
      username: noReg,
      displayName: `Push Tester ${noReg}`,
      accountKind: AccountKind.WORKFORCE,
      employeeId: employee.id,
      passwordHash: await hash(password),
      passwordChangeRequired: false,
    },
  });
}

async function login(noReg: string): Promise<Session> {
  const logged = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username: noReg, password })
    .expect(201);
  const cookies = logged.headers['set-cookie'] as unknown as string[];
  const csrf = (
    await request(app.getHttpServer()).get('/api/v1/auth/csrf').set('Cookie', cookies).expect(200)
  ).body.token as string;
  return { cookies, csrf, accountId: logged.body.account.id as string };
}

const subscribe = (session: Session, body: Record<string, unknown>) =>
  request(app.getHttpServer())
    .post('/api/v1/notifications/push/subscriptions')
    .set('Cookie', session.cookies)
    .set('X-CSRF-Token', session.csrf)
    .send(body);

const status = (session: Session) =>
  request(app.getHttpServer())
    .get('/api/v1/notifications/push/status')
    .set('Cookie', session.cookies)
    .expect(200);

describe('push subscription enrollment and ownership', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });
  beforeEach(async () => {
    process.env.PUSH_ENDPOINT_HOSTS = 'fcm.googleapis.com,*.notify.windows.com';
    resetConfigForTests();
    await db.pushSubscription.deleteMany();
    await db.session.deleteMany();
    await db.requestThrottle.deleteMany();
    await db.auditEvent.deleteMany();
    await seedAccount('00981001');
    await seedAccount('00981002');
  });

  it('stores an FCM subscription and reports a comparable endpoint hash prefix', async () => {
    const session = await login('00981001');
    const created = await subscribe(session, {
      installationId: 'installation-a',
      endpoint,
      keys,
    }).expect(201);
    expect(created.body).toMatchObject({ active: true });

    const listed = await status(session);
    const subscription = listed.body.subscriptions[0];
    expect(subscription.installationId).toBe('installation-a');
    expect(subscription.endpointHashPrefix).toBe(
      createHash('sha256').update(endpoint).digest('hex').slice(0, 12),
    );
    expect(JSON.stringify(listed.body)).not.toContain(endpoint);
  });

  it('moves the endpoint to a reinstalled installation instead of failing', async () => {
    const session = await login('00981001');
    await subscribe(session, { installationId: 'installation-a', endpoint, keys }).expect(201);
    await subscribe(session, { installationId: 'installation-b', endpoint, keys }).expect(201);

    const rows = await db.pushSubscription.findMany({
      where: { accountId: session.accountId, active: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.installationId).toBe('installation-b');
    expect((await status(session)).body.subscriptions).toHaveLength(1);
  });

  it('moves the endpoint to another account signing in on the same browser profile', async () => {
    const first = await login('00981001');
    const second = await login('00981002');
    await subscribe(first, { installationId: 'shared-browser', endpoint, keys }).expect(201);
    await subscribe(second, { installationId: 'shared-browser', endpoint, keys }).expect(201);

    expect((await status(first)).body.subscriptions).toHaveLength(0);
    const owned = (await status(second)).body.subscriptions;
    expect(owned).toHaveLength(1);
    expect(
      await db.pushSubscription.count({
        where: { endpointHash: createHash('sha256').update(endpoint).digest('hex') },
      }),
    ).toBe(1);
  });

  it('settles a concurrent subscribe for the same endpoint without a server error', async () => {
    const session = await login('00981001');
    const results = await Promise.all([
      subscribe(session, { installationId: 'installation-a', endpoint, keys }),
      subscribe(session, { installationId: 'installation-a', endpoint, keys }),
    ]);
    for (const result of results) expect(result.status).toBeLessThan(300);
    const rows = await db.pushSubscription.findMany({ where: { accountId: session.accountId } });
    expect(rows).toHaveLength(1);
  });

  it('accepts hostnames from allowlisted wildcard providers and rejects others', async () => {
    const session = await login('00981001');
    await subscribe(session, {
      installationId: 'edge-android',
      endpoint: wnsEndpoint,
      keys,
    }).expect(201);
    const rejected = await subscribe(session, {
      installationId: 'evil',
      endpoint: 'https://push.attacker.example/sub',
      keys,
    }).expect(400);
    expect(rejected.body.code).toBe('PUSH_ENDPOINT_NOT_ALLOWED');
    const hostSpoof = await subscribe(session, {
      installationId: 'spoof',
      endpoint: 'https://avoid-notify.windows.com.attacker.example/sub',
      keys,
    }).expect(400);
    expect(hostSpoof.body.code).toBe('PUSH_ENDPOINT_NOT_ALLOWED');
  });

  it('unsubscribes the installation for the current environment only', async () => {
    const session = await login('00981001');
    await subscribe(session, { installationId: 'installation-a', endpoint, keys }).expect(201);
    await request(app.getHttpServer())
      .delete('/api/v1/notifications/push/subscriptions/installation-a')
      .set('Cookie', session.cookies)
      .set('X-CSRF-Token', session.csrf)
      .expect(200);
    expect((await status(session)).body.subscriptions).toHaveLength(0);
    const rows = await db.pushSubscription.findMany({ where: { accountId: session.accountId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.active).toBe(false);
  });
});
