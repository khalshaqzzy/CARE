import { AccountKind, PrismaClient, Severity } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { EscalationSettingsService } from '../../src/escalation/escalation-settings.service';
import {
  ImportsService,
  ORGANIZATION_HEADERS,
  ORGANIZATION_TIER_HEADERS,
} from '../../src/imports/imports.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const imports = new ImportsService(prisma as never);
const settings = new EscalationSettingsService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);
let admin: Principal;

const csvFile = (rows: string[][]) => {
  const buffer = Buffer.from(
    `${[...ORGANIZATION_HEADERS, ...ORGANIZATION_TIER_HEADERS].join(',')}\n${rows
      .map((row) => row.join(','))
      .join('\n')}\n`,
  );
  return {
    buffer,
    size: buffer.length,
    originalname: 'organization.csv',
    mimetype: 'text/csv',
  } as Express.Multer.File;
};

async function principal(username: string) {
  const account = await prisma.userAccount.findUniqueOrThrow({ where: { username } });
  return policy.resolvePrincipal(account, { id: crypto.randomUUID(), passwordRestricted: false });
}

describe('Tiered routing foundation', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "WorkingCalendarException" CASCADE',
    );
    const account = await prisma.userAccount.create({
      data: {
        username: 'tier-admin',
        displayName: 'Tier Admin',
        passwordHash: 'test',
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
    admin = await policy.resolvePrincipal(account, {
      id: crypto.randomUUID(),
      passwordRestricted: false,
    });
    await prisma.generalVoiceCategory.upsert({
      where: { key: 'TIER_WELFARE' },
      update: {},
      create: {
        key: 'TIER_WELFARE',
        revisions: {
          create: { revision: 1, name: 'Kesejahteraan', definition: 'Welfare', examples: [] },
        },
        routes: { create: { mode: 'RELATED_REPORTER_DEPARTMENT' } },
      },
    });
  });
  afterAll(async () => prisma.$disconnect());

  it('imports Area and Line, reports leader gaps, and grants Group Leader', async () => {
    const preview = await imports.preview(
      admin,
      csvFile([
        [
          '700001',
          'Head Assy',
          'Department Head',
          'Mfg',
          'Div A',
          'Assy 1',
          'Office',
          'Karawang 1',
          '',
        ],
        [
          '700002',
          'SH Line',
          'Section Head',
          'Mfg',
          'Div A',
          'Assy 1',
          'Line Sect',
          'Karawang 1',
          '',
        ],
        [
          '700003',
          'GL A',
          'Group Leader',
          'Mfg',
          'Div A',
          'Assy 1',
          'Line Sect',
          'Karawang 1',
          'Line A',
        ],
        [
          '700004',
          'Member A',
          'Member',
          'Mfg',
          'Div A',
          'Assy 1',
          'Line Sect',
          'Karawang 1',
          'Line A',
        ],
        [
          '700005',
          'Member B',
          'Member',
          'Mfg',
          'Div A',
          'Assy 1',
          'Line Sect',
          'Karawang 1',
          'Line B',
        ],
      ]),
    );
    expect(preview.summary).toMatchObject({
      tiers: {
        columnsPresent: true,
        groupLeaders: 1,
        withLine: 3,
        withArea: 5,
        duplicateSectionHeads: [],
        duplicateLineLeaders: [],
        linesWithoutLeader: [expect.objectContaining({ line: 'Line B', count: 1 })],
      },
    });
    await imports.confirm(
      admin,
      preview.id,
      { checksum: preview.checksum, expectedVersion: preview.version },
      'tier-import-confirm',
    );
    await expect
      .poll(
        async () =>
          (await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } })).status,
        {
          timeout: 60_000,
        },
      )
      .toBe('CONFIRMED');
    expect(
      await prisma.organizationMembership.findFirstOrThrow({
        where: { employee: { noReg: '700004' }, snapshot: { status: 'ACTIVE' } },
      }),
    ).toMatchObject({ lineName: 'Line A', area: 'KARAWANG_1' });

    const groupLeader = await principal('700003');
    expect(groupLeader.capabilities).toEqual(expect.arrayContaining(['MEMBER', 'GROUP_LEADER']));
    expect(groupLeader.capabilities).not.toContain('SECTION_HEAD');
    const dashboard = await voices.dashboardGeneral(groupLeader, {});
    expect(dashboard).toBeTruthy();
  });

  it('snapshots the reporter Line and Area on submitted Voices', async () => {
    const member = await principal('700004');
    const draft = await voices.createDraft(member, {
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      locationDetail: 'Line A pos 2',
      title: 'Tunjangan shift belum masuk',
      detail: 'Tunjangan shift bulan lalu belum masuk ke slip gaji.',
    });
    await voices.manualClassification(member, draft.id, {
      category: 'TIER_WELFARE',
      severity: Severity.MEDIUM,
    });
    const preview = await voices.previewDraft(member, draft.id);
    const submitted = (await voices.submit(
      member,
      draft.id,
      { version: preview.version },
      'tier-submit',
    )) as { id: string };
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: submitted.id } })).toMatchObject({
      reporterLineSnapshot: 'Line A',
      reporterAreaSnapshot: 'KARAWANG_1',
    });
  });

  it('exposes seeded defaults and edits the working calendar with versions', async () => {
    const initial = await settings.get();
    expect(initial.deadlines).toEqual([
      expect.objectContaining({
        severity: 'LOW',
        respondAmount: 2,
        processAmount: 3,
        unit: 'WORKING_DAY',
      }),
      expect.objectContaining({ severity: 'MEDIUM', respondAmount: 1, processAmount: 2 }),
      expect.objectContaining({ severity: 'HIGH', respondAmount: 1, processAmount: 1 }),
      expect.objectContaining({
        severity: 'CRITICAL',
        respondAmount: 4,
        processAmount: 24,
        unit: 'CALENDAR_HOUR',
      }),
    ]);
    const custom = await settings.updateCalendar(admin, {
      useStandard: false,
      expectedVersion: initial.calendar.version,
    });
    expect(custom.calendar.useStandard).toBe(false);
    await expect(
      settings.updateCalendar(admin, {
        useStandard: true,
        expectedVersion: initial.calendar.version,
      }),
    ).rejects.toMatchObject({ code: 'CALENDAR_VERSION_CONFLICT' });

    const added = await settings.addException(admin, {
      date: '2026-10-20',
      kind: 'HOLIDAY',
      label: 'Libur perusahaan',
    });
    const exception = added.calendar.exceptions.find((row) => row.date === '2026-10-20')!;
    expect(exception).toMatchObject({ kind: 'HOLIDAY', label: 'Libur perusahaan' });
    await expect(
      settings.addException(admin, { date: '2026-10-20', kind: 'WORKDAY', label: 'Dobel' }),
    ).rejects.toMatchObject({ code: 'CALENDAR_DATE_EXISTS' });
    await expect(
      settings.addException(admin, { date: '2026-02-30', kind: 'HOLIDAY', label: 'Salah' }),
    ).rejects.toMatchObject({ code: 'CALENDAR_DATE_INVALID' });
    const calendar = await settings.workingCalendar();
    expect(calendar.useStandard).toBe(false);
    expect(calendar.exceptions.get('2026-10-20')).toBe('HOLIDAY');
    const removed = await settings.removeException(admin, exception.id);
    expect(removed.calendar.exceptions.some((row) => row.id === exception.id)).toBe(false);
  });

  it('updates per-severity deadlines with validation, versions, and audit', async () => {
    const current = await settings.get();
    const body = (
      overrides: Record<string, Partial<{ respondAmount: number; unit: string }>> = {},
    ) => ({
      deadlines: current.deadlines.map((row) => ({
        severity: row.severity,
        respondAmount: row.respondAmount,
        processAmount: row.processAmount,
        unit: row.unit,
        expectedVersion: row.version,
        ...overrides[row.severity],
      })),
    });
    await expect(
      settings.updateDeadlines(admin, body({ LOW: { respondAmount: 31 } })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const updated = await settings.updateDeadlines(admin, body({ MEDIUM: { respondAmount: 2 } }));
    expect(updated.deadlines.find((row) => row.severity === 'MEDIUM')).toMatchObject({
      respondAmount: 2,
      version: current.deadlines.find((row) => row.severity === 'MEDIUM')!.version + 1,
    });
    await expect(settings.updateDeadlines(admin, body())).rejects.toMatchObject({
      code: 'DEADLINE_VERSION_CONFLICT',
    });
    expect(
      await prisma.auditEvent.count({ where: { action: 'ESCALATION_DEADLINES_UPDATED' } }),
    ).toBeGreaterThan(0);
  });
});
