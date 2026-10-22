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
import { AwayService } from '../../src/away/away.service';
import { TierEscalationService } from '../../src/voices/tier-escalation.service';
import { HandlingTargetService } from '../../src/voices/handling-target.service';
import { commitReroute, planReroute } from '../../src/operations/reroute-reporter-department';
import { jakartaDateKey } from '../../src/escalation/working-time';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const imports = new ImportsService(prisma as never);
const settings = new EscalationSettingsService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);
const away = new AwayService(prisma as never, policy);
const dayKey = (offset: number) => jakartaDateKey(new Date(Date.now() + offset * 86_400_000));
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

/** Submits a General Voice (tiered Kesejahteraan by default) as the given employee. */
async function submitAs(
  username: string,
  key: string,
  severity: Severity = Severity.MEDIUM,
  category = 'TIER_WELFARE',
) {
  const reporter = await principal(username);
  const draft = await voices.createDraft(reporter, {
    visibility: 'GENERAL',
    area: 'KARAWANG_1',
    locationDetail: 'Line pos 3',
    title: 'Insentif kehadiran belum dibayar',
    detail: 'Insentif kehadiran bulan lalu belum dibayarkan.',
  });
  await voices.manualClassification(reporter, draft.id, { category, severity });
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
    expect(leaderView.availableActions).toEqual(['RESPOND', 'ESCALATE', 'CHANGE_SEVERITY']);
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

    // The Group Leader processes it and becomes the PIC, who reports a Medium
    // Voice done for the levels above to approve (ADR-0069).
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
    expect((await voices.detail(groupLeader, lineA.id)).availableActions).toContain('REPORT_DONE');

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

  it('gives a Line with two Group Leaders to both; whoever presses Proses becomes the PIC', async () => {
    const placed = await prisma.organizationMembership.findFirstOrThrow({
      where: { employee: { noReg: '700003' }, snapshot: { status: 'ACTIVE' } },
    });
    const employee = await prisma.employee.create({ data: { noReg: '700009', name: 'GL A2' } });
    const second = await prisma.userAccount.create({
      data: {
        username: '700009',
        displayName: 'GL A2',
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
        employeeName: 'GL A2',
        structuralPosition: 'Group Leader',
        section: 'Line Sect',
        lineName: 'Line A',
        sourceRow: 998,
      },
    });
    try {
      const first = await principal('700003');
      const other = await principal('700009');
      const voice = await submitAs('700004', 'tier-two-leaders');
      expect(voice).toMatchObject({
        tierLevel: 'GROUP_LEADER',
        tierHolderIds: [first.accountId, other.accountId].sort(),
      });
      const notified = await prisma.notification.findMany({
        where: { voiceId: voice.id, type: 'VOICE_SUBMITTED' },
        select: { recipientId: true },
      });
      expect(notified.map((row) => row.recipientId).sort()).toEqual(
        [first.accountId, other.accountId].sort(),
      );
      expect((await voices.detail(first, voice.id)).availableActions).toContain('RESPOND');
      expect((await voices.detail(other, voice.id)).availableActions).toContain('RESPOND');

      const processed = await voices.respond(
        other,
        voice.id,
        { text: 'Saya tangani.', version: 1, days: 1 },
        'tier-two-leaders-process',
      );
      expect(processed).toMatchObject({ status: 'IN_PROGRESS', currentHandlerId: other.accountId });
      expect((await voices.detail(other, voice.id)).availableActions).toContain('REPORT_DONE');
      // The other Group Leader keeps the chat but cannot finish it.
      expect((await voices.detail(first, voice.id)).availableActions).toEqual(['MESSAGE']);
    } finally {
      await prisma.userAccount.update({
        where: { id: second.id },
        data: { status: 'INACTIVE' },
      });
    }
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
    // Raising it by hand answers the Voice: Direspon, chat open, Section Head in charge.
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
      'CHANGE_SEVERITY',
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
      'CHANGE_SEVERITY',
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
      'CHANGE_SEVERITY',
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
    expect(managerView.availableActions).toEqual([
      'PROCEED',
      'ASSIGN',
      'HANDOVER',
      'MESSAGE',
      'CHANGE_SEVERITY',
    ]);
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

  it('lets a substitute act for an away leader and skips a level nobody can reach', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const manager = await principal('700001');
    const setup = await away.get(groupLeader);
    expect(setup).toMatchObject({ eligible: true, current: null });
    expect(setup.candidates.map((c) => c.id)).toEqual([sectionHead.accountId]);
    expect((await away.get(await principal('700004'))).eligible).toBe(false);
    await expect(
      away.set(groupLeader, {
        startsOn: dayKey(-1),
        endsOn: dayKey(1),
        substituteId: sectionHead.accountId,
      }),
    ).rejects.toMatchObject({ code: 'AWAY_PERIOD_INVALID' });
    await expect(
      away.set(groupLeader, {
        startsOn: dayKey(0),
        endsOn: dayKey(1),
        substituteId: manager.accountId,
      }),
    ).rejects.toMatchObject({ code: 'AWAY_SUBSTITUTE_INVALID' });

    const set = await away.set(groupLeader, {
      startsOn: dayKey(0),
      endsOn: dayKey(2),
      substituteId: sectionHead.accountId,
    });
    expect(set.current).toMatchObject({
      active: true,
      startsOn: dayKey(0),
      substitute: { id: sectionHead.accountId },
    });
    expect(
      await prisma.notification.count({
        where: { recipientId: sectionHead.accountId, type: 'AWAY_SUBSTITUTE' },
      }),
    ).toBe(1);

    // The Group Leader still holds the Voice; the Section Head acts for them.
    const voice = await submitAs('700004', 'away-held');
    expect(voice).toMatchObject({
      tierLevel: 'GROUP_LEADER',
      tierHolderIds: [groupLeader.accountId],
    });
    const substitute = await principal('700002');
    expect(substitute.actingFor).toEqual([groupLeader.accountId]);
    expect((await voices.workItems(substitute, {})).items.map((item) => item.id)).toContain(
      voice.id,
    );
    expect((await voices.detail(substitute, voice.id)).availableActions).toEqual([
      'RESPOND',
      'ESCALATE',
      'CHANGE_SEVERITY',
    ]);
    expect(
      (
        await prisma.notification.findMany({
          where: { voiceId: voice.id, type: 'VOICE_SUBMITTED' },
          select: { recipientId: true },
        })
      )
        .map((row) => row.recipientId)
        .sort(),
    ).toEqual([groupLeader.accountId, sectionHead.accountId].sort());

    // With the Section Head away as well, nobody can act at the Group Leader level.
    await away.set(sectionHead, {
      startsOn: dayKey(0),
      endsOn: dayKey(1),
      substituteId: manager.accountId,
    });
    const skipped = await submitAs('700004', 'away-skipped');
    expect(skipped).toMatchObject({
      tierLevel: 'SECTION_HEAD',
      tierHolderIds: [sectionHead.accountId],
    });

    // Aktif kembali ends the delegation at once.
    expect((await away.end(groupLeader)).current).toBeNull();
    await away.end(sectionHead);
    expect((await principal('700002')).actingFor).toEqual([]);
    expect((await voices.detail(await principal('700002'), voice.id)).availableActions).toEqual([]);
    await expect(away.end(groupLeader)).rejects.toMatchObject({ code: 'AWAY_PERIOD_NOT_FOUND' });
  });

  it('escalates automatically when a tier window passes', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const manager = await principal('700001');
    const worker = new TierEscalationService(prisma as never);
    const past = new Date(Date.now() - 60_000);
    const expire = (id: string) =>
      prisma.voice.update({ where: { id }, data: { tierDueAt: past } });
    const thread = async (id: string) =>
      (await prisma.message.findMany({ where: { conversation: { voiceId: id } } }))
        .filter((message) => message.kind === 'SYSTEM')
        .map((message) => message.text);

    // 1. Nobody answered: the Section Head joins and it stays Terbuka. The
    // Group Leader who missed it keeps acting at their own level.
    const open = await submitAs('700004', 'auto-open');
    expect(open).toMatchObject({ tierDueKind: 'RESPOND', tierHolderResponded: false });
    expect(open.tierDueAt!.getTime()).toBeGreaterThan(Date.now());
    await expire(open.id);
    await Promise.all([worker.tick(), new TierEscalationService(prisma as never).tick()]);
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: open.id } })).toMatchObject({
      status: 'OPEN',
      tierLevel: 'SECTION_HEAD',
      tierHolderIds: [groupLeader.accountId, sectionHead.accountId],
      tierLowerHolderIds: [groupLeader.accountId],
      tierObserverIds: [],
      tierDueKind: 'RESPOND',
    });
    expect((await voices.detail(groupLeader, open.id)).availableActions).toEqual([
      'RESPOND',
      'CHANGE_SEVERITY',
    ]);
    expect((await voices.detail(sectionHead, open.id)).availableActions).toEqual(
      expect.arrayContaining(['RESPOND', 'ESCALATE', 'REMIND']),
    );
    const escalated = await prisma.voiceEvent.findMany({
      where: { voiceId: open.id, type: 'ESCALATED' },
    });
    expect(escalated).toHaveLength(1);
    // Handling performance attributes the missed window to whoever held it.
    expect(escalated[0]!.payload).toMatchObject({
      automatic: true,
      previousHolders: [groupLeader.accountId],
    });
    expect(
      (
        await prisma.notification.findMany({
          where: { voiceId: open.id, type: 'ESCALATED' },
          select: { recipientId: true },
        })
      )
        .map((row) => row.recipientId)
        .sort(),
    ).toEqual([groupLeader.accountId, sectionHead.accountId].sort());
    expect(await worker.tick()).toBe(0);

    // A holder on leave is represented by the substitute acting for them.
    const covered = await submitAs('700004', 'auto-covered');
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const leave = await prisma.awayPeriod.create({
      data: {
        accountId: groupLeader.accountId,
        substituteId: sectionHead.accountId,
        startsOn: new Date(today.getTime() - 86_400_000),
        endsOn: new Date(today.getTime() + 86_400_000),
      },
    });
    await expire(covered.id);
    await worker.tick();
    expect(
      (
        await prisma.voiceEvent.findFirstOrThrow({
          where: { voiceId: covered.id, type: 'ESCALATED' },
        })
      ).payload,
    ).toMatchObject({ previousHolders: [sectionHead.accountId] });
    await prisma.awayPeriod.delete({ where: { id: leave.id } });

    // 2. Raised by hand and not processed: up again, stays Direspon, chat note.
    // The Group Leader who raised it keeps the chat; the Section Head who
    // missed it keeps acting beside the Manager.
    const raised = await submitAs('700004', 'auto-raised');
    await voices.escalate(
      groupLeader,
      raised.id,
      { expectedVersion: 1, reason: 'Perlu Section Head.' },
      'auto-raise',
    );
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: raised.id } })).toMatchObject({
      tierDueKind: 'PROCESS',
      tierHolderResponded: false,
    });
    await expire(raised.id);
    await worker.tick();
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: raised.id } })).toMatchObject({
      status: 'RESPONDED',
      tierLevel: 'MANAGER',
      tierHolderIds: [sectionHead.accountId, manager.accountId],
      tierLowerHolderIds: [sectionHead.accountId],
      tierParticipantIds: [groupLeader.accountId],
    });
    // The Section Head still assigns within their Section.
    expect((await voices.detail(sectionHead, raised.id)).availableActions).toEqual(
      expect.arrayContaining(['PROCEED', 'ASSIGN', 'MESSAGE']),
    );
    expect(
      (await voices.assignmentCandidates(sectionHead, raised.id)).map((item) => item.id),
    ).toEqual([groupLeader.accountId]);
    expect(await thread(raised.id)).toEqual([
      'Diteruskan ke Section Head',
      'Diteruskan ke Manager',
    ]);

    // 3. Answered but not processed: the Manager joins beside the Section Head.
    const answered = await submitAs('700005', 'auto-answered');
    await voices.respond(sectionHead, answered.id, { text: 'Kami cek.', version: 1 }, 'auto-r');
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } })).toMatchObject({
      tierDueKind: 'PROCESS',
      tierHolderResponded: true,
    });
    await expire(answered.id);
    await worker.tick();
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } })).toMatchObject({
      status: 'RESPONDED',
      tierLevel: 'MANAGER',
      tierHolderIds: [sectionHead.accountId, manager.accountId],
      tierLowerHolderIds: [sectionHead.accountId],
    });
    expect(await thread(answered.id)).toEqual(['Manager bergabung ke percakapan']);
    expect((await voices.detail(manager, answered.id)).availableActions).toEqual(
      expect.arrayContaining(['PROCEED', 'ASSIGN', 'REMIND']),
    );

    // Processing stops the clock; the top of the chain stops it too.
    const current = await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } });
    await voices.proceed(manager, answered.id, { days: 1, version: current.version }, 'auto-p');
    expect(
      (await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } })).tierDueAt,
    ).toBeNull();
    await expire(raised.id);
    expect(await worker.tick()).toBe(0);
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: raised.id } })).toMatchObject({
      tierLevel: 'MANAGER',
      tierDueAt: null,
    });
  });

  it('gives fixed categories the same windows; a miss at the route owner notifies, not escalates', async () => {
    await prisma.generalVoiceCategory.upsert({
      where: { key: 'FIXED_FACILITY' },
      update: { tiered: false },
      create: {
        key: 'FIXED_FACILITY',
        tiered: false,
        revisions: {
          create: { revision: 1, name: 'Fasilitas Umum', definition: 'Facility', examples: [] },
        },
        routes: { create: { mode: 'RELATED_REPORTER_DEPARTMENT' } },
      },
    });
    // A Division Head of the handling division is informed of a miss.
    const placed = await prisma.organizationMembership.findFirstOrThrow({
      where: { employee: { noReg: '700001' }, snapshot: { status: 'ACTIVE' } },
    });
    const employee = await prisma.employee.create({ data: { noReg: '700010', name: 'DH Div A' } });
    const divisionHead = await prisma.userAccount.create({
      data: {
        username: '700010',
        displayName: 'DH Div A',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
        employeeId: employee.id,
      },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        snapshotId: placed.snapshotId,
        employeeId: employee.id,
        organizationUnitId: placed.organizationUnitId,
        employeeName: 'DH Div A',
        structuralPosition: 'Division Head',
        section: 'Office',
        sourceRow: 997,
      },
    });
    const manager = await principal('700001');
    const worker = new TierEscalationService(prisma as never);
    const past = new Date(Date.now() - 60_000);
    const expire = (id: string) =>
      prisma.voice.update({ where: { id }, data: { tierDueAt: past } });
    const misses = (id: string) =>
      prisma.voiceEvent.findMany({ where: { voiceId: id, type: 'DEADLINE_MISSED' } });
    const told = async (id: string) =>
      (
        await prisma.notification.findMany({
          where: { voiceId: id, type: 'TARGET_OVERDUE' },
          select: { recipientId: true, title: true },
        })
      ).sort((a, b) => a.recipientId.localeCompare(b.recipientId));
    try {
      // Terbuka with the route owner: the respond window runs from submit.
      const voice = await submitAs('700004', 'fixed-open', Severity.MEDIUM, 'FIXED_FACILITY');
      expect(voice).toMatchObject({ tierLevel: null, tierDueKind: 'RESPOND' });
      expect(voice.tierDueAt!.getTime()).toBeGreaterThan(Date.now());
      await expire(voice.id);
      expect(await worker.tick()).toBe(1);
      // It stays with the Manager; the Manager and the Division Head are told once.
      expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
        status: 'OPEN',
        tierLevel: null,
        routeOwnerId: manager.accountId,
        tierMissedDueAt: past,
      });
      expect((await misses(voice.id))[0]!.payload).toMatchObject({
        kind: 'RESPOND',
        previousHolders: [manager.accountId],
        automatic: true,
      });
      expect(await told(voice.id)).toEqual(
        [
          { recipientId: manager.accountId, title: 'Segera respons Voice ini' },
          { recipientId: divisionHead.id, title: 'Voice belum direspons' },
        ].sort((a, b) => a.recipientId.localeCompare(b.recipientId)),
      );
      expect(await worker.tick()).toBe(0);
      expect(await misses(voice.id)).toHaveLength(1);

      // Once answered, the Manager's process window runs, with the same notice.
      const current = await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } });
      await voices.respond(
        manager,
        voice.id,
        { text: 'Kami cek.', version: current.version },
        'fixed-r',
      );
      const answered = await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } });
      expect(answered).toMatchObject({ status: 'RESPONDED', tierDueKind: 'PROCESS' });
      expect(answered.tierDueAt!.getTime()).toBeGreaterThan(Date.now());
      await expire(voice.id);
      await prisma.voice.update({
        where: { id: voice.id },
        data: { tierDueAt: new Date(past.getTime() + 1000) },
      });
      expect(await worker.tick()).toBe(1);
      expect(
        (await misses(voice.id)).map((event) => (event.payload as { kind: string }).kind),
      ).toEqual(['RESPOND', 'PROCESS']);
      expect((await told(voice.id)).map((row) => row.title)).toEqual(
        expect.arrayContaining(['Segera proses Voice ini', 'Voice belum diproses']),
      );

      // Older Voices without a deadline get one from when their window began.
      const older = await submitAs('700004', 'fixed-older', Severity.MEDIUM, 'FIXED_FACILITY');
      await prisma.voice.update({
        where: { id: older.id },
        data: { tierDueAt: null, tierDueKind: null },
      });
      await worker.tick();
      expect((await prisma.voice.findUniqueOrThrow({ where: { id: older.id } })).tierDueKind).toBe(
        'RESPOND',
      );
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('alerts the whole chain at once for a Critical tiered Voice', async () => {
    const groupLeader = await principal('700003');
    const sectionHead = await principal('700002');
    const manager = await principal('700001');
    const critical = await submitAs('700004', 'critical-tiered', Severity.CRITICAL);
    expect(critical.tierHolderIds).toEqual([groupLeader.accountId]);
    expect(
      (
        await prisma.notification.findMany({
          where: { voiceId: critical.id, type: 'CRITICAL_VOICE' },
          select: { recipientId: true },
        })
      )
        .map((row) => row.recipientId)
        .sort(),
    ).toEqual([sectionHead.accountId, manager.accountId].sort());
    // Raising a Voice to Kritis alerts the chain the same way.
    const raised = await submitAs('700004', 'critical-raised');
    await voices.changeSeverity(
      groupLeader,
      raised.id,
      { expectedVersion: 1, severity: Severity.CRITICAL, reason: 'Ada ancaman.' },
      'critical-change',
    );
    expect(
      await prisma.notification.count({ where: { voiceId: raised.id, type: 'CRITICAL_VOICE' } }),
    ).toBe(2);
  });

  it('counts in Butuh Tindakan Saya only the Voices waiting for the viewer at their level', async () => {
    const placed = await prisma.organizationMembership.findFirstOrThrow({
      where: { employee: { noReg: '700001' }, snapshot: { status: 'ACTIVE' } },
    });
    const employee = await prisma.employee.create({ data: { noReg: '700012', name: 'DH Act' } });
    await prisma.userAccount.create({
      data: {
        username: '700012',
        displayName: 'DH Act',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
        employeeId: employee.id,
      },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        snapshotId: placed.snapshotId,
        employeeId: employee.id,
        organizationUnitId: placed.organizationUnitId,
        employeeName: 'DH Act',
        structuralPosition: 'Division Head',
        section: 'Office',
        sourceRow: 996,
      },
    });
    try {
      const groupLeader = await principal('700003');
      const sectionHead = await principal('700002');
      const manager = await principal('700001');
      const divisionHead = await principal('700012');
      const worker = new TierEscalationService(prisma as never);
      const expire = (id: string) =>
        prisma.voice.update({
          where: { id },
          data: { tierDueAt: new Date(Date.now() - 60_000) },
        });
      // The Voice Member action list holds exactly what the summary counts.
      const waiting = async (who: Principal) => {
        const [preview, list] = await Promise.all([
          voices.dashboardPreview(who, {}),
          voices.workItems(who, { action: 'me', limit: '100' }),
        ]);
        expect(preview.summary.total).toBe(list.items.length);
        return list.items.map((item) => item.id);
      };
      await expect(voices.workItems(manager, { action: 'all' })).rejects.toMatchObject({
        code: 'ACTION_FILTER_INVALID',
      });

      // Raised by hand to the Section Head: it waits for them, not the Group Leader.
      const raised = await submitAs('700004', 'act-raised');
      expect(await waiting(groupLeader)).toContain(raised.id);
      expect(await waiting(divisionHead)).not.toContain(raised.id);
      await voices.escalate(
        groupLeader,
        raised.id,
        { expectedVersion: 1, reason: 'Perlu Section Head.' },
        'act-raise',
      );
      expect(await waiting(sectionHead)).toContain(raised.id);
      expect(await waiting(groupLeader)).not.toContain(raised.id);
      expect(await waiting(manager)).not.toContain(raised.id);
      // "Paling mendesak" is picked from those same Voices.
      const shWaiting = await waiting(sectionHead);
      const shPreview = await voices.dashboardPreview(sectionHead, {});
      expect(shPreview.actionItems.length).toBe(Math.min(3, shWaiting.length));
      for (const item of shPreview.actionItems) expect(shWaiting).toContain(item.id);

      // Answered but never processed, up to the Division Head: it now waits for
      // them, and still for the Group Leader who answered it.
      const answered = await submitAs('700004', 'act-answered');
      await voices.respond(groupLeader, answered.id, { text: 'Kami cek.', version: 1 }, 'act-r');
      const level = async () =>
        (await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } })).tierLevel;
      for (let step = 0; step < 3; step++) {
        await expire(answered.id);
        await worker.tick();
        // At the Section Head and Manager steps it is not the Division Head's yet.
        if ((await level()) !== 'DIVISION')
          expect(await waiting(divisionHead)).not.toContain(answered.id);
        if ((await level()) === 'MANAGER') expect(await waiting(manager)).toContain(answered.id);
      }
      expect((await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } })).tierLevel).toBe(
        'DIVISION',
      );
      expect(await waiting(divisionHead)).toContain(answered.id);
      expect(await waiting(groupLeader)).toContain(answered.id);
      // Voices of the division that never reached the Division Head do not count.
      expect(await waiting(divisionHead)).not.toContain(raised.id);

      // Once the Group Leader processes it, only they (the PIC) still act on it.
      const current = await prisma.voice.findUniqueOrThrow({ where: { id: answered.id } });
      await voices.proceed(
        groupLeader,
        answered.id,
        { days: 1, version: current.version },
        'act-process',
      );
      expect(await waiting(groupLeader)).toContain(answered.id);
      expect(await waiting(divisionHead)).not.toContain(answered.id);
      expect(await waiting(manager)).not.toContain(answered.id);
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('closes Medium and above through each level above the PIC (ADR-0069)', async () => {
    const placed = await prisma.organizationMembership.findFirstOrThrow({
      where: { employee: { noReg: '700001' }, snapshot: { status: 'ACTIVE' } },
    });
    const employee = await prisma.employee.create({ data: { noReg: '700013', name: 'DH Close' } });
    await prisma.userAccount.create({
      data: {
        username: '700013',
        displayName: 'DH Close',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
        employeeId: employee.id,
      },
    });
    const membership = await prisma.organizationMembership.create({
      data: {
        snapshotId: placed.snapshotId,
        employeeId: employee.id,
        organizationUnitId: placed.organizationUnitId,
        employeeName: 'DH Close',
        structuralPosition: 'Division Head',
        section: 'Office',
        sourceRow: 995,
      },
    });
    try {
      const groupLeader = await principal('700003');
      const sectionHead = await principal('700002');
      const manager = await principal('700001');
      const divisionHead = await principal('700013');
      const reporter = await principal('700004');
      const targets = new HandlingTargetService(prisma as never);
      const version = async (id: string) =>
        (await prisma.voice.findUniqueOrThrow({ where: { id } })).version;
      const processedByGroupLeader = async (key: string, severity: Severity) => {
        const voice = await submitAs('700004', key, severity);
        await voices.respond(
          groupLeader,
          voice.id,
          { text: 'Saya tangani.', version: 1, days: 3 },
          `${key}-process`,
        );
        return voice.id;
      };
      const report = (id: string, key: string) =>
        version(id).then((current) =>
          voices.reportDone(groupLeader, id, { note: 'Sudah dibayarkan.', version: current }, key),
        );
      const approve = (who: Principal, id: string, key: string) =>
        version(id).then((current) => voices.approveClosure(who, id, { version: current }, key));

      // Low: the PIC closes it.
      const low = await processedByGroupLeader('close-low', Severity.LOW);
      expect((await voices.detail(groupLeader, low)).availableActions).toContain('CLOSE');
      await voices.close(
        groupLeader,
        low,
        { note: 'Selesai.', version: await version(low) },
        'close-low-close',
      );
      expect((await prisma.voice.findUniqueOrThrow({ where: { id: low } })).status).toBe('CLOSED');

      // Medium: the Group Leader reports done instead of closing.
      const medium = await processedByGroupLeader('close-medium', Severity.MEDIUM);
      const before = await voices.detail(groupLeader, medium);
      expect(before.availableActions).toContain('REPORT_DONE');
      expect(before.availableActions).not.toContain('CLOSE');
      await expect(
        voices.close(
          groupLeader,
          medium,
          { note: 'Selesai.', version: await version(medium) },
          'close-medium-direct',
        ),
      ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      const closedBefore = (await voices.dashboardPreview(groupLeader, {})).summary.closedByMe;
      await report(medium, 'close-medium-report');

      // It counts as done for the PIC and leaves their action list at once.
      const glPreview = await voices.dashboardPreview(groupLeader, {});
      expect(glPreview.summary.closedByMe).toBe(closedBefore + 1);
      expect(glPreview.summary.approves).toBe(false);
      const glWaiting = await voices.workItems(groupLeader, { action: 'me', limit: '100' });
      expect(glWaiting.items.map((item) => item.id)).not.toContain(medium);
      expect((await voices.detail(groupLeader, medium)).availableActions).not.toContain(
        'REPORT_DONE',
      );

      // The Section Head approves first, within two working days.
      const shPreview = await voices.dashboardPreview(sectionHead, {});
      expect(shPreview.summary).toMatchObject({ approves: true, toApprove: 1 });
      const toApprove = await voices.workItems(sectionHead, { action: 'approve', limit: '100' });
      expect(toApprove.items.map((item) => item.id)).toEqual([medium]);
      const shDetail = await voices.detail(sectionHead, medium);
      expect(shDetail.availableActions).toEqual(
        expect.arrayContaining(['APPROVE_CLOSURE', 'RETURN_CLOSURE']),
      );
      expect(shDetail.closureApproval).toMatchObject({
        note: 'Sudah dibayarkan.',
        steps: [
          { level: 'SECTION_HEAD', state: 'PENDING', late: false },
          { level: 'MANAGER', state: 'NEXT' },
        ],
      });
      // The reporter only sees that it waits.
      expect((await voices.detail(reporter, medium)).closureApproval).toMatchObject({
        steps: [],
      });
      // The Manager cannot skip ahead.
      await expect(approve(manager, medium, 'close-medium-skip')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });

      // Kembalikan: back to the PIC with a reason, who reports again.
      await voices.returnClosure(
        sectionHead,
        medium,
        { text: 'Lampirkan bukti transfer.', version: await version(medium) },
        'close-medium-return',
      );
      expect(
        await prisma.notification.count({
          where: { voiceId: medium, recipientId: groupLeader.accountId, type: 'CLOSURE_RETURNED' },
        }),
      ).toBe(1);
      expect((await voices.detail(groupLeader, medium)).availableActions).toContain('REPORT_DONE');
      await report(medium, 'close-medium-report-2');
      const reportedAt = (
        await prisma.closureReport.findFirstOrThrow({
          where: { voiceId: medium, state: 'PENDING' },
        })
      ).reportedAt;

      // A missed window keeps waiting at that level, late, with a notice.
      await prisma.closureApprovalStep.updateMany({
        where: { report: { voiceId: medium, state: 'PENDING' }, state: 'PENDING' },
        data: {
          dueAt: new Date(Date.now() - 60_000),
          remindedAt: new Date(Date.now() - 25 * 3_600_000),
        },
      });
      await targets.tick();
      expect(
        await prisma.notification.count({
          where: {
            voiceId: medium,
            recipientId: sectionHead.accountId,
            type: 'CLOSURE_APPROVAL',
            title: 'Persetujuan penyelesaian terlambat',
          },
        }),
      ).toBe(1);
      expect((await voices.detail(sectionHead, medium)).closureApproval?.steps[0]).toMatchObject({
        state: 'PENDING',
        late: true,
      });

      await approve(sectionHead, medium, 'close-medium-sh');
      expect(
        (await prisma.voice.findUniqueOrThrow({ where: { id: medium } })).closureApproverIds,
      ).toEqual([manager.accountId]);
      await approve(manager, medium, 'close-medium-mgr');
      const closed = await prisma.voice.findUniqueOrThrow({
        where: { id: medium },
        include: { closureCycles: true },
      });
      expect(closed.status).toBe('CLOSED');
      // Credited to the PIC, finished when they reported.
      expect(closed.closureCycles.at(-1)).toMatchObject({
        actorId: groupLeader.accountId,
        note: 'Sudah dibayarkan.',
        completedAt: reportedAt,
      });

      // Critical: up to the Deputy/Division Heads, who close it.
      const critical = await processedByGroupLeader('close-critical', Severity.CRITICAL);
      await report(critical, 'close-critical-report');
      expect(
        (await voices.detail(sectionHead, critical)).closureApproval?.steps.map(
          (step) => step.level,
        ),
      ).toEqual(['SECTION_HEAD', 'MANAGER', 'DIVISION']);
      await approve(sectionHead, critical, 'close-critical-sh');
      await approve(manager, critical, 'close-critical-mgr');
      expect((await voices.detail(divisionHead, critical)).availableActions).toContain(
        'APPROVE_CLOSURE',
      );
      await approve(divisionHead, critical, 'close-critical-dh');
      expect((await prisma.voice.findUniqueOrThrow({ where: { id: critical } })).status).toBe(
        'CLOSED',
      );
    } finally {
      await prisma.organizationMembership.delete({ where: { id: membership.id } });
    }
  });

  it('moves active location-owner Voices back to the reporter department chain', async () => {
    const groupLeader = await principal('700003');
    const reporterUnit = (
      await prisma.organizationMembership.findFirstOrThrow({
        where: { employee: { noReg: '700004' }, snapshot: { status: 'ACTIVE' } },
      })
    ).organizationUnitId;
    // The shop department the Voices were sent to, with its own Manager.
    const shopUnit = await prisma.organizationUnit.create({
      data: { directorate: 'Mfg', division: 'Div A', department: 'Paint Shop' },
    });
    const shopManager = await prisma.userAccount.create({
      data: {
        username: 'shop-manager',
        displayName: 'Shop Manager',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
      },
    });
    const shopRoute = await prisma.routeMapping.create({
      data: {
        kind: 'DEPARTMENT_HEAD',
        organizationUnitId: shopUnit.id,
        ownerAccountId: shopManager.id,
      },
    });
    await prisma.generalVoiceCategory.upsert({
      where: { key: 'WORK_DIFFICULTY' },
      update: { tiered: true },
      create: {
        key: 'WORK_DIFFICULTY',
        tiered: true,
        revisions: {
          create: { revision: 1, name: 'Kesulitan Kerja', definition: 'Work', examples: [] },
        },
        routes: { create: { mode: 'LOCATION_OWNER_DEPARTMENT' } },
      },
    });
    // Routed to the shop the way the incident-shop mode did.
    const sentToShop = async (key: string) => {
      const voice = await submitAs('700004', key, Severity.MEDIUM, 'TIER_WELFARE');
      return prisma.voice.update({
        where: { id: voice.id },
        data: {
          currentCategoryKey: 'WORK_DIFFICULTY',
          routeOwnerId: shopManager.id,
          routeMappingId: shopRoute.id,
          handlingOrganizationUnitId: shopUnit.id,
          handlingDepartmentSnapshot: 'Paint Shop',
          outsideReporter: true,
          tierLevel: 'MANAGER',
          tierPath: ['MANAGER'],
          tierHolderIds: [shopManager.id],
        },
      });
    };
    const open = await sentToShop('reroute-open');
    const processing = await sentToShop('reroute-processing');
    await prisma.voice.update({
      where: { id: processing.id },
      data: { status: 'IN_PROGRESS', currentHandlerId: shopManager.id, handlerType: 'MANAGER' },
    });
    await prisma.conversation.create({ data: { voiceId: processing.id } });
    await prisma.voiceHandlingTarget.create({
      data: {
        voiceId: processing.id,
        cycleNumber: processing.handlingCycleNumber,
        days: 3,
        dueAt: new Date(Date.now() + 3 * 86_400_000),
        setById: shopManager.id,
      },
    });
    // Handled in the reporter's own department already: never moved.
    const home = await submitAs('700004', 'reroute-home', Severity.MEDIUM, 'TIER_WELFARE');
    await prisma.voice.update({
      where: { id: home.id },
      data: { currentCategoryKey: 'WORK_DIFFICULTY' },
    });

    // Refused while the category still routes to the shop.
    await expect(planReroute(prisma, 'WORK_DIFFICULTY')).rejects.toThrow('Related Dept');
    await prisma.generalVoiceCategoryRoute.updateMany({
      where: { category: { key: 'WORK_DIFFICULTY' }, effectiveTo: null },
      data: { mode: 'RELATED_REPORTER_DEPARTMENT' },
    });

    const dry = await planReroute(prisma, 'WORK_DIFFICULTY');
    expect(dry.map((row) => row.voiceId).sort()).toEqual([open.id, processing.id].sort());
    expect(dry[0]).toMatchObject({ result: 'SIAP', from: 'Paint Shop', to: 'Assy 1' });
    // A dry run writes nothing.
    expect((await prisma.voice.findUniqueOrThrow({ where: { id: open.id } })).routeOwnerId).toBe(
      shopManager.id,
    );

    const moved = await commitReroute(prisma, 'WORK_DIFFICULTY');
    expect(moved.every((row) => row.result === 'DIPINDAH')).toBe(true);
    const manager = await principal('700001');
    for (const id of [open.id, processing.id])
      expect(await prisma.voice.findUniqueOrThrow({ where: { id } })).toMatchObject({
        routeOwnerId: manager.accountId,
        handlingOrganizationUnitId: reporterUnit,
        outsideReporter: false,
        currentHandlerId: null,
        tierLevel: 'GROUP_LEADER',
        tierPath: ['GROUP_LEADER', 'SECTION_HEAD', 'MANAGER'],
        tierHolderIds: [groupLeader.accountId],
      });
    expect((await prisma.voice.findUniqueOrThrow({ where: { id: open.id } })).status).toBe('OPEN');
    // Diproses starts over at Direspon without the old PIC's target.
    expect((await prisma.voice.findUniqueOrThrow({ where: { id: processing.id } })).status).toBe(
      'RESPONDED',
    );
    expect(await prisma.voiceHandlingTarget.count({ where: { voiceId: processing.id } })).toBe(0);
    expect((await voices.detail(groupLeader, processing.id)).availableActions).toContain('PROCEED');
    // The PIC line names whoever holds the Voice now, for the reporter too.
    const glName = (
      await prisma.userAccount.findUniqueOrThrow({ where: { id: groupLeader.accountId } })
    ).displayName;
    expect((await voices.detail(await principal('700004'), open.id)).holderNames).toEqual([glName]);
    await voices.proceed(
      groupLeader,
      processing.id,
      {
        days: 1,
        version: (await prisma.voice.findUniqueOrThrow({ where: { id: processing.id } })).version,
      },
      'reroute-proceed',
    );
    const processed = await voices.detail(groupLeader, processing.id);
    expect(processed.holderNames).toEqual([]);
    expect(processed.currentHandler?.displayName).toBe(glName);
    expect(
      await prisma.notification.count({
        where: {
          voiceId: open.id,
          recipientId: groupLeader.accountId,
          title: 'Voice dialihkan ke Anda',
        },
      }),
    ).toBe(1);
    // Running it again finds nothing left to move.
    expect(await planReroute(prisma, 'WORK_DIFFICULTY')).toEqual([]);
    expect((await prisma.voice.findUniqueOrThrow({ where: { id: home.id } })).version).toBe(
      home.version,
    );
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
