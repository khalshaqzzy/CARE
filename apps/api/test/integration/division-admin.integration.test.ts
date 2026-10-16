import type { INestApplication } from '@nestjs/common';
import {
  AccountKind,
  HandlerType,
  PrismaClient,
  Severity,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { hash } from 'argon2';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';

const db = new PrismaClient();
let app: INestApplication;
const ids: Record<string, string> = {};
let seq = 0;

const http = () => request(app.getHttpServer());
const cookiesOf = (response: { headers: Record<string, unknown> }) =>
  response.headers['set-cookie'] as unknown as string[];
const login = async (username: string, password: string) =>
  cookiesOf(await http().post('/api/v1/auth/login').send({ username, password }).expect(201));
const csrf = async (cookies: string[]) =>
  (await http().get('/api/v1/auth/csrf').set('Cookie', cookies).expect(200)).body.token as string;
const provision = async (cookies: string[], body: Record<string, unknown>, key: string) =>
  http()
    .put('/api/v1/admin/division-admins')
    .set('Cookie', cookies)
    .set('X-CSRF-Token', await csrf(cookies))
    .set('Idempotency-Key', key)
    .send({ reason: 'Admin divisi baru', expectedCurrentAccountId: null, ...body });

async function voice(
  division: string,
  overrides: Partial<{
    visibility: VoiceVisibility;
    severity: Severity;
    status: VoiceStatus;
    tierDueAt: Date;
  }> = {},
) {
  seq += 1;
  const created = await db.voice.create({
    data: {
      displayId: `CARE-202610-${String(seq).padStart(6, '0')}`,
      reporterId: ids.reporter!,
      visibility: overrides.visibility ?? VoiceVisibility.GENERAL,
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: 'da-reporter',
      reporterNameSnapshot: 'Rina Reporter',
      reporterDirectorateSnapshot: 'Manufacturing',
      reporterDivisionSnapshot: division,
      reporterDepartmentSnapshot: 'Assembly',
      reporterSectionSnapshot: 'Seksi 1',
      routeOwnerId: ids.manager!,
      status: overrides.status ?? VoiceStatus.OPEN,
      handlerType: HandlerType.MANAGER,
      locationDetail: 'Line 1',
      title: `Voice ${seq} ${division}`,
      detail: 'Detail voice',
      severity: overrides.severity ?? Severity.MEDIUM,
      anonymousAlias: `R-${seq}`,
      tierDueAt: overrides.tierDueAt ?? null,
    },
  });
  ids[`voice${seq}`] = created.id;
  return created;
}

describe('Division Admin', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "Voice", "AuditEvent", "RequestThrottle", "IdempotencyRecord" CASCADE',
    );
    const snapshot = await db.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'd'.repeat(64), rowCount: 2 },
    });
    const unit = await db.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Divisi A', department: 'Assembly' },
    });
    const unitB = await db.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Divisi B', department: 'Painting' },
    });
    const passwordHash = await hash('secret-pass');
    for (const [key, username, kind, position] of [
      ['admin', 'da-care-admin', AccountKind.CARE_ADMIN, null],
      ['reporter', 'da-reporter', AccountKind.WORKFORCE, 'Member'],
      ['manager', 'da-manager', AccountKind.WORKFORCE, 'Department Head'],
      ['other', 'da-other', AccountKind.WORKFORCE, 'Member'],
    ] as const) {
      const employee = position
        ? await db.employee.create({ data: { noReg: username, name: username } })
        : null;
      const account = await db.userAccount.create({
        data: {
          username,
          displayName: username,
          passwordHash,
          accountKind: kind,
          passwordChangeRequired: false,
          employeeId: employee?.id ?? null,
        },
      });
      ids[key] = account.id;
      if (employee)
        await db.organizationMembership.create({
          data: {
            snapshotId: snapshot.id,
            employeeId: employee.id,
            organizationUnitId: key === 'other' ? unitB.id : unit.id,
            employeeName: username,
            structuralPosition: position!,
            section: 'Seksi 1',
            sourceRow: Object.keys(ids).length + 2,
          },
        });
    }
    const general = await voice('Divisi A', { status: VoiceStatus.RESPONDED });
    const conversation = await db.conversation.create({ data: { voiceId: general.id } });
    await db.message.create({
      data: {
        conversationId: conversation.id,
        senderId: ids.manager!,
        senderAccountKind: AccountKind.WORKFORCE,
        senderCapabilities: ['MANAGER'],
        senderNameSnapshot: 'Budi Manager',
        text: 'Sedang kami cek di lapangan',
      },
    });
    await voice('Divisi A', {
      severity: Severity.CRITICAL,
      status: VoiceStatus.RESPONDED,
      tierDueAt: new Date(Date.now() - 3_600_000),
    });
    await db.voice.update({ where: { id: ids.voice2! }, data: { currentHandlerId: ids.manager! } });
    await voice('Divisi A', { status: VoiceStatus.CLOSED });
    await voice('Divisi A', { visibility: VoiceVisibility.PRIVATE });
    await voice('Divisi B');
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('lets the CARE Admin create one Division Admin per division', async () => {
    const admin = await login('da-care-admin', 'secret-pass');
    const created = await provision(
      admin,
      {
        directorate: 'Manufacturing',
        division: 'Divisi A',
        username: 'Admin.DivA',
        displayName: 'Admin Divisi A',
      },
      'division-admin-a-1',
    );
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({
      account: { username: 'admin.diva', accountKind: 'DIVISION_ADMIN', status: 'ACTIVE' },
      temporaryPassword: 'admin.diva',
      passwordChangeRequired: true,
    });
    ids.divisionAdmin = created.body.account.id;

    for (const [body, code] of [
      [{ division: 'Divisi A', username: 'admin.diva2' }, 'VERSION_CONFLICT'],
      [{ division: 'Divisi B', username: 'da-reporter' }, 'USERNAME_EXISTS'],
      [{ division: 'Divisi Z', username: 'admin.divz' }, 'DIVISION_UNKNOWN'],
    ] as const) {
      const rejected = await provision(
        admin,
        { directorate: 'Manufacturing', displayName: 'X', ...body },
        `division-admin-${body.username}`,
      );
      expect(rejected.body.code).toBe(code);
    }

    const list = await http().get('/api/v1/admin/division-admins').set('Cookie', admin).expect(200);
    expect(
      list.body.map((row: { division: string; account: { username: string } | null }) => [
        row.division,
        row.account?.username ?? null,
      ]),
    ).toEqual([
      ['Divisi A', 'admin.diva'],
      ['Divisi B', null],
    ]);
  });

  it('reads only its division, never acts, and exports Voices with chat', async () => {
    await http().post('/api/v1/auth/login/start').send({ noReg: 'admin.diva' }).expect(400);
    const restricted = await login('admin.diva', 'admin.diva');
    await http()
      .post('/api/v1/auth/change-password')
      .set('Cookie', restricted)
      .set('X-CSRF-Token', await csrf(restricted))
      .send({ currentPassword: 'admin.diva', newPassword: 'divisi-a-secret' })
      .expect(201);
    const cookies = await login('admin.diva', 'divisi-a-secret');
    const session = await http().get('/api/v1/auth/session').set('Cookie', cookies).expect(200);
    expect(session.body.capabilities).toEqual(['DIVISION_ADMIN']);

    const list = await http().get('/api/v1/voices').set('Cookie', cookies).expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [ids.voice1, ids.voice2, ids.voice3].sort(),
    );

    const detail = await http()
      .get(`/api/v1/voices/${ids.voice1}`)
      .set('Cookie', cookies)
      .expect(200);
    expect(detail.body).toMatchObject({
      audience: 'LEADERSHIP_GENERAL_READ_ONLY',
      reporter: { name: 'Rina Reporter', noReg: 'da-reporter' },
      availableActions: [],
    });
    const messages = await http()
      .get(`/api/v1/voices/${ids.voice1}/messages`)
      .set('Cookie', cookies)
      .expect(200);
    expect(messages.body.items[0].text).toBe('Sedang kami cek di lapangan');
    for (const hidden of [ids.voice4, ids.voice5])
      await http().get(`/api/v1/voices/${hidden}`).set('Cookie', cookies).expect(404);

    const token = await csrf(cookies);
    await http()
      .post(`/api/v1/voices/${ids.voice1}/proceed`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', token)
      .set('Idempotency-Key', 'division-admin-proceed')
      .send({ days: 3, version: 1 })
      .expect(404);
    const message = await http()
      .post(`/api/v1/voices/${ids.voice1}/messages`)
      .set('Cookie', cookies)
      .set('X-CSRF-Token', token)
      .set('Idempotency-Key', 'division-admin-message')
      .field('text', 'Coba');
    expect([403, 404]).toContain(message.status);
    await http().get('/api/v1/admin/overview').set('Cookie', cookies).expect(404);

    const overview = await http()
      .get('/api/v1/division-admin/overview')
      .set('Cookie', cookies)
      .expect(200);
    expect(overview.body).toMatchObject({
      directorate: 'Manufacturing',
      division: 'Divisi A',
      general: {
        total: 3,
        open: 0,
        responded: 2,
        inProgress: 0,
        closed: 1,
        overdue: 1,
        dueSoon: 0,
        critical: 1,
      },
      private: { total: 1, active: 1 },
      severity: { low: 0, medium: 2, high: 0, critical: 1 },
      destinations: [{ department: null, count: 3 }],
      topReporters: [{ name: 'Rina Reporter', department: 'Assembly', count: 3 }],
      topResponders: [{ name: 'da-manager', count: 1, closed: 0 }],
    });
    expect(overview.body.trend).toHaveLength(8);
    expect(overview.body.trend.at(-1).count).toBe(3);

    const exported = await http()
      .get('/api/v1/division-admin/export')
      .query({ statusGroup: 'ACTIVE' })
      .set('Cookie', cookies)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(exported.headers['content-disposition']).toMatch(/voice-Divisi-A-.*\.xlsx/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.body as ExcelJS.Buffer);
    const titles = workbook
      .getWorksheet('Voice')!
      .getColumn('F')
      .values.slice(2)
      .map((value) => String(value));
    expect(titles.sort()).toEqual(['Voice 1 Divisi A', 'Voice 2 Divisi A']);
    expect(workbook.getWorksheet('Voice')!.getRow(2).getCell('K').value).toBe('Rina Reporter');
    const chat = workbook.getWorksheet('Chat')!.getRow(2);
    expect([chat.getCell('C').value, chat.getCell('F').value]).toEqual([
      'Budi Manager',
      'Sedang kami cek di lapangan',
    ]);
    expect(
      await db.auditEvent.count({
        where: { action: 'DIVISION_VOICE_EXPORT', actorId: ids.divisionAdmin },
      }),
    ).toBe(1);

    const member = await login('da-reporter', 'secret-pass');
    await http().get('/api/v1/division-admin/overview').set('Cookie', member).expect(404);

    // Accounts of its own division only, read-only, with login state.
    const usernames = async (query: Record<string, string>) =>
      (
        await http()
          .get('/api/v1/division-admin/accounts')
          .query(query)
          .set('Cookie', cookies)
          .expect(200)
      ).body.items.map((item: { username: string }) => item.username);
    expect(await usernames({})).toEqual(['da-manager', 'da-reporter']);
    expect(await usernames({ loggedIn: 'true' })).toEqual(['da-reporter']);
    expect(await usernames({ loggedIn: 'false' })).toEqual(['da-manager']);
    const summary = await http()
      .get('/api/v1/division-admin/accounts/login-summary')
      .set('Cookie', cookies)
      .expect(200);
    expect(summary.body).toMatchObject({
      division: 'Divisi A',
      total: 2,
      loggedIn: 1,
      notLoggedIn: 1,
      groups: [{ name: 'Assembly', total: 2, loggedIn: 1, notLoggedIn: 1 }],
    });
    await http().get('/api/v1/admin/accounts').set('Cookie', cookies).expect(404);
    await http().get('/api/v1/division-admin/accounts').set('Cookie', member).expect(404);
  });

  it('replaces the Division Admin and keeps only one active per division', async () => {
    const admin = await login('da-care-admin', 'secret-pass');
    const previous = await login('admin.diva', 'divisi-a-secret');
    const replaced = await provision(
      admin,
      {
        directorate: 'Manufacturing',
        division: 'Divisi A',
        username: 'admin.diva.baru',
        displayName: 'Admin Divisi A baru',
        expectedCurrentAccountId: ids.divisionAdmin,
      },
      'division-admin-a-2',
    );
    expect(replaced.status).toBe(200);
    const old = await db.userAccount.findUniqueOrThrow({ where: { id: ids.divisionAdmin } });
    expect(old.status).toBe('INACTIVE');
    await http().get('/api/v1/division-admin/overview').set('Cookie', previous).expect(401);

    const reactivate = await http()
      .post(`/api/v1/admin/accounts/${ids.divisionAdmin}/status`)
      .set('Cookie', admin)
      .set('X-CSRF-Token', await csrf(admin))
      .set('Idempotency-Key', 'division-admin-reactivate')
      .send({ status: 'ACTIVE', reason: 'Kembali', expectedVersion: old.version });
    expect(reactivate.body.code).toBe('DIVISION_ADMIN_ACTIVE');
  });
});
