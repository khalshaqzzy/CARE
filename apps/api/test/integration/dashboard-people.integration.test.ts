import { PrismaClient, type OrganizationUnit, type Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { DashboardPeople } from '../../src/voices/dashboard-people';
import { OrganizationDashboard } from '../../src/voices/dashboard';
import { VoicesService } from '../../src/voices/voices.service';

const db = new PrismaClient();
const policy = new PolicyService(db as never);
const people = new DashboardPeople(db as never);
const dashboard = new OrganizationDashboard(db as never);
const voices = new VoicesService(db as never, {} as never, {} as never, policy);
const hour = 3_600_000;
let unit: OrganizationUnit;
let remote: OrganizationUnit;
let manager: Principal,
  director: Principal,
  sectionHead: Principal,
  otherSectionHead: Principal,
  groupLeader: Principal,
  otherGroupLeader: Principal,
  member: Principal,
  idle: Principal,
  pending: Principal;
let seq = 0;

async function voice(overrides: Partial<Prisma.VoiceUncheckedCreateInput> = {}) {
  seq++;
  return db.voice.create({
    data: {
      displayId: `CARE-PEOPLE-${String(seq).padStart(6, '0')}`,
      reporterId: member.accountId,
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: 'PPL-R',
      reporterNameSnapshot: 'Rina Member',
      reporterOrganizationUnitId: unit.id,
      reporterDirectorateSnapshot: unit.directorate,
      reporterDivisionSnapshot: unit.division,
      reporterDepartmentSnapshot: unit.department,
      reporterSectionSnapshot: 'Assembly',
      handlingOrganizationUnitId: unit.id,
      handlingDirectorateSnapshot: unit.directorate,
      handlingDivisionSnapshot: unit.division,
      handlingDepartmentSnapshot: unit.department,
      handlingSectionSnapshot: 'Assembly',
      handlingOrganizationSource: 'ROUTE',
      routeOwnerId: manager.accountId,
      severity: 'MEDIUM',
      handlerType: 'MANAGER',
      title: 'Lampu jalur forklift redup',
      detail: 'Detail',
      locationDetail: 'Line 1',
      anonymousAlias: `Pelapor-${seq}`,
      status: 'OPEN',
      submittedAt: new Date('2026-08-10T01:00:00Z'),
      ...overrides,
    },
  });
}
async function event(
  voiceId: string,
  type: Prisma.VoiceEventUncheckedCreateInput['type'],
  actorId: string,
  occurredAt: Date,
  payload: Prisma.InputJsonValue = {},
) {
  await db.voiceEvent.create({
    data: {
      voiceId,
      type,
      actorId,
      actorAccountKind: 'WORKFORCE',
      actorCapabilities: [],
      payload,
      occurredAt,
    },
  });
}

describe('Dashboard people: handling performance and member participation', () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    const snapshot = await db.organizationSnapshot.create({
      data: { checksum: 'p'.repeat(64), rowCount: 12, status: 'ACTIVE' },
    });
    unit = await db.organizationUnit.create({
      data: { directorate: 'Production', division: 'Division A', department: 'GA & SHE' },
    });
    // Lines and Group Leaders belong to production shops.
    await db.shopLocation.create({ data: { organizationUnitId: unit.id, areas: [], aliases: [] } });
    remote = await db.organizationUnit.create({
      data: { directorate: 'Production', division: 'Division B', department: 'Logistics' },
    });
    let row = 0;
    const person = async (
      name: string,
      position: string,
      section: string,
      options: {
        line?: string;
        activated?: boolean;
        target?: OrganizationUnit;
        account?: boolean;
      } = {},
    ) => {
      const employee = await db.employee.create({ data: { noReg: `PPL-${++row}`, name } });
      await db.organizationMembership.create({
        data: {
          snapshotId: snapshot.id,
          employeeId: employee.id,
          organizationUnitId: (options.target ?? unit).id,
          employeeName: name,
          structuralPosition: position,
          section,
          lineName: options.line ?? null,
          sourceRow: row,
        },
      });
      if (options.account === false) return null;
      const account = await db.userAccount.create({
        data: {
          username: `ppl-${row}`,
          displayName: name,
          passwordHash: 'test',
          accountKind: 'WORKFORCE',
          employeeId: employee.id,
          passwordChangeRequired: options.activated === false,
        },
      });
      return policy.resolvePrincipal(account, {
        id: crypto.randomUUID(),
        passwordRestricted: false,
      });
    };
    manager = (await person('Dedi Manager', 'Department Head', 'Assembly'))!;
    director = (await person('Dina Director', 'Director', 'Assembly'))!;
    sectionHead = (await person('Andi SH', 'Section Head', 'Assembly'))!;
    otherSectionHead = (await person('Budi SH', 'Section Head', 'Welding'))!;
    groupLeader = (await person('Gita GL', 'Group Leader', 'Assembly', { line: 'Line 1' }))!;
    otherGroupLeader = (await person('Hadi GL', 'Group Leader', 'Welding', { line: 'Line 2' }))!;
    member = (await person('Rina Member', 'Member', 'Assembly', { line: 'Line 1' }))!;
    idle = (await person('Sari Member', 'Member', 'Assembly', { line: 'Line 1' }))!;
    pending = (await person('Tono Member', 'Member', 'Welding', { activated: false }))!;
    await person('Umar Kontrak', 'Member', 'Assembly', { account: false });
    await person('Remote Member', 'Member', 'Remote', { target: remote });
  });
  beforeEach(async () => {
    await db.rating.deleteMany();
    await db.closureCycle.deleteMany();
    await db.voiceHandlingTarget.deleteMany();
    await db.voiceEvent.deleteMany();
    await db.voice.deleteMany();
  });
  afterAll(() => db.$disconnect());

  it('attributes held Voices, missed windows, response time, overdue work and ratings', async () => {
    const at = (h: number) => new Date(new Date('2026-08-10T01:00:00Z').getTime() + h * hour);
    // Group Leader answered two hours after the Voice reached them.
    const answered = await voice({ tierHolderIds: [groupLeader.accountId], status: 'RESPONDED' });
    await event(answered.id, 'RESPONDED', groupLeader.accountId, at(2));
    // The Group Leader missed the window; the Section Head answered an hour after it arrived.
    const raised = await voice({
      tierHolderIds: [sectionHead.accountId],
      tierObserverIds: [groupLeader.accountId],
      status: 'RESPONDED',
    });
    await event(raised.id, 'ESCALATED', groupLeader.accountId, at(5), {
      automatic: true,
      holders: [sectionHead.accountId],
      previousHolders: [groupLeader.accountId],
    });
    await event(raised.id, 'RESPONDED', sectionHead.accountId, at(6));
    // An escalation recorded before previousHolders existed falls back to its carrier.
    const legacy = await voice();
    await event(legacy.id, 'ESCALATED', otherGroupLeader.accountId, at(3), {
      automatic: true,
      holders: [otherSectionHead.accountId],
    });
    // Processing past the live target, and a rated closure.
    const late = await voice({
      status: 'IN_PROGRESS',
      currentHandlerId: sectionHead.accountId,
      handlingCycleNumber: 1,
    });
    await db.voiceHandlingTarget.create({
      data: {
        voiceId: late.id,
        cycleNumber: 1,
        days: 1,
        setById: sectionHead.accountId,
        dueAt: new Date(Date.now() - hour),
      },
    });
    const closed = await voice({ status: 'CLOSED', currentHandlerId: sectionHead.accountId });
    const cycle = await db.closureCycle.create({
      data: {
        voiceId: closed.id,
        cycleNumber: 1,
        actorId: sectionHead.accountId,
        note: 'Selesai',
        closedAt: at(30),
      },
    });
    await db.rating.create({
      data: { closureCycleId: cycle.id, reporterId: member.accountId, score: 4 },
    });

    const { items } = await people.handlers(manager, {});
    const byName = Object.fromEntries(items.map((item) => [item.name, item]));
    expect(items.map((item) => item.name)).toEqual(['Andi SH', 'Budi SH', 'Gita GL', 'Hadi GL']);
    expect(byName['Gita GL']).toMatchObject({
      role: 'GROUP_LEADER',
      unitLabel: 'Assembly · Line 1',
      held: 2,
      autoEscalated: 1,
      onTimeRate: 0.5,
      averageResponseSeconds: 7200,
      overdue: 0,
    });
    expect(byName['Andi SH']).toMatchObject({
      role: 'SECTION_HEAD',
      held: 3,
      autoEscalated: 0,
      overdue: 1,
      averageResponseSeconds: 3600,
      averageRating: 4,
      ratingCount: 1,
    });
    expect(byName['Andi SH']!.onTimeRate).toBeCloseTo(2 / 3);
    expect(byName['Hadi GL']).toMatchObject({ held: 1, autoEscalated: 1, onTimeRate: 0 });
    expect(byName['Budi SH']).toMatchObject({ held: 1, onTimeRate: 1 });
  });

  it('limits each viewer to the leaders below them and refuses the rest', async () => {
    expect((await people.handlers(sectionHead, {})).items.map((item) => item.name)).toEqual([
      'Gita GL',
    ]);
    for (const viewer of [groupLeader, director, member])
      await expect(people.handlers(viewer, {})).rejects.toThrow();
    for (const viewer of [groupLeader, director])
      await expect(people.participation(viewer, {})).rejects.toThrow();
  });

  it('gives each leader their own figures with the attribution their leader sees', async () => {
    const at = (h: number) => new Date(new Date('2026-08-10T01:00:00Z').getTime() + h * hour);
    // Answered by the Group Leader two hours after it reached them.
    const answered = await voice({ tierHolderIds: [groupLeader.accountId], status: 'RESPONDED' });
    await event(answered.id, 'RESPONDED', groupLeader.accountId, at(2));
    // Closed by the Section Head a day after submit, rated 4.
    const closed = await voice({ status: 'CLOSED', currentHandlerId: sectionHead.accountId });
    const cycle = await db.closureCycle.create({
      data: {
        voiceId: closed.id,
        cycleNumber: 1,
        actorId: sectionHead.accountId,
        note: 'Selesai',
        closedAt: at(24),
      },
    });
    await db.rating.create({
      data: { closureCycleId: cycle.id, reporterId: member.accountId, score: 4 },
    });

    // Group Leaders have no people cards but do see their own figures.
    expect(await people.mine(groupLeader, {})).toMatchObject({
      held: 1,
      onTime: 1,
      onTimeRate: 1,
      averageResponseSeconds: 7200,
      responseSampleCount: 1,
      completionSampleCount: 0,
    });
    // The Section Head row matches what the Manager sees in Performa Responder.
    const own = await people.mine(sectionHead, {});
    expect(own).toMatchObject({
      held: 1,
      averageCompletionSeconds: 24 * 3600,
      completionSampleCount: 1,
      averageRating: 4,
      ratingCount: 1,
    });
    const row = (await people.handlers(manager, {})).items.find((p) => p.name === 'Andi SH');
    expect(row).toMatchObject({ held: own.held, averageRating: own.averageRating });
    for (const viewer of [director, member])
      await expect(people.mine(viewer, {})).rejects.toThrow();
  });

  it('leaves Group Leaders out of a department that is not an active shop', async () => {
    const shop = { organizationUnitId: unit.id };
    await db.shopLocation.update({ where: shop, data: { status: 'ARCHIVED' } });
    try {
      expect((await people.handlers(manager, {})).items.map((item) => item.name)).toEqual([
        'Andi SH',
        'Budi SH',
      ]);
      expect((await people.handlers(sectionHead, {})).items).toEqual([]);
    } finally {
      await db.shopLocation.update({ where: shop, data: { status: 'ACTIVE' } });
    }
  });

  it('counts every Voice a member sent in the period, including Private, without content', async () => {
    await voice({ submittedAt: new Date('2026-08-05T01:00:00Z') });
    await voice({ visibility: 'PRIVATE', submittedAt: new Date('2026-08-12T01:00:00Z') });
    await voice({ submittedAt: new Date('2026-06-01T01:00:00Z') });
    const result = await people.participation(manager, {
      basis: 'REPORTER',
      from: '2026-08-01T00:00:00Z',
      to: '2026-08-31T23:59:59.999Z',
    });
    const byName = Object.fromEntries(result.members.map((m) => [m.name, m]));
    expect(result.members.some((m) => m.name === 'Dedi Manager')).toBe(false);
    expect(result.members.some((m) => m.name === 'Remote Member')).toBe(false);
    expect(byName['Rina Member']).toMatchObject({
      voiceCount: 2,
      lastSubmittedAt: '2026-08-12T01:00:00.000Z',
      activated: true,
      unitLabel: 'Assembly · Line 1',
    });
    expect(byName['Sari Member']).toMatchObject({ voiceCount: 0, activated: true });
    expect(byName['Tono Member']).toMatchObject({ voiceCount: 0, activated: false });
    expect(byName['Umar Kontrak']).toMatchObject({ voiceCount: 0, activated: false });
    expect(JSON.stringify(result)).not.toContain('Lampu jalur');
    // A Section Head sees the members of their own Section only.
    const own = await people.participation(sectionHead, { basis: 'REPORTER' });
    expect(own.members.every((m) => m.unitLabel.startsWith('Assembly'))).toBe(true);
    expect(own.members.some((m) => m.name === 'Tono Member')).toBe(false);
    expect(idle.accountId).toBeTruthy();
    expect(pending.accountId).toBeTruthy();
  });

  it('adds today, timeliness, origins, overdue team Voices and the other basis total', async () => {
    const now = new Date();
    await voice({ submittedAt: now, reporterDepartmentSnapshot: 'Logistics' });
    const answered = await voice({ status: 'RESPONDED', submittedAt: now });
    await event(answered.id, 'RESPONDED', groupLeader.accountId, now);
    const missed = await voice({ status: 'RESPONDED', submittedAt: now });
    await event(missed.id, 'ESCALATED', groupLeader.accountId, now, { automatic: true });
    await voice({ status: 'OPEN', tierDueAt: new Date(now.getTime() - hour) });

    const handling = await dashboard.aggregate(manager, { basis: 'HANDLING' });
    expect(handling.statusToday?.find((b) => b.label === 'OPEN')?.value).toBe(3);
    expect(handling.statusToday?.find((b) => b.label === 'RESPONDED')?.value).toBe(1);
    expect(handling.onTime).toEqual({ onTime: 1, total: 2 });
    expect(handling.reporterOrigins?.[0]).toMatchObject({ label: 'GA & SHE', value: 3 });
    expect(handling.reporterOrigins?.find((b) => b.label === 'Logistics')?.value).toBe(1);
    // The Logistics reporter's Voice is outside this unit's Voice Tim Saya scope.
    expect(handling.otherBasisTotal).toBe(3);
    expect(handling.previousPerformance).toBeNull();
    expect('teamOverdue' in handling).toBe(false);

    const team = await dashboard.aggregate(manager, { basis: 'REPORTER' });
    expect(team.teamOverdue).toBe(1);
    expect('reporterOrigins' in team).toBe(false);

    const ranged = await dashboard.aggregate(manager, {
      basis: 'HANDLING',
      from: new Date(now.getTime() - 24 * hour).toISOString(),
      to: new Date(now.getTime() + hour).toISOString(),
    });
    expect(ranged.previousPerformance).toEqual({
      averageResponseSeconds: null,
      averageCompletionSeconds: null,
    });
    // Director and Union keep one handling dashboard without the switcher total.
    expect('otherBasisTotal' in (await dashboard.aggregate(director, {}))).toBe(false);
  });

  it('orders General preview by the deadline that applies and shows the reporter', async () => {
    const now = Date.now();
    await voice({ title: 'Tanpa batas', severity: 'CRITICAL' });
    await voice({ title: 'Batas nanti', tierDueAt: new Date(now + 4 * hour) });
    await voice({ title: 'Batas terdekat', tierDueAt: new Date(now + hour), severity: 'LOW' });
    const preview = await voices.dashboardPreview(manager, { basis: 'HANDLING' });
    expect(preview.items.map((item) => item.title)).toEqual([
      'Batas terdekat',
      'Batas nanti',
      'Tanpa batas',
    ]);
    expect(preview.items[0]).toMatchObject({
      tierDueAt: new Date(now + hour).toISOString(),
      reporterName: 'Rina Member',
      reporterDepartment: 'GA & SHE',
    });
    expect('reporterAlias' in preview.items[0]!).toBe(false);
  });

  it('summarizes what needs action, and Voice Member filters and orders to match', async () => {
    const now = Date.now();
    await voice({
      title: 'Lewat',
      severity: 'CRITICAL',
      tierDueAt: new Date(now - hour),
    });
    await voice({ title: 'Segera', status: 'RESPONDED', tierDueAt: new Date(now + 3 * hour) });
    await voice({
      title: 'Baru',
      severity: 'LOW',
      tierDueAt: new Date(now + 30 * hour),
      submittedAt: new Date(now),
    });
    const target = await voice({
      title: 'Target lewat',
      status: 'IN_PROGRESS',
      currentHandlerId: manager.accountId,
      handlingCycleNumber: 1,
    });
    await db.voiceHandlingTarget.create({
      data: {
        voiceId: target.id,
        cycleNumber: 1,
        days: 1,
        setById: manager.accountId,
        dueAt: new Date(now - hour),
      },
    });
    await voice({ title: 'Tutup', status: 'CLOSED' });

    const preview = await voices.dashboardPreview(manager, { basis: 'HANDLING' });
    expect(preview.summary).toEqual({
      total: 4,
      open: 2,
      overdue: 2,
      dueSoon: 1,
      critical: 1,
      // Same cohort as the counts, closed included.
      status: [
        { label: 'OPEN', value: 2 },
        { label: 'RESPONDED', value: 1 },
        { label: 'IN_PROGRESS', value: 1 },
        { label: 'CLOSED', value: 1 },
      ],
    });
    const titles = async (query: Parameters<VoicesService['workItems']>[1]) =>
      (await voices.workItems(manager, query)).items.map((item) => item.title);
    // Each summary tile opens exactly the Voices it counts.
    expect((await titles({ due: 'OVERDUE' })).sort()).toEqual(['Lewat', 'Target lewat']);
    expect(await titles({ due: 'SOON' })).toEqual(['Segera']);
    // Perlu tindakan: Terbuka first, nearest deadline first; a new low Voice is not buried.
    expect(await titles({ statusGroup: 'ACTIVE' })).toEqual([
      'Lewat',
      'Baru',
      'Segera',
      'Target lewat',
    ]);
    expect((await titles({ statusGroup: 'ACTIVE', sort: 'newest' }))[0]).toBe('Baru');
    const [first] = (await voices.workItems(manager, { statusGroup: 'ACTIVE' })).items;
    expect(first).toMatchObject({ tierDueAt: new Date(now - hour) });
    await expect(voices.workItems(manager, { due: 'LATER' })).rejects.toThrow();
  });

  it('lists the unit the dashboard counts when Voice Member asks for scope=unit', async () => {
    // Held by the Section Head below: in the unit, not in the Manager's own work list.
    await voice({
      title: 'Dipegang Section Head',
      tierLevel: 'SECTION_HEAD',
      tierHolderIds: [sectionHead.accountId],
    });
    await voice({ title: 'Route Manager' });
    await voice({ title: 'Selesai unit', status: 'CLOSED' });
    const titles = async (query: Parameters<VoicesService['workItems']>[1]) =>
      (await voices.workItems(manager, query)).items.map((item) => item.title).sort();
    expect(await titles({ statusGroup: 'ACTIVE' })).toEqual(['Route Manager']);
    const unit = await titles({ statusGroup: 'ALL', scope: 'unit' });
    expect(unit).toEqual(['Dipegang Section Head', 'Route Manager', 'Selesai unit']);
    // The list and the summary describe the same Voices.
    const preview = await voices.dashboardPreview(manager, { basis: 'HANDLING' });
    const counted = preview.summary.status.reduce((sum, row) => sum + row.value, 0);
    expect(counted).toBe(unit.length);
    expect(preview.summary.total).toBe(
      (await titles({ statusGroup: 'ACTIVE', scope: 'unit' })).length,
    );
  });
});
