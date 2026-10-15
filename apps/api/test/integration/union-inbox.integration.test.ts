import {
  AccountKind,
  HandlerType,
  PrismaClient,
  Severity,
  UnionSlot,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AdminService } from '../../src/admin/admin.service';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { OrganizationDashboard } from '../../src/voices/dashboard';
import { privateObservers } from '../../src/voices/private-observers';
import { TierEscalationService } from '../../src/voices/tier-escalation.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);

let reporter: Principal;
let unionHead: Principal;
let officer: Principal;
let director: Principal;
let divisionHead: Principal;
let otherDirector: Principal;
let otherDivisionHead: Principal;
let admin: Principal;
let unitId: string;
let sourceRow = 0;
let seq = 0;

async function seedVoice(
  overrides: Partial<{
    currentHandlerId: string | null;
    handlerType: HandlerType;
    status: VoiceStatus;
    showReporterIdentity: boolean;
    tierDueAt: Date;
  }> = {},
) {
  seq += 1;
  return prisma.voice.create({
    data: {
      displayId: `CARE-202608-${String(seq).padStart(6, '0')}`,
      reporterId: reporter.accountId,
      visibility: VoiceVisibility.PRIVATE,
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: '000001',
      reporterNameSnapshot: 'Reporter',
      reporterDirectorateSnapshot: 'Manufacturing',
      reporterDivisionSnapshot: 'Division A',
      reporterDepartmentSnapshot: 'Department A',
      reporterOrganizationUnitId: unitId,
      routeOwnerId: unionHead.accountId,
      status: overrides.status ?? VoiceStatus.OPEN,
      handlerType: overrides.handlerType ?? HandlerType.UNION_HEAD,
      currentHandlerId: overrides.currentHandlerId ?? null,
      showReporterIdentity: overrides.showReporterIdentity ?? false,
      locationDetail: 'line',
      title: 'union inbox voice',
      detail: 'detail',
      severity: Severity.MEDIUM,
      categoryKey: null,
      anonymousAlias: `R-${seq}`,
      version: 1,
      ...(overrides.tierDueAt ? { tierDueAt: overrides.tierDueAt, tierDueKind: 'PROCESS' } : {}),
    },
  });
}

