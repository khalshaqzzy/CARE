import type { INestApplication } from '@nestjs/common';
import {
  AccountKind,
  HandlerType,
  PrismaClient,
  Severity,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { hash } from 'argon2';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/bootstrap';
import { ORGANIZATION_HEADERS, ORGANIZATION_TIER_HEADERS } from '../../src/imports/imports.service';

const db = new PrismaClient();
let app: INestApplication;
let admin: string[];

const http = () => request(app.getHttpServer());
const csrf = async (cookies: string[]) =>
  (await http().get('/api/v1/auth/csrf').set('Cookie', cookies).expect(200)).body.token as string;

// Noreg, Nama, Posisi, Directorat, Division, Department, Section, Area, Line
const rows = [
  [
    'ai-gl-1',
    'Gita Lengkap',
    'Group Leader',
    'Manufacturing',
    'Divisi A',
    'Assembly',
    'Seksi 1',
    'Karawang 1',
    'Line 1',
  ],
  [
    'ai-gl-2',
    'Gani Tanpa Line',
    'Group Leader',
    'Manufacturing',
    'Divisi A',
    'Assembly',
    'Seksi 1',
    'Karawang 1',
    '',
  ],
  [
    'ai-sh-1',
    'Sari Tanpa Seksi',
    'Section Head',
    'Manufacturing',
    'Divisi A',
    'Assembly',
    '',
    'Karawang 1',
    '',
  ],
  [
    'ai-dh-1',
    'Dedi Tanpa Dept',
    'Department Head',
    'Manufacturing',
    'Divisi A',
    '',
    'Seksi 1',
    'Karawang 1',
    '',
  ],
  [
    'ai-dv-1',
    'Dina Tanpa Divisi',
    'Division Head',
    'Manufacturing',
    '',
    'Assembly',
    'Seksi 1',
    'Karawang 1',
    '',
  ],
  ['ai-mb-1', 'Mira Member', 'Member', 'Manufacturing', '', '', '', 'Karawang 1', ''],
];

describe('Admin improvements', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "ImportBatch", "Voice", "AuditEvent", "RequestThrottle", "IdempotencyRecord" CASCADE',
    );
    await db.userAccount.create({
      data: {
        username: 'ai-admin',
        displayName: 'AI Admin',
        passwordHash: await hash('admin-secret'),
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
    admin = (
      await http()
        .post('/api/v1/auth/login')
        .send({ username: 'ai-admin', password: 'admin-secret' })
        .expect(201)
    ).headers['set-cookie'] as unknown as string[];
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('lists incomplete leaders, blocks confirmation, and applies admin edits', async () => {
    const csv = [
      [...ORGANIZATION_HEADERS, ...ORGANIZATION_TIER_HEADERS].join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');
    const preview = await http()
      .post('/api/v1/admin/organization-imports/preview')
      .set('Cookie', admin)
      .set('X-CSRF-Token', await csrf(admin))
      .attach('file', Buffer.from(csv), { filename: 'org.csv', contentType: 'text/csv' })
      .expect(201);
    const id = preview.body.id as string;
    expect(
      preview.body.summary.abnormalities.map((item: { noReg: string; missing: string[] }) => [
        item.noReg,
        item.missing,
      ]),
    ).toEqual([
      ['ai-gl-2', ['line']],
      ['ai-sh-1', ['section']],
      ['ai-dh-1', ['department']],
      ['ai-dv-1', ['division']],
    ]);

    const confirm = (version: number) =>
      csrf(admin).then((token) =>
        http()
          .post(`/api/v1/admin/organization-imports/${id}/confirm`)
          .set('Cookie', admin)
          .set('X-CSRF-Token', token)
          .set('Idempotency-Key', crypto.randomUUID())
          .send({ checksum: preview.body.checksum, expectedVersion: version }),
      );
    expect((await confirm(preview.body.version)).body.code).toBe('IMPORT_INCOMPLETE_ORGANIZATION');

    const correct = async (noReg: string, body: Record<string, string>) =>
      http()
        .put(`/api/v1/admin/organization-imports/${id}/rows/${noReg}`)
        .set('Cookie', admin)
        .set('X-CSRF-Token', await csrf(admin))
        .send(body);
    expect((await correct('ai-mb-1', { section: 'X' })).status).toBe(404);
    expect((await correct('ai-gl-2', { section: 'Seksi 9' })).body.code).toBe('VALIDATION_ERROR');
    await correct('ai-gl-2', { line: 'Line 9' }).then((res) => expect(res.status).toBe(200));
    await correct('ai-sh-1', { section: 'Seksi 2' });
    await correct('ai-dh-1', { department: 'Quality Gate' });
    const last = await correct('ai-dv-1', { division: 'Divisi Q' });
    expect(last.body.summary.abnormalities).toEqual([]);
    expect(last.body).not.toHaveProperty('corrections');

    expect((await confirm(last.body.version)).status).toBe(202);
    await expect
      .poll(async () => (await db.importBatch.findUniqueOrThrow({ where: { id } })).status, {
        timeout: 20000,
      })
      .toBe('CONFIRMED');
    const membership = (noReg: string) =>
      db.organizationMembership.findFirstOrThrow({
        where: { employee: { noReg }, snapshot: { status: 'ACTIVE' } },
        include: { organizationUnit: true },
      });
    expect((await membership('ai-gl-2')).lineName).toBe('Line 9');
    expect((await membership('ai-sh-1')).section).toBe('Seksi 2');
    expect((await membership('ai-dh-1')).organizationUnit.department).toBe('Quality Gate');
    expect((await membership('ai-dv-1')).organizationUnit.division).toBe('Divisi Q');
    expect(
      await db.auditEvent.count({ where: { action: 'ORGANIZATION_IMPORT_ROW_CORRECTED' } }),
    ).toBe(4);
  });

  it('summarizes responder logins by level within the unit filters', async () => {
    await db.userAccount.updateMany({
      where: { username: { in: ['ai-gl-1', 'ai-dh-1'] } },
      data: { lastLoginAt: new Date(), firstLoginAt: new Date() },
    });
    const summary = async (query: Record<string, string>) =>
      (
        await http()
          .get('/api/v1/admin/accounts/responder-summary')
          .query(query)
          .set('Cookie', admin)
          .expect(200)
      ).body;
    expect(await summary({})).toEqual({
      total: 5,
      loggedIn: 2,
      levels: [
        { level: 'GROUP_LEADER', label: 'Group Leader', total: 2, loggedIn: 1 },
        { level: 'SECTION_HEAD', label: 'Section Head', total: 1, loggedIn: 0 },
        { level: 'MANAGER', label: 'Department Head', total: 1, loggedIn: 1 },
        { level: 'DIVISION', label: 'Deputy / Division Head', total: 1, loggedIn: 0 },
      ],
    });
    expect((await summary({ division: 'Divisi Q' })).total).toBe(1);
    expect((await summary({ division: 'Divisi A', section: 'Seksi 1' })).total).toBe(3);

    const usernames = async (query: Record<string, string>) =>
      (
        await http().get('/api/v1/admin/accounts').query(query).set('Cookie', admin).expect(200)
      ).body.items.map((item: { username: string }) => item.username);
    expect(await usernames({ responderLevel: 'ANY', loggedIn: 'false' })).toEqual([
      'ai-dv-1',
      'ai-gl-2',
      'ai-sh-1',
    ]);
    expect(await usernames({ responderLevel: 'GROUP_LEADER' })).toEqual(['ai-gl-1', 'ai-gl-2']);
    const invalid = await http()
      .get('/api/v1/admin/accounts')
      .query({ responderLevel: 'BOSS' })
      .set('Cookie', admin);
    expect(invalid.body.code).toBe('RESPONDER_LEVEL_INVALID');
  });

  it('gives admins the rating, the step deadline and who did each step', async () => {
    const reporter = await db.userAccount.findUniqueOrThrow({ where: { username: 'ai-gl-1' } });
    const pic = await db.userAccount.findUniqueOrThrow({ where: { username: 'ai-dh-1' } });
    const tierDueAt = new Date(Date.now() + 3_600_000);
    const voice = await db.voice.create({
      data: {
        displayId: 'CARE-202610-990001',
        reporterId: reporter.id,
        visibility: VoiceVisibility.GENERAL,
        area: 'KARAWANG_1',
        reporterNoRegSnapshot: 'ai-gl-1',
        reporterNameSnapshot: 'Gita Lengkap',
        reporterDirectorateSnapshot: 'Manufacturing',
        reporterDivisionSnapshot: 'Divisi A',
        reporterDepartmentSnapshot: 'Assembly',
        routeOwnerId: pic.id,
        currentHandlerId: pic.id,
        status: VoiceStatus.CLOSED,
        handlerType: HandlerType.MANAGER,
        locationDetail: 'Line 1',
        title: 'Rating voice',
        detail: 'Detail',
        severity: Severity.MEDIUM,
        anonymousAlias: 'R-1',
        tierDueAt,
      },
    });
    const cycle = await db.closureCycle.create({
      data: { voiceId: voice.id, cycleNumber: 1, actorId: pic.id, note: 'Sudah diperbaiki' },
    });
    await db.rating.create({
      data: { closureCycleId: cycle.id, reporterId: reporter.id, score: 4, feedback: 'Cepat' },
    });
    await db.voiceEvent.create({
      data: {
        voiceId: voice.id,
        type: VoiceEventType.CLOSED,
        actorId: pic.id,
        actorAccountKind: AccountKind.WORKFORCE,
        actorCapabilities: ['MANAGER'],
        payload: {},
      },
    });

    const list = await http()
      .get('/api/v1/voices')
      .query({ search: 'CARE-202610-990001' })
      .set('Cookie', admin)
      .expect(200);
    expect(list.body.items[0].ratingScore).toBe(4);
    const detail = await http().get(`/api/v1/voices/${voice.id}`).set('Cookie', admin).expect(200);
    expect(detail.body.tierDueAt).toBe(tierDueAt.toISOString());
    expect(detail.body.closureCycles[0].rating).toMatchObject({ score: 4, feedback: 'Cepat' });
    const timeline = await http()
      .get(`/api/v1/voices/${voice.id}/timeline`)
      .set('Cookie', admin)
      .expect(200);
    expect(timeline.body.items[0].actorName).toBe('Dedi Tanpa Dept');
  });
});
