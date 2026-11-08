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
const login = async (username: string) =>
  (await http().post('/api/v1/auth/login').send({ username, password: 'secret-pass' }).expect(201))
    .headers['set-cookie'] as unknown as string[];

async function voice(
  overrides: Partial<{
    visibility: VoiceVisibility;
    severity: Severity;
    status: VoiceStatus;
    title: string;
    legacySource: string;
    legacyId: string;
    submittedAt: Date;
  }> = {},
) {
  seq += 1;
  return db.voice.create({
    data: {
      displayId: `CARE-202611-${String(seq).padStart(6, '0')}`,
      reporterId: ids.reporter!,
      visibility: overrides.visibility ?? VoiceVisibility.GENERAL,
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: 'rp-reporter',
      reporterNameSnapshot: 'Rina Reporter',
      reporterDirectorateSnapshot: 'Manufacturing',
      reporterDivisionSnapshot: 'Divisi A',
      reporterDepartmentSnapshot: 'Assembly',
      routeOwnerId: ids.manager!,
      status: overrides.status ?? VoiceStatus.OPEN,
      handlerType: HandlerType.MANAGER,
      locationDetail: 'Line 1',
      title: overrides.title ?? `Voice ${seq}`,
      detail: 'Detail voice',
      severity: overrides.severity ?? Severity.MEDIUM,
      categoryKey: overrides.visibility === VoiceVisibility.PRIVATE ? null : 'FACILITY',
      categoryNameSnapshot: overrides.visibility === VoiceVisibility.PRIVATE ? null : 'Fasilitas',
      anonymousAlias: `R-${seq}`,
      legacySource: overrides.legacySource ?? null,
      legacyId: overrides.legacyId ?? null,
      submittedAt: overrides.submittedAt ?? new Date('2026-11-02T03:00:00Z'),
    },
  });
}