describe('Private Voices with the Komite and the directorate observers', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'c'.repeat(64), rowCount: 6, effectiveAt: new Date() },
    });
    const unit = await prisma.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Division A', department: 'Department A' },
    });
    unitId = unit.id;
    const otherUnit = await prisma.organizationUnit.create({
      data: { directorate: 'Engineering', division: 'Division E', department: 'Department E' },
    });

    const workforce = async (
      noReg: string,
      name: string,
      position: string,
      unitIdFor = unit.id,
    ) => {
      const employee = await prisma.employee.create({ data: { noReg, name } });
      const account = await prisma.userAccount.create({
        data: {
          username: `workforce-${noReg}`,
          displayName: name,
          passwordHash: 'test',
          accountKind: AccountKind.WORKFORCE,
          passwordChangeRequired: false,
          employeeId: employee.id,
        },
      });
      await prisma.organizationMembership.create({
        data: {
          snapshotId: snapshot.id,
          employeeId: employee.id,
          organizationUnitId: unitIdFor,
          employeeName: name,
          structuralPosition: position,
          section: 'Section A',
          sourceRow: (sourceRow += 1),
        },
      });
      return account;
    };
    const union = async (slot: UnionSlot) => {
      const account = await prisma.userAccount.create({
        data: {
          username: `union-${slot.toLowerCase()}`,
          displayName: 'Union',
          passwordHash: 'test',
          accountKind: AccountKind.UNION,
          passwordChangeRequired: false,
        },
      });
      await prisma.unionAccountTerm.create({ data: { accountId: account.id, slot } });
      return account;
    };
    const resolve = async (account: Parameters<typeof policy.resolvePrincipal>[0]) =>
      policy.resolvePrincipal(account, { id: crypto.randomUUID(), passwordRestricted: false });

    reporter = await resolve(await workforce('000001', 'Reporter', 'Member'));
    unionHead = await resolve(await union(UnionSlot.HEAD));
    officer = await resolve(await union(UnionSlot.OFFICER_1));
    director = await resolve(await workforce('000009', 'Direktur', 'Director'));
    divisionHead = await resolve(await workforce('000008', 'Kadiv', 'Division Head'));
    otherDirector = await resolve(
      await workforce('000019', 'Direktur Lain', 'Director', otherUnit.id),
    );
    otherDivisionHead = await resolve(
      await workforce('000018', 'Kadiv Lain', 'Division Head', otherUnit.id),
    );
    admin = await resolve(
      await prisma.userAccount.create({
        data: {
          username: 'care-admin',
          displayName: 'CARE Admin',
          passwordHash: 'test',
          accountKind: AccountKind.CARE_ADMIN,
          passwordChangeRequired: false,
        },
      }),
    );
  });
  afterAll(async () => prisma.$disconnect());

  it('scopes the Komite inbox to all Private voices and the officer inbox to assigned only', async () => {
    const unassigned = await seedVoice({});
    const assigned = await seedVoice({ currentHandlerId: officer.accountId });

    const headItems = await voices.workItems(unionHead, {});
    const headIds = headItems.items.map((item) => item.id);
    expect(headIds).toContain(unassigned.id);
    expect(headIds).toContain(assigned.id);
    const headById = new Map(headItems.items.map((item) => [item.id, item]));
    expect(headById.get(assigned.id)).toMatchObject({ currentHandlerName: 'Union' });
    expect(headById.get(unassigned.id)).toMatchObject({ currentHandlerName: null });

    const officerItems = await voices.workItems(officer, {});
    const officerIds = officerItems.items.map((item) => item.id);
    expect(officerIds).toContain(assigned.id);
    expect(officerIds).not.toContain(unassigned.id);
  });

  it('keeps every new Private Voice with the Komite: no officer assignment', async () => {
    const waiting = await seedVoice({});
    expect((await voices.detail(unionHead, waiting.id)).availableActions).toEqual([
      'RESPOND',
      'CHANGE_SEVERITY',
    ]);
    await expect(
      voices.assign(
        unionHead,
        waiting.id,
        { handlerAccountId: officer.accountId, text: 'Keterangan penanganan' },
        'assign-refused',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('omits pendingAssignment from the officer and reporter private aggregates', async () => {
    const officerAggregate = await voices.dashboardPrivate(officer, {});
    expect(officerAggregate.pendingAssignment).toBeUndefined();
    const reporterAggregate = await voices.dashboardPrivate(reporter, {});
    expect(reporterAggregate.pendingAssignment).toBeUndefined();
  });

  it("lets the Director read their directorate's Private Voices without acting, auditing each read", async () => {
    const anonymous = await seedVoice({});
    const identified = await seedVoice({
      currentHandlerId: officer.accountId,
      showReporterIdentity: true,
    });

    const list = await voices.workItems(director, { visibility: 'PRIVATE' });
    const byId = new Map(list.items.map((item) => [item.id, item]));
    expect(byId.get(anonymous.id)).toMatchObject({ reporterAlias: anonymous.anonymousAlias });
    expect(byId.has(identified.id)).toBe(true);
    // The Director holds no work: their own list stays empty without the Private view.
    expect((await voices.workItems(director, {})).items).toEqual([]);

    const hidden = await voices.detail(director, anonymous.id);
    expect(hidden).toMatchObject({
      audience: 'UNION_ANONYMOUS',
      anonymousReporter: { alias: anonymous.anonymousAlias },
      availableActions: [],
    });
    expect(hidden).not.toHaveProperty('reporter');
    expect(await voices.detail(director, identified.id)).toMatchObject({
      audience: 'UNION_IDENTIFIED',
      reporter: { name: 'Reporter' },
      availableActions: [],
    });
    const audits = await prisma.auditEvent.findMany({
      where: { actorId: director.accountId },
      select: { action: true, resourceId: true },
    });
    expect(audits).toEqual(
      expect.arrayContaining([
        { action: 'PRIVATE_LIST_READ', resourceId: 'list' },
        { action: 'PRIVATE_DETAIL_READ', resourceId: anonymous.id },
        { action: 'PRIVATE_DETAIL_READ', resourceId: identified.id },
      ]),
    );
    await expect(
      voices.assign(
        director,
        anonymous.id,
        { handlerAccountId: officer.accountId, expectedVersion: anonymous.version },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const aggregate = await new OrganizationDashboard(prisma as never).aggregate(director, {
      visibility: 'PRIVATE',
    });
    expect(aggregate.scopeLabel).toBe('Private Voice direktorat');
    expect(aggregate.total).toBe(
      await prisma.voice.count({
        where: { visibility: 'PRIVATE', reporterDirectorateSnapshot: 'Manufacturing' },
      }),
    );
    expect(aggregate.pendingAssignment).toBeUndefined();
    // The Private board reads today's counts and timeliness, never reporter origins.
    expect(aggregate.onTime).toEqual(expect.objectContaining({ total: expect.any(Number) }));
    expect(aggregate.statusToday).toBeDefined();
    expect(aggregate.reporterOrigins).toBeUndefined();
  });

  it("lets the directorate's Division Heads read Private Voices; other directorates cannot", async () => {
    const voice = await seedVoice({ status: VoiceStatus.RESPONDED });
    await prisma.conversation.create({ data: { voiceId: voice.id } });

    expect(await privateObservers(prisma as never, 'Manufacturing', reporter.accountId)).toEqual(
      [director.accountId, divisionHead.accountId].sort(),
    );

    const detail = await voices.detail(divisionHead, voice.id);
    expect(detail).toMatchObject({
      audience: 'UNION_ANONYMOUS',
      availableActions: [],
      conversationState: 'READ_ONLY',
    });
    await expect(voices.messages(divisionHead, voice.id, {})).resolves.toBeDefined();
    expect(
      (await voices.workItems(divisionHead, { visibility: 'PRIVATE' })).items.map((i) => i.id),
    ).toContain(voice.id);
    expect(
      await prisma.auditEvent.count({
        where: {
          actorId: divisionHead.accountId,
          action: 'PRIVATE_DETAIL_READ',
          resourceId: voice.id,
        },
      }),
    ).toBe(1);
    // Private joins the Division Head's category spread as one count.
    const view = await new OrganizationDashboard(prisma as never).aggregate(divisionHead, {});
    expect(view.category.find((bucket) => bucket.key === 'PRIVATE')).toMatchObject({
      name: 'Private',
      value: await prisma.voice.count({
        where: { visibility: 'PRIVATE', reporterDirectorateSnapshot: 'Manufacturing' },
      }),
    });

    for (const outsider of [otherDirector, otherDivisionHead]) {
      await expect(voices.detail(outsider, voice.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect((await voices.workItems(outsider, { visibility: 'PRIVATE' })).items).toEqual([]);
    }
  });

  it('tells the Komite and the directorate observers when a Private Voice runs late, in the chat too', async () => {
    const late = await seedVoice({
      status: VoiceStatus.RESPONDED,
      tierDueAt: new Date(Date.now() - 60_000),
    });
    await prisma.conversation.create({ data: { voiceId: late.id } });

    await new TierEscalationService(prisma as never).tick();

    const after = await prisma.voice.findUniqueOrThrow({ where: { id: late.id } });
    // It stays with the Komite: no tier, no escalation.
    expect(after).toMatchObject({ tierLevel: null, routeOwnerId: unionHead.accountId });
    expect(after.tierMissedDueAt).toEqual(after.tierDueAt);
    const told = await prisma.notification.findMany({
      where: { voiceId: late.id, type: 'TARGET_OVERDUE' },
      select: { recipientId: true, title: true },
    });
    expect(told.map((row) => row.recipientId).sort()).toEqual(
      [unionHead.accountId, director.accountId, divisionHead.accountId].sort(),
    );
    expect(told.find((row) => row.recipientId === divisionHead.accountId)?.title).toBe(
      'Private Voice belum diproses',
    );
    const notes = await prisma.message.findMany({
      where: { conversation: { voiceId: late.id }, kind: 'SYSTEM' },
      select: { text: true },
    });
    expect(notes).toEqual([{ text: 'Batas waktu proses terlewati' }]);
    // Once per deadline.
    await new TierEscalationService(prisma as never).tick();
    expect(
      await prisma.notification.count({ where: { voiceId: late.id, type: 'TARGET_OVERDUE' } }),
    ).toBe(3);
  });

  it('lets CARE Admin retire a Union Officer; the Komite takes over what it held', async () => {
    const held = await seedVoice({
      status: VoiceStatus.RESPONDED,
      currentHandlerId: officer.accountId,
    });
    const adminService = new AdminService(prisma as never, policy);
    const account = await prisma.userAccount.findUniqueOrThrow({
      where: { id: officer.accountId },
    });
    await adminService.setAccountStatus(
      admin,
      officer.accountId,
      { status: 'INACTIVE', reason: 'Tidak dipakai', expectedVersion: account.version },
      'retire-officer',
    );
    expect(
      await prisma.unionAccountTerm.count({
        where: { accountId: officer.accountId, effectiveTo: null },
      }),
    ).toBe(0);
    expect(
      (await prisma.userAccount.findUniqueOrThrow({ where: { id: officer.accountId } })).status,
    ).toBe('INACTIVE');
    expect((await voices.detail(unionHead, held.id)).availableActions).toContain('TAKE_OVER');

    // The Komite itself must be replaced, not switched off.
    const head = await prisma.userAccount.findUniqueOrThrow({ where: { id: unionHead.accountId } });
    await expect(
      adminService.setAccountStatus(
        admin,
        unionHead.accountId,
        { status: 'INACTIVE', reason: 'Coba', expectedVersion: head.version },
        'retire-head',
      ),
    ).rejects.toMatchObject({ code: 'UNION_SLOT_ACTIVE' });
  });
});
