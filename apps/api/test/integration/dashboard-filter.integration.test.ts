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

let manager: Principal;
let unionHead: Principal;
let sourceRow = 0;
let seq = 0;

async function seedVoice(overrides: {
  department: string;
  severity?: Severity;
  area?: string;
  category?: string;
  status?: VoiceStatus;
  submittedAt?: Date;
}) {
  seq += 1;
  return prisma.voice.create({
    data: {
      displayId: `CARE-202608-${String(seq).padStart(6, '0')}`,
      reporterId: manager.accountId,
      visibility: VoiceVisibility.GENERAL,
      area: (overrides.area ?? 'KARAWANG_1') as never,
      reporterNoRegSnapshot: '000001',
      reporterNameSnapshot: 'Reporter',
      reporterDirectorateSnapshot: 'Manufacturing',
      reporterDivisionSnapshot: 'Division A',
      reporterDepartmentSnapshot: overrides.department,
      routeOwnerId: manager.accountId,
      status: overrides.status ?? VoiceStatus.OPEN,
      handlerType: HandlerType.MANAGER,
      locationDetail: 'line',
      title: 'dashboard voice',
      detail: 'detail',
      severity: overrides.severity ?? Severity.MEDIUM,
      category: (overrides.category ?? null) as never,
      anonymousAlias: `R-${seq}`,
      version: 1,
      submittedAt: overrides.submittedAt ?? new Date(),
    },
  });
}

describe('Dashboard filters and suppression metadata', () => {
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
    manager = await resolve(await workforce('000001', 'Manager', 'Department Head'));
    unionHead = await resolve(await union(UnionSlot.HEAD));
  });
  afterAll(async () => prisma.$disconnect());

  it('filters the aggregate by severity/area/status and echoes the filter', async () => {
    await seedVoice({ department: 'Department A', severity: Severity.HIGH, area: 'KARAWANG_1' });
    await seedVoice({ department: 'Department A', severity: Severity.LOW, area: 'SUNTER_1' });
    const high = await voices.dashboardGeneral(manager, { severity: 'HIGH' });
    expect(high.total).toBe(1);
    expect(high.filters).toMatchObject({ severity: 'HIGH', area: null, status: null });
    expect(high.generatedAt).toEqual(expect.any(String));
  });

  it('applies a date-range filter', async () => {
    await seedVoice({
      department: 'Department A',
      category: 'SAFETY',
      submittedAt: new Date('2026-01-05'),
    });
    await seedVoice({
      department: 'Department A',
      category: 'SAFETY',
      submittedAt: new Date('2026-06-05'),
    });
    const filtered = await voices.dashboardGeneral(manager, {
      from: '2026-01-01T00:00:00Z',
      to: '2026-02-01T00:00:00Z',
    });
    expect(filtered.total).toBe(1);
  });

  it('suppresses small department buckets for a scoped actor but not a full actor', async () => {
    // 6 voices in SuppA (kept) and 2 in SuppB (suppressed into OTHER_SUPPRESSED).
    for (let index = 0; index < 6; index += 1)
      await seedVoice({ department: 'SuppA', severity: Severity.MEDIUM });
    for (let index = 0; index < 2; index += 1)
      await seedVoice({ department: 'SuppB', severity: Severity.MEDIUM });

    const scoped = await voices.dashboardGeneral(manager, {});
    expect(scoped.suppression.enabled).toBe(true);
    expect(scoped.suppression.threshold).toBe(5);
    expect(scoped.department).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Manufacturing / Division A / SuppA' }),
      ]),
    );
    // A department with 2 voices is below the threshold and rolled up.
    expect(scoped.department).toContainEqual(
      expect.objectContaining({ label: 'OTHER_SUPPRESSED' }),
    );
    expect(scoped.suppression.department.suppressedValue).toBeGreaterThanOrEqual(2);
    expect(scoped.suppression.department.suppressedBuckets).toBeGreaterThanOrEqual(1);

    const full = await voices.dashboardGeneral(unionHead, {});
    expect(full.suppression.enabled).toBe(false);
    expect(full.department).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'OTHER_SUPPRESSED' })]),
    );
  });
});
