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

/** Submits a tiered Kesejahteraan Voice as the given employee. */
async function submitAs(username: string, key: string) {
  const reporter = await principal(username);
  const draft = await voices.createDraft(reporter, {
    visibility: 'GENERAL',
    area: 'KARAWANG_1',
    locationDetail: 'Line pos 3',
    title: 'Insentif kehadiran belum dibayar',
    detail: 'Insentif kehadiran bulan lalu belum dibayarkan.',
  });
  await voices.manualClassification(reporter, draft.id, {
    category: 'TIER_WELFARE',
    severity: Severity.MEDIUM,
  });
  const preview = await voices.previewDraft(reporter, draft.id);
  const submitted = (await voices.submit(
    reporter,
    draft.id,
    { version: preview.version },
    key,
  )) as { id: string };
  return prisma.voice.findUniqueOrThrow({ where: { id: submitted.id } });
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

  it('asks TM members for their current Section and Line and snapshots the choice', async () => {
    const placed = await prisma.organizationMembership.findFirstOrThrow({
      where: { employee: { noReg: '700004' }, snapshot: { status: 'ACTIVE' } },
    });
    const employee = await prisma.employee.create({
      data: { noReg: 'TM0001', name: 'Magang Satu' },
    });
    await prisma.userAccount.create({
      data: {
        username: 'TM0001',
        displayName: 'Magang Satu',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
        employeeId: employee.id,
      },
    });
    await prisma.organizationMembership.create({
      data: {
        snapshotId: placed.snapshotId,
        employeeId: employee.id,
        organizationUnitId: placed.organizationUnitId,
        employeeName: 'Magang Satu',
        structuralPosition: 'Member',
        section: 'TM Pool',
        sourceRow: 999,
      },
    });
    const tm = await principal('TM0001');
    const member = await principal('700004');
    expect(await voices.draftPositionOptions(member)).toEqual({
      required: false,
      sections: [],
      last: null,
    });
    // Sections come from permanent staff only, so the TM pool never appears.
    expect(await voices.draftPositionOptions(tm)).toEqual({
      required: true,
      sections: [
        { name: 'Line Sect', lines: ['Line A', 'Line B'] },
        { name: 'Office', lines: [] },
      ],
      last: null,
    });
    const content = {
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      locationDetail: 'Line B pos 1',
      title: 'Uang makan magang terlambat',
      detail: 'Uang makan magang bulan ini belum dibayarkan.',
    };
    await expect(
      voices.createDraft(tm, { ...content, positionSection: 'Gudang', positionLine: null }),
    ).rejects.toMatchObject({ code: 'POSITION_INVALID' });
    await expect(
      voices.createDraft(member, { ...content, positionSection: 'Line Sect', positionLine: null }),
    ).rejects.toMatchObject({ code: 'POSITION_INVALID' });

    const draft = await voices.createDraft(tm, content);
    await voices.manualClassification(tm, draft.id, {
      category: 'TIER_WELFARE',
      severity: Severity.MEDIUM,
    });
    const unplaced = await voices.previewDraft(tm, draft.id);
    await expect(
      voices.submit(tm, draft.id, { version: unplaced.version }, 'tm-submit-missing'),
    ).rejects.toMatchObject({ code: 'POSITION_REQUIRED' });
    const placedDraft = await voices.updateDraft(tm, draft.id, {
      positionSection: 'Line Sect',
      positionLine: 'Line B',
      expectedVersion: unplaced.version,
    });
    expect(placedDraft).toMatchObject({ positionSection: 'Line Sect', positionLine: 'Line B' });
    const preview = await voices.previewDraft(tm, draft.id);
    const submitted = (await voices.submit(
      tm,
      draft.id,
      { version: preview.version },
      'tm-submit',
    )) as { id: string };
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: submitted.id } })).toMatchObject({
      reporterSectionSnapshot: 'Line Sect',
      reporterLineSnapshot: 'Line B',
      reporterAreaSnapshot: 'KARAWANG_1',
      reporterDepartmentSnapshot: 'Assy 1',
    });
    expect((await voices.draftPositionOptions(tm)).last).toEqual({
      section: 'Line Sect',
      line: 'Line B',
    });
  });

  it('starts tiered Voices at the nearest leader above the reporter', async () => {
    await prisma.generalVoiceCategory.update({
      where: { key: 'TIER_WELFARE' },
      data: { tiered: true },
    });
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const manager = await principal('700001');

    // Line A has a Group Leader, so the Voice starts there.
    const lineA = await submitAs('700004', 'tier-line-a');
    expect(lineA).toMatchObject({
      tierLevel: 'GROUP_LEADER',
      tierPath: ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER'],
      tierHolderIds: [groupLeader.accountId],
      routeOwnerId: manager.accountId,
      outsideReporter: false,
    });
    expect(
      await prisma.notification.findMany({
        where: { voiceId: lineA.id, type: 'VOICE_SUBMITTED' },
        select: { recipientId: true },
      }),
    ).toEqual([{ recipientId: groupLeader.accountId }]);
    const leaderView = await voices.detail(groupLeader, lineA.id);
    expect(leaderView.availableActions).toEqual(['RESPOND', 'ESCALATE']);
    expect(leaderView.tierLevel).toBe('GROUP_LEADER');
    expect(leaderView.participants.map((item) => item.role)).toEqual(['REPORTER', 'GROUP_LEADER']);
    // The Manager can read the team Voice but cannot act on it yet.
    expect((await voices.detail(manager, lineA.id)).availableActions).toEqual([]);
    expect((await voices.workItems(groupLeader, {})).items.map((item) => item.id)).toContain(
      lineA.id,
    );
    expect((await voices.workItems(manager, {})).items.map((item) => item.id)).not.toContain(
      lineA.id,
    );
    await expect(
      voices.respond(manager, lineA.id, { text: 'Saya cek', version: 1 }, 'tier-manager-respond'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(voices.handoverOptions(manager, lineA.id)).rejects.toMatchObject({
      code: 'HANDOVER_INVALID_STATE',
    });

    // The Group Leader processes it and becomes the PIC who closes it.
    const processed = await voices.respond(
      groupLeader,
      lineA.id,
      { text: 'Saya tangani.', version: 1, days: 1 },
      'tier-gl-process',
    );
    expect(processed).toMatchObject({
      status: 'IN_PROGRESS',
      currentHandlerId: groupLeader.accountId,
      handlerType: 'GROUP_LEADER',
    });
    expect((await voices.detail(groupLeader, lineA.id)).availableActions).toContain('CLOSE');

    // Line B has no Group Leader, so the Section Head receives it.
    const lineB = await submitAs('700005', 'tier-line-b');
    expect(lineB).toMatchObject({
      tierLevel: 'SECTION_HEAD',
      tierHolderIds: [sectionHead.accountId],
    });
    // A Group Leader never handles their own Voice: it starts one level up.
    const ownVoice = await submitAs('700003', 'tier-gl-own');
    expect(ownVoice).toMatchObject({
      tierLevel: 'SECTION_HEAD',
      tierPath: ['SECTION_HEAD', 'MANAGER'],
    });
  });

  it('treats a manual Naikkan as a response, assigns down, and reminds the assignee once a day', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const reporter = await principal('700004');
    const voice = await submitAs('700004', 'tier-escalate-open');
    await expect(
      voices.escalate(groupLeader, voice.id, { expectedVersion: 1, reason: '' }, 'esc-empty'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const escalated = await voices.escalate(
      groupLeader,
      voice.id,
      { expectedVersion: 1, reason: 'Perlu keputusan Section.' },
      'esc-gl',
    );
    // Raising it by hand answers the Voice: Direspons, chat open, Section Head in charge.
    expect(escalated).toMatchObject({ status: 'RESPONDED', version: 2 });
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
      tierLevel: 'SECTION_HEAD',
      tierHolderIds: [sectionHead.accountId],
      tierParticipantIds: [groupLeader.accountId],
      tierLowerHolderIds: [],
      sectionHasGroupLeader: true,
    });
    // The Group Leader stays in the chat; the Section Head goes up, assigns, or processes.
    expect((await voices.detail(groupLeader, voice.id)).availableActions).toEqual(['MESSAGE']);
    expect((await voices.detail(sectionHead, voice.id)).availableActions).toEqual([
      'PROCEED',
      'ASSIGN',
      'ESCALATE',
      'MESSAGE',
    ]);
    const thread = await voices.messages(reporter, voice.id, {});
    expect(thread.items.map((item) => [item.kind, item.text])).toEqual([
      ['SYSTEM', 'Diteruskan ke Section Head'],
    ]);
    expect(
      await prisma.notification.findFirstOrThrow({
        where: { voiceId: voice.id, recipientId: reporter.accountId, type: 'STATUS_CHANGED' },
      }),
    ).toMatchObject({ title: 'Voice Anda telah direspons', body: 'Diteruskan ke Section Head.' });
    expect(
      await prisma.notification.findFirstOrThrow({
        where: { voiceId: voice.id, type: 'ESCALATED' },
      }),
    ).toMatchObject({
      recipientId: sectionHead.accountId,
      body: 'Alasan: Perlu keputusan Section.',
    });
    expect(
      await prisma.notification.count({
        where: { voiceId: voice.id, recipientId: reporter.accountId, type: 'STATUS_CHANGED' },
      }),
    ).toBe(1);

    // Tugaskan: the Section Head assigns the Section's Group Leader.
    expect((await voices.assignmentCandidates(sectionHead, voice.id)).map((c) => c.id)).toEqual([
      groupLeader.accountId,
    ]);
    const assigned = await voices.assign(
      sectionHead,
      voice.id,
      {
        handlerAccountId: groupLeader.accountId,
        text: 'Mohon dicek ke line.',
        expectedVersion: 2,
      },
      'tier-assign-gl',
    );
    expect(assigned).toMatchObject({
      status: 'RESPONDED',
      currentHandlerId: groupLeader.accountId,
      handlerType: 'GROUP_LEADER',
    });
    expect((await voices.detail(groupLeader, voice.id)).availableActions).toContain('PROCEED');
    expect((await voices.detail(sectionHead, voice.id)).availableActions).toContain('REMIND');
    expect(await voices.remind(sectionHead, voice.id, 'remind-1')).toEqual({
      success: true,
      reminded: 1,
    });
    await expect(voices.remind(sectionHead, voice.id, 'remind-2')).rejects.toMatchObject({
      code: 'REMINDER_LIMIT',
    });
    expect(
      await prisma.notification.count({
        where: { voiceId: voice.id, recipientId: groupLeader.accountId, type: 'REMINDER' },
      }),
    ).toBe(1);
  });

  it('keeps everyone who raised the Voice in the chat as it goes up again', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const manager = await principal('700001');
    const voice = await submitAs('700004', 'tier-escalate-answered');
    await voices.respond(groupLeader, voice.id, { text: 'Kami cek dulu.', version: 1 }, 'tier-r');
    expect((await voices.detail(groupLeader, voice.id)).availableActions).toEqual([
      'PROCEED',
      'ESCALATE',
      'MESSAGE',
    ]);
    await voices.escalate(
      groupLeader,
      voice.id,
      { expectedVersion: 2, reason: 'Butuh persetujuan Section.' },
      'esc-answered',
    );
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
      status: 'RESPONDED',
      tierLevel: 'SECTION_HEAD',
      tierHolderIds: [sectionHead.accountId],
      tierParticipantIds: [groupLeader.accountId],
    });
    expect((await voices.detail(groupLeader, voice.id)).availableActions).toEqual(['MESSAGE']);
    // Naikkan lagi: the Manager takes over and both leaders stay in the chat.
    await voices.escalate(
      sectionHead,
      voice.id,
      { expectedVersion: 3, reason: 'Perlu keputusan Manager.' },
      'esc-again',
    );
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
      status: 'RESPONDED',
      tierLevel: 'MANAGER',
      tierHolderIds: [manager.accountId],
      tierParticipantIds: [groupLeader.accountId, sectionHead.accountId],
    });
    expect((await voices.detail(manager, voice.id)).availableActions).toEqual([
      'PROCEED',
      'ASSIGN',
      'HANDOVER',
      'MESSAGE',
    ]);
    expect((await voices.detail(sectionHead, voice.id)).availableActions).toEqual(['MESSAGE']);
    expect((await voices.detail(manager, voice.id)).participants.map((p) => p.role)).toEqual([
      'REPORTER',
      'GROUP_LEADER',
      'SECTION_HEAD',
      'DEPARTMENT_HEAD',
    ]);
    const reporterThread = await voices.messages(await principal('700004'), voice.id, {});
    expect(
      reporterThread.items.filter((item) => item.kind === 'SYSTEM').map((i) => i.text),
    ).toEqual(['Diteruskan ke Section Head', 'Diteruskan ke Manager']);
    // A Group Leader who stayed in the chat still talks with the reporter.
    await voices.addMessage(groupLeader, voice.id, { text: 'Sudah saya teruskan.' }, [], 'gl-msg');
  });

  it('lets a Manager holder assign skipped levels and stops at the top of the chain', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const manager = await principal('700001');
    // Line B has no Group Leader: Section Head first, then Manager.
    const voice = await submitAs('700005', 'tier-to-manager');
    await voices.escalate(
      sectionHead,
      voice.id,
      { expectedVersion: 1, reason: 'Wewenang Manager.' },
      'esc-sh',
    );
    const managerView = await voices.detail(manager, voice.id);
    expect(managerView.tierLevel).toBe('MANAGER');
    expect(managerView.availableActions).toEqual(['PROCEED', 'ASSIGN', 'HANDOVER', 'MESSAGE']);
    expect((await voices.assignmentCandidates(manager, voice.id)).map((c) => c.id).sort()).toEqual(
      [groupLeader.accountId, sectionHead.accountId].sort(),
    );
    expect((await voices.workItems(manager, {})).items.map((item) => item.id)).toContain(voice.id);
  });

  it('shows team Voices read-only with the handling stages, Group Leaders per Line', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const voice = await submitAs('700004', 'tier-team-read');
    // The Section Head reads the Section's Voice without acting on it.
    const teamView = await voices.detail(sectionHead, voice.id);
    expect(teamView.availableActions).toEqual([]);
    expect(teamView.tierStages).toEqual([
      { level: 'GROUP_LEADER', state: 'CURRENT', names: ['GL A'] },
      { level: 'SECTION_HEAD', state: 'NEXT', names: ['SH Line'] },
      { level: 'MANAGER', state: 'NEXT', names: ['Head Assy'] },
    ]);
    // The reporter never sees the internal stages.
    expect((await voices.detail(await principal('700004'), voice.id)).tierStages).toBeUndefined();
    // A Group Leader's team is their Line: Line B is outside it.
    const lineB = await submitAs('700005', 'tier-team-line-b');
    await expect(voices.detail(groupLeader, lineB.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect((await voices.detail(sectionHead, lineB.id)).tierLevel).toBe('SECTION_HEAD');
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