describe('CARE Admin reports', () => {
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "Voice", "AuditEvent", "RequestThrottle", "IdempotencyRecord" CASCADE',
    );
    const snapshot = await db.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'r'.repeat(64), rowCount: 3 },
    });
    const unit = await db.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Divisi A', department: 'Assembly' },
    });
    const passwordHash = await hash('secret-pass');
    for (const [key, username, kind, position, loggedIn] of [
      ['admin', 'rp-admin', AccountKind.CARE_ADMIN, null, true],
      ['reporter', 'rp-reporter', AccountKind.WORKFORCE, 'Member', true],
      ['manager', 'rp-manager', AccountKind.WORKFORCE, 'Department Head', false],
      ['leader', 'rp-leader', AccountKind.WORKFORCE, 'Group Leader', false],
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
          lastLoginAt: loggedIn ? new Date('2026-11-01T01:00:00Z') : null,
        },
      });
      ids[key] = account.id;
      if (employee)
        await db.organizationMembership.create({
          data: {
            snapshotId: snapshot.id,
            employeeId: employee.id,
            organizationUnitId: unit.id,
            employeeName: username,
            structuralPosition: position!,
            section: 'Seksi 1',
            sourceRow: Object.keys(ids).length + 2,
          },
        });
    }
    const timed = await voice({ title: 'Lampu loading dock mati', status: VoiceStatus.RESPONDED });
    await db.voiceResponseTiming.create({
      data: {
        voiceId: timed.id,
        firstResponseAt: new Date('2026-11-02T05:00:00Z'),
        lastResponseAt: new Date('2026-11-02T05:00:00Z'),
      },
    });
    await voice({ severity: Severity.CRITICAL });
    await voice({ status: VoiceStatus.CLOSED, severity: Severity.LOW });
    await voice({ visibility: VoiceVisibility.PRIVATE, severity: Severity.HIGH });
    await voice({ status: VoiceStatus.CLOSED, legacySource: 'PADi', legacyId: 'PADI-0001' });
    await voice({ status: VoiceStatus.CLOSED, legacySource: 'EPKD', legacyId: 'EPKD-0002' });
  });

  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });

  it('summarizes exactly the Voices the explorer filters select', async () => {
    const admin = await login('rp-admin');
    const care = await http()
      .get('/api/v1/admin/voices/summary?origin=CARE')
      .set('Cookie', admin)
      .expect(200);
    expect(care.body).toMatchObject({
      total: 4,
      migrated: 0,
      status: [
        { key: 'OPEN', value: 2 },
        { key: 'RESPONDED', value: 1 },
        { key: 'IN_PROGRESS', value: 0 },
        { key: 'CLOSED', value: 1 },
      ],
      severity: [
        { key: 'CRITICAL', value: 1 },
        { key: 'HIGH', value: 1 },
        { key: 'MEDIUM', value: 1 },
        { key: 'LOW', value: 1 },
      ],
      // Private Voices carry no category; only the three General ones count here.
      category: [{ key: 'FACILITY', value: 3 }],
      averageResponseSeconds: 7200,
      responseSampleCount: 1,
    });

    const searched = await http()
      .get('/api/v1/admin/voices/summary?origin=CARE&search=loading%20dock')
      .set('Cookie', admin)
      .expect(200);
    expect(searched.body.total).toBe(1);

    const migrated = await http()
      .get('/api/v1/admin/voices/summary?origin=MIGRATED')
      .set('Cookie', admin)
      .expect(200);
    expect(migrated.body).toMatchObject({ total: 2, migrated: 2, responseSampleCount: 0 });

    const everything = await http().get('/api/v1/admin/voices/summary').set('Cookie', admin);
    expect(everything.body).toMatchObject({ total: 6, migrated: 2 });
  });

  it('lists migrated Voices apart, with their earlier ID', async () => {
    const admin = await login('rp-admin');
    const list = await http()
      .get('/api/v1/voices?origin=MIGRATED&sort=newest')
      .set('Cookie', admin)
      .expect(200);
    expect(list.body.items.map((item: { legacyId: string }) => item.legacyId).sort()).toEqual([
      'EPKD-0002',
      'PADI-0001',
    ]);
    const care = await http().get('/api/v1/voices?origin=CARE').set('Cookie', admin).expect(200);
    expect(care.body.items).toHaveLength(4);
    await http().get('/api/v1/voices?origin=OLD').set('Cookie', admin).expect(400);
  });

  it('exports the filtered Voices without Private reporter identity, audited', async () => {
    const admin = await login('rp-admin');
    const file = await http()
      .get('/api/v1/admin/voices/export?origin=CARE')
      .set('Cookie', admin)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(file.headers['content-disposition']).toMatch(/voice-\d{4}-\d{2}-\d{2}\.xlsx/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as Buffer);
    const sheet = workbook.getWorksheet('Voice')!;
    expect(sheet.rowCount).toBe(5);
    const rows = sheet.getSheetValues().slice(2) as unknown[][];
    const reporterColumn = (sheet.getRow(1).values as unknown[]).indexOf('Nama pelapor');
    const visibilityColumn = (sheet.getRow(1).values as unknown[]).indexOf('Visibility');
    const privateRow = rows.find((row) => row[visibilityColumn] === 'PRIVATE')!;
    expect(privateRow[reporterColumn]).toBe('Private');
    expect(
      await db.auditEvent.count({ where: { action: 'ADMIN_VOICE_EXPORT', actorId: ids.admin } }),
    ).toBe(1);
  });

  it('counts accounts by status, kind and role with logins', async () => {
    const admin = await login('rp-admin');
    const summary = await http()
      .get('/api/v1/admin/accounts/summary?kind=WORKFORCE')
      .set('Cookie', admin)
      .expect(200);
    expect(summary.body).toMatchObject({
      total: 3,
      loggedIn: 1,
      kind: [{ key: 'WORKFORCE', total: 3, loggedIn: 1 }],
    });
    const role = Object.fromEntries(
      (summary.body.role as { key: string; total: number }[]).map((row) => [row.key, row.total]),
    );
    expect(role).toEqual({
      MEMBER: 1,
      GROUP_LEADER: 1,
      SECTION_HEAD: 0,
      MANAGER: 1,
      DIVISION: 0,
    });
  });

  it('keeps reports to the CARE Admin', async () => {
    const manager = await login('rp-manager');
    await http().get('/api/v1/admin/voices/summary').set('Cookie', manager).expect(404);
    await http().get('/api/v1/admin/voices/export').set('Cookie', manager).expect(404);
    await http().get('/api/v1/admin/accounts/summary').set('Cookie', manager).expect(404);
  });
});
