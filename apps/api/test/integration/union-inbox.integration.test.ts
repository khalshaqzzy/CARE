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
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);

let reporter: Principal;
let unionHead: Principal;
let officer: Principal;
let unitId: string;
let sourceRow = 0;
let seq = 0;

async function seedVoice(
  overrides: Partial<{
    currentHandlerId: string | null;
    handlerType: HandlerType;
    status: VoiceStatus;
    showReporterIdentity: boolean;
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
      category: null,
      anonymousAlias: `R-${seq}`,
      version: 1,
    },
  });
}

describe('Union private inbox scope and assignment queue', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'c'.repeat(64), rowCount: 3, effectiveAt: new Date() },
    });
    const unit = await prisma.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Division A', department: 'Department A' },
    });
    unitId = unit.id;

    const workforce = async (noReg: string, name: string, position: string) => {
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
          organizationUnitId: unit.id,
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
  });
  afterAll(async () => prisma.$disconnect());

  it('scopes the head inbox to all Private voices and the officer inbox to assigned only', async () => {
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

  it('filters the head queue to voices awaiting an officer assignment', async () => {
    const waiting = await seedVoice({});
    const assigned = await seedVoice({ currentHandlerId: officer.accountId });

    const queue = await voices.workItems(unionHead, { unassigned: 'true' });
    const queueIds = queue.items.map((item) => item.id);
    expect(queueIds).toContain(waiting.id);
    // Every already-assigned voice (this test's and earlier tests') is excluded.
    expect(queueIds).not.toContain(assigned.id);
  });

  it('ignores the unassigned flag for actors other than the Union Head', async () => {
    // Only the Union Head assignment queue honors the flag; the Officer inbox
    // must still return its assigned voices even when the flag is present.
    const assigned = await seedVoice({ currentHandlerId: officer.accountId });
    const officerItems = await voices.workItems(officer, { unassigned: 'true' });
    expect(officerItems.items.map((item) => item.id)).toContain(assigned.id);
  });

  it('reports pendingAssignment for the Union Head and shrinks it after assignment', async () => {
    const waiting = await seedVoice({});
    const withWaiting = await voices.dashboardPrivate(unionHead, {});
    expect(withWaiting.pendingAssignment).toBeGreaterThanOrEqual(1);
    const queue = await voices.workItems(unionHead, { unassigned: 'true' });
    expect(queue.items.map((item) => item.id)).toContain(waiting.id);

    // Assign the officer; the voice leaves the queue and the count follows.
    await voices.assign(
      unionHead,
      waiting.id,
      { handlerAccountId: officer.accountId },
      'assign-queue',
    );
    const after = await voices.dashboardPrivate(unionHead, {});
    expect(after.pendingAssignment).toBe((withWaiting.pendingAssignment ?? 1) - 1);
    const remaining = await voices.workItems(unionHead, { unassigned: 'true' });
    expect(remaining.items.map((item) => item.id)).not.toContain(waiting.id);
  });

  it('omits pendingAssignment from the officer and reporter private aggregates', async () => {
    const officerAggregate = await voices.dashboardPrivate(officer, {});
    expect(officerAggregate.pendingAssignment).toBeUndefined();
    const reporterAggregate = await voices.dashboardPrivate(reporter, {});
    expect(reporterAggregate.pendingAssignment).toBeUndefined();
  });
});
