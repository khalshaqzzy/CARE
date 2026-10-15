import type { INestApplication } from '@nestjs/common';
import { AccountKind, PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';

const db = new PrismaClient();
let app: INestApplication;
const ids: Record<string, string> = {};

const login = (username: string, password: string) =>
  request(app.getHttpServer()).post('/api/v1/auth/login').send({ username, password });
const loginEvents = () =>
  db.auditEvent.findMany({ where: { action: 'USER_LOGIN' }, orderBy: { occurredAt: 'asc' } });

describe('Login tracking', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "AuditEvent", "RequestThrottle" CASCADE',
    );
    const snapshot = await db.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'c'.repeat(64), rowCount: 5 },
    });
    const units = {
      a1: await db.organizationUnit.create({
        data: { directorate: 'Dir', division: 'Divisi A', department: 'Dept A1' },
      }),
      a2: await db.organizationUnit.create({
        data: { directorate: 'Dir', division: 'Divisi A', department: 'Dept A2' },
      }),
      b1: await db.organizationUnit.create({
        data: { directorate: 'Dir', division: 'Divisi B', department: 'Dept B1' },
      }),
    };
    const memberHash = await hash('member-secret');
    const members = [
      ['lt-a1', units.a1, 'Seksi 1', 'ACTIVE', false],
      ['lt-a2', units.a1, 'Seksi 2', 'ACTIVE', true],
      ['lt-a3', units.a2, 'Seksi 3', 'ACTIVE', false],
      ['lt-a4', units.a2, 'Seksi 3', 'INACTIVE', false],
      ['lt-b1', units.b1, 'Seksi 4', 'ACTIVE', false],
    ] as const;
    for (const [index, [username, unit, section, status, defaultPassword]] of members.entries()) {
      const employee = await db.employee.create({ data: { noReg: username, name: username } });
      const account = await db.userAccount.create({
        data: {
          username,
          displayName: username,
          employeeId: employee.id,
          passwordHash: defaultPassword ? await hash(username) : memberHash,
          accountKind: AccountKind.WORKFORCE,
          status,
          passwordChangeRequired: defaultPassword,
        },
      });
      ids[username] = account.id;
      await db.organizationMembership.create({
        data: {
          snapshotId: snapshot.id,
          employeeId: employee.id,
          organizationUnitId: unit.id,
          employeeName: username,
          structuralPosition: 'Member',
          section,
          sourceRow: index + 2,
        },
      });
    }
    await db.userAccount.create({
      data: {
        username: 'lt-admin',
        displayName: 'Login Tracking Admin',
        passwordHash: await hash('admin-secret'),
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('writes sanitized USER_LOGIN events without leaking unknown identifiers or passwords', async () => {
    await login('lt-a1', 'wrong-secret').expect(401);
    await login('ghost-user', 'ghost-secret').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login/start')
      .send({ noReg: 'ghost-noreg' })
      .expect(400);
    const failures = await loginEvents();
    expect(failures.map((event) => [event.result, event.resourceId, event.summary])).toEqual([
      ['FAILED', ids['lt-a1'], { method: 'PASSWORD' }],
      ['FAILED', null, { method: 'PASSWORD' }],
      ['FAILED', null, { method: 'DEFAULT_PASSWORD' }],
    ]);
    const serialized = JSON.stringify(failures);
    for (const secret of ['wrong-secret', 'ghost-user', 'ghost-secret', 'ghost-noreg'])
      expect(serialized).not.toContain(secret);
    expect(failures.every((event) => event.actorId === null && event.ipHash?.length === 64)).toBe(
      true,
    );
    expect(
      (await db.userAccount.findUniqueOrThrow({ where: { id: ids['lt-a1'] } })).lastLoginAt,
    ).toBeNull();
  });

  it('sets first and last login on success without bumping the account version', async () => {
    const before = await db.userAccount.findUniqueOrThrow({ where: { id: ids['lt-a1'] } });
    await login('lt-a1', 'member-secret').expect(201);
    const first = await db.userAccount.findUniqueOrThrow({ where: { id: ids['lt-a1'] } });
    expect(first.firstLoginAt).not.toBeNull();
    expect(first.lastLoginAt).toEqual(first.firstLoginAt);
    expect(first.version).toBe(before.version);
    expect(first.updatedAt).toEqual(before.updatedAt);

    await login('lt-a1', 'member-secret').expect(201);
    const second = await db.userAccount.findUniqueOrThrow({ where: { id: ids['lt-a1'] } });
    expect(second.firstLoginAt).toEqual(first.firstLoginAt);
    expect(second.lastLoginAt!.getTime()).toBeGreaterThan(first.lastLoginAt!.getTime());

    const started = await request(app.getHttpServer())
      .post('/api/v1/auth/login/start')
      .send({ noReg: 'lt-a2' })
      .expect(201);
    expect(started.body.next).toBe('CHANGE_PASSWORD');

    const successes = await db.auditEvent.findMany({
      where: { action: 'USER_LOGIN', result: 'SUCCESS' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(successes.map((event) => [event.actorId, event.resourceId, event.summary])).toEqual([
      [ids['lt-a1'], ids['lt-a1'], { method: 'PASSWORD', firstLogin: true }],
      [ids['lt-a1'], ids['lt-a1'], { method: 'PASSWORD', firstLogin: false }],
      [ids['lt-a2'], ids['lt-a2'], { method: 'DEFAULT_PASSWORD', firstLogin: true }],
    ]);
    expect(successes.every((event) => event.sessionRef?.length === 64)).toBe(true);
    expect(JSON.stringify(successes)).not.toContain('member-secret');
  });

  it('filters accounts by unit and login state and summarizes each division', async () => {
    const admin = (await login('lt-admin', 'admin-secret').expect(201)).headers[
      'set-cookie'
    ] as unknown as string[];
    const usernames = async (query: Record<string, string>) =>
      (
        await request(app.getHttpServer())
          .get('/api/v1/admin/accounts')
          .query(query)
          .set('Cookie', admin)
          .expect(200)
      ).body.items.map((item: { username: string }) => item.username);

    expect(await usernames({ division: 'Divisi A', loggedIn: 'true' })).toEqual(['lt-a1', 'lt-a2']);
    expect(await usernames({ division: 'Divisi A', loggedIn: 'false' })).toEqual([
      'lt-a3',
      'lt-a4',
    ]);
    expect(
      await usernames({
        division: 'Divisi A',
        loggedIn: 'false',
        kind: 'WORKFORCE',
        status: 'ACTIVE',
      }),
    ).toEqual(['lt-a3']);
    expect(await usernames({ division: 'Divisi A', department: 'Dept A1' })).toEqual([
      'lt-a1',
      'lt-a2',
    ]);
    expect(await usernames({ division: 'Divisi A', section: 'Seksi 2' })).toEqual(['lt-a2']);
    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/accounts')
      .query({ search: 'lt-a1' })
      .set('Cookie', admin)
      .expect(200);
    expect(listed.body.items[0].lastLoginAt).toEqual(expect.any(String));

    const summary = async (query: Record<string, string>) =>
      (
        await request(app.getHttpServer())
          .get('/api/v1/admin/accounts/login-summary')
          .query(query)
          .set('Cookie', admin)
          .expect(200)
      ).body;
    const divisionA = await summary({ division: 'Divisi A' });
    expect(divisionA).toMatchObject({
      division: 'Divisi A',
      department: null,
      total: 3,
      loggedIn: 2,
      notLoggedIn: 1,
      groups: [
        { name: 'Dept A1', total: 2, loggedIn: 2, notLoggedIn: 0 },
        { name: 'Dept A2', total: 1, loggedIn: 0, notLoggedIn: 1 },
      ],
    });
    expect(divisionA.trackingSince).toEqual(expect.any(String));
    expect((await summary({})).groups).toEqual([
      { name: 'Divisi A', total: 3, loggedIn: 2, notLoggedIn: 1 },
      { name: 'Divisi B', total: 1, loggedIn: 0, notLoggedIn: 1 },
    ]);
    expect((await summary({ division: 'Divisi A', department: 'Dept A1' })).groups).toEqual([
      { name: 'Seksi 1', total: 1, loggedIn: 1, notLoggedIn: 0 },
      { name: 'Seksi 2', total: 1, loggedIn: 1, notLoggedIn: 0 },
    ]);

    const member = (await login('lt-b1', 'member-secret').expect(201)).headers[
      'set-cookie'
    ] as unknown as string[];
    const denied = await request(app.getHttpServer())
      .get('/api/v1/admin/accounts/login-summary')
      .set('Cookie', member);
    expect([403, 404]).toContain(denied.status);
  });
});
