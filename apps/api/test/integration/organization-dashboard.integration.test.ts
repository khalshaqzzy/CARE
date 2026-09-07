import { PrismaClient, type Prisma, type OrganizationUnit, type UserAccount } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { OrganizationDashboard, organizationKey } from '../../src/voices/dashboard';
import { VoicesService } from '../../src/voices/voices.service';

const db = new PrismaClient();
const policy = new PolicyService(db as never);
const dashboard = new OrganizationDashboard(db as never);
const voices = new VoicesService(db as never, {} as never, {} as never, policy);
let manager: Principal,
  deputy: Principal,
  section: Principal,
  director: Principal,
  head: Principal,
  officer: Principal,
  reporter: Principal;
let a: OrganizationUnit, b: OrganizationUnit, remote: OrganizationUnit;
let seq = 0;
const common = {
  basis: 'HANDLING' as const,
  from: '2026-08-01T00:00:00Z',
  to: '2026-08-30T23:59:59.999Z',
};
async function resolve(account: UserAccount) {
  return policy.resolvePrincipal(account, { id: crypto.randomUUID(), passwordRestricted: false });
}
async function seed(overrides: Partial<Prisma.VoiceUncheckedCreateInput> = {}) {
  seq++;
  return db.voice.create({
    data: {
      displayId: `CARE-202608-${String(seq).padStart(6, '0')}`,
      reporterId: reporter.accountId,
      visibility: 'GENERAL',
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: 'DASH-R',
      reporterNameSnapshot: 'Hidden Reporter',
      reporterOrganizationUnitId: remote.id,
      reporterDirectorateSnapshot: remote.directorate,
      reporterDivisionSnapshot: remote.division,
      reporterDepartmentSnapshot: remote.department,
      reporterSectionSnapshot: 'Remote section',
      handlingOrganizationUnitId: a.id,
      handlingDirectorateSnapshot: a.directorate,
      handlingDivisionSnapshot: a.division,
      handlingDepartmentSnapshot: a.department,
      handlingSectionSnapshot: 'Assembly',
      handlingOrganizationSource: 'ROUTE',
      routeOwnerId: manager.accountId,
      severity: 'CRITICAL',
      handlerType: 'MANAGER',
      title: 'Hidden Voice title',
      detail: 'Private detail text',
      locationDetail: 'line',
      anonymousAlias: `Reporter-${seq}`,
      status: 'OPEN',
      submittedAt: new Date('2026-08-10T12:00:00Z'),
      ...overrides,
    },
  });
}
describe('Organization dashboard scope, privacy and filtering', () => {
  beforeAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    const snap = await db.organizationSnapshot.create({
      data: {
        checksum: 'd'.repeat(64),
        rowCount: 9,
        status: 'ACTIVE',
        effectiveAt: new Date('2026-01-01'),
      },
    });
    a = await db.organizationUnit.create({
      data: { directorate: 'Production', division: 'Division A', department: 'Department A' },
    });
    b = await db.organizationUnit.create({
      data: { directorate: 'Production', division: 'Division A', department: 'Department B' },
    });
    remote = await db.organizationUnit.create({
      data: { directorate: 'Other', division: 'Division B', department: 'Department A' },
    });
    let row = 0;
    const workforce = async (name: string, unit: OrganizationUnit, position: string) => {
      const employee = await db.employee.create({ data: { noReg: `DASH-${++row}`, name } });
      const account = await db.userAccount.create({
        data: {
          username: `dash-${row}`,
          displayName: name,
          passwordHash: 'test',
          accountKind: 'WORKFORCE',
          employeeId: employee.id,
        },
      });
      await db.organizationMembership.create({
        data: {
          snapshotId: snap.id,
          employeeId: employee.id,
          organizationUnitId: unit.id,
          employeeName: name,
          structuralPosition: position,
          section: 'Assembly',
          sourceRow: row,
        },
      });
      return resolve(account);
    };
    manager = await workforce('Manager', a, 'Department Head');
    deputy = await workforce('Deputy', a, 'Deputy Division Head');
    section = await workforce('Section', a, 'Section Head');
    director = await workforce('Director', a, 'Director');
    reporter = await workforce('Reporter', remote, 'Member');
    await workforce('Sibling', b, 'Department Head');
    const union = async (slot: 'HEAD' | 'OFFICER_1') => {
      const account = await db.userAccount.create({
        data: {
          username: `dash-${slot}`,
          displayName: slot,
          passwordHash: 'test',
          accountKind: 'UNION',
        },
      });
      await db.unionAccountTerm.create({ data: { accountId: account.id, slot } });
      return resolve(account);
    };
    head = await union('HEAD');
    officer = await union('OFFICER_1');
  });
  beforeEach(async () => {
    await db.voice.deleteMany();
  });
  afterAll(() => db.$disconnect());
  it('counts incoming cross-division work by handling and switches to reporter snapshots', async () => {
    await seed();
    const handling = await dashboard.aggregate(manager, common);
    expect(handling.total).toBe(1);
    expect(handling.level).toBe('section');
    expect(handling.severity).toContainEqual({ label: 'CRITICAL', value: 1 });
    expect(handling.organization[0]?.label).toBe('Assembly');
    expect((await dashboard.aggregate(manager, { ...common, basis: 'REPORTER' })).total).toBe(0);
    expect(JSON.stringify(handling)).not.toMatch(
      /Hidden Reporter|Hidden Voice|Private detail|DASH-R/,
    );
  });
  it('keeps nullable category and organization buckets separate from other dimensions', async () => {
    await seed();
    await seed({
      status: 'CLOSED',
      severity: 'LOW',
      area: 'SUNTER_1',
      handlingSectionSnapshot: null,
    });
    await seed({ status: 'IN_PROGRESS', severity: 'HIGH', categoryKey: 'SAFETY' });
    const result = await dashboard.aggregate(director, { ...common, level: 'section' });
    expect(result.total).toBe(3);
    for (const dimension of ['status', 'severity', 'area', 'category', 'organization'] as const)
      expect(result[dimension].reduce((sum, bucket) => sum + bucket.value, 0)).toBe(3);
    expect(result.status).toEqual(
      expect.arrayContaining([
        { label: 'OPEN', value: 1 },
        { label: 'CLOSED', value: 1 },
        { label: 'IN_PROGRESS', value: 1 },
      ]),
    );
    expect(result.area).toEqual(
      expect.arrayContaining([
        { label: 'KARAWANG_1', value: 2 },
        { label: 'SUNTER_1', value: 1 },
      ]),
    );
    expect(result.category).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'NONE', value: 2 }),
        expect.objectContaining({ key: 'SAFETY', value: 1 }),
      ]),
    );
    expect(result.organization).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Assembly', value: 2 }),
        expect.objectContaining({ label: 'Belum ditugaskan ke section', value: 1 }),
      ]),
    );
  });
  it('expands all metrics when moving from department to division', async () => {
    await seed();
    for (let n = 0; n < 5; n++)
      await seed({
        handlingOrganizationUnitId: b.id,
        handlingDepartmentSnapshot: b.department,
        routeOwnerId: reporter.accountId,
      });
    expect((await dashboard.aggregate(manager, common)).total).toBe(1);
    expect((await dashboard.aggregate(manager, { ...common, level: 'department' })).total).toBe(6);
  });
  it('does not allow hierarchy filters or a new basis to open foreign details', async () => {
    const foreign = await seed({ routeOwnerId: reporter.accountId });
    await expect(voices.detail(manager, foreign.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      dashboard.aggregate(manager, {
        ...common,
        department: organizationKey([remote.directorate, remote.division, remote.department]),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await voices.dashboardPreview(manager, common)).items).toEqual([]);
  });
  it('returns small cross-detail cohorts as real numbers without suppression', async () => {
    for (let n = 0; n < 4; n++) await seed({ routeOwnerId: reporter.accountId });
    const result = await dashboard.aggregate(manager, common);
    expect(result.total).toBe(4);
    expect(result.severity).toEqual([{ label: 'CRITICAL', value: 4 }]);
    expect(result.organization).toEqual([
      {
        id: organizationKey([a.directorate, a.division, a.department, 'Assembly']),
        label: 'Assembly',
        value: 4,
      },
    ]);
    await seed({ routeOwnerId: reporter.accountId });
    expect((await dashboard.aggregate(manager, common)).total).toBe(5);
  });
  it('merges unknown organization rows into one bucket across departments and switches', async () => {
    await seed({ handlingSectionSnapshot: null });
    await seed({
      handlingOrganizationUnitId: b.id,
      handlingDepartmentSnapshot: b.department,
      handlingSectionSnapshot: null,
      routeOwnerId: reporter.accountId,
    });
    await seed({
      handlingSectionSnapshot: null,
      handlerType: 'SECTION_HEAD',
      currentHandlerId: section.accountId,
    });
    const division = organizationKey([a.directorate, a.division]);
    const result = await dashboard.aggregate(director, { ...common, level: 'section', division });
    expect(result.organization).toEqual([
      { id: 'section-unassigned', label: 'Belum ditugaskan ke section', value: 2 },
      { id: 'section-unknown', label: 'Section belum teridentifikasi', value: 1 },
    ]);
    // Repeating the same aggregate (simulated scope switch) is stable and never
    // duplicates the unknown bucket.
    const again = await dashboard.aggregate(director, { ...common, level: 'section', division });
    expect(again.organization).toEqual(result.organization);
    expect(
      again.organization.filter((b) => b.label === 'Belum ditugaskan ke section'),
    ).toHaveLength(1);
  });
  it('fills zero days and compares the same filters over the preceding period', async () => {
    await seed();
    await seed({ submittedAt: new Date('2026-07-15T12:00:00Z') });
    await seed({ severity: 'LOW', submittedAt: new Date('2026-07-15T12:00:00Z') });
    const result = await dashboard.aggregate(director, { ...common, severity: 'CRITICAL' });
    expect(result.previousTotal).toBe(1);
    expect(result.trend.length).toBe(31);
    expect(result.trend.reduce((n, b) => n + b.value, 0)).toBe(1);
    expect(result.trend.some((b) => b.value === 0)).toBe(true);
    expect(
      (await dashboard.aggregate(director, { ...common, from: '2020-01-01T00:00:00Z' })).trendGrain,
    ).toBe('month');
  });
  it('rejects invalid dates, enums and conflicting hierarchy parents', async () => {
    await expect(
      dashboard.aggregate(manager, { ...common, to: '2025-01-01T00:00:00Z' }),
    ).rejects.toMatchObject({ code: 'INVALID_DASHBOARD_FILTER' });
    await expect(
      dashboard.aggregate(manager, { ...common, severity: 'WRONG' as never }),
    ).rejects.toMatchObject({ code: 'INVALID_DASHBOARD_FILTER' });
    await expect(
      dashboard.aggregate(director, {
        ...common,
        division: organizationKey([remote.directorate, remote.division]),
        department: organizationKey([a.directorate, a.division, a.department]),
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ORGANIZATION' });
  });
  it('gives leadership default own-division departments and global division overview', async () => {
    for (let n = 0; n < 5; n++) {
      await seed();
      await seed({
        handlingOrganizationUnitId: remote.id,
        handlingDirectorateSnapshot: remote.directorate,
        handlingDivisionSnapshot: remote.division,
        handlingDepartmentSnapshot: remote.department,
      });
    }
    expect((await dashboard.aggregate(deputy, common)).total).toBe(5);
    expect((await dashboard.aggregate(deputy, { ...common, level: 'division' })).total).toBe(10);
    expect((await dashboard.aggregate(director, common)).total).toBe(10);
  });
  it('honors combined capabilities without section-head precedence narrowing manager data', async () => {
    await seed();
    expect(
      (
        await dashboard.aggregate(
          { ...manager, capabilities: [...manager.capabilities, 'SECTION_HEAD'] },
          common,
        )
      ).total,
    ).toBe(1);
    expect((await dashboard.aggregate(section, common)).total).toBe(1);
    expect((await voices.dashboardPreview(section, common)).items).toHaveLength(0);
    await seed({ currentHandlerId: section.accountId, handlerType: 'SECTION_HEAD' });
    expect((await dashboard.aggregate(section, common)).total).toBe(2);
    await expect(
      dashboard.aggregate(section, { ...common, level: 'department' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('uses a default PIC primary mapping division rather than unrelated employee division', async () => {
    const pic = {
      ...reporter,
      capabilities: ['MEMBER', 'MANAGER'] as Principal['capabilities'],
      routeUnitIds: [a.id],
    };
    await seed({ routeOwnerId: reporter.accountId });
    expect((await dashboard.aggregate(pic, common)).scopeLabel).toBe(a.department);
    const metadata = await dashboard.metadata(pic, common);
    expect(metadata.selected.department).toBe(
      organizationKey([a.directorate, a.division, a.department]),
    );
    expect(
      (
        await dashboard.metadata(pic, { ...common, level: 'department' })
      ).organization.department.map((o) => o.label),
    ).not.toContain(b.department);
    await expect(
      dashboard.metadata(pic, {
        ...common,
        department: organizationKey([remote.directorate, remote.division, remote.department]),
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it.each(['HANDLING', 'REPORTER'] as const)(
    'restores every dimension in a 12 → 17 → 12 roundtrip for %s',
    async (basis) => {
      const snapshots = (u: OrganizationUnit) => ({
        handlingOrganizationUnitId: u.id,
        handlingDirectorateSnapshot: u.directorate,
        handlingDivisionSnapshot: u.division,
        handlingDepartmentSnapshot: u.department,
        reporterOrganizationUnitId: u.id,
        reporterDirectorateSnapshot: u.directorate,
        reporterDivisionSnapshot: u.division,
        reporterDepartmentSnapshot: u.department,
        reporterSectionSnapshot: 'Assembly',
      });
      for (let i = 0; i < 12; i++)
        await seed({
          ...snapshots(a),
          severity: i < 4 ? 'HIGH' : i < 10 ? 'MEDIUM' : 'LOW',
          status: i < 6 ? 'OPEN' : i < 9 ? 'IN_PROGRESS' : 'CLOSED',
        });
      for (let i = 0; i < 5; i++)
        await seed({
          ...snapshots(b),
          routeOwnerId: reporter.accountId,
          severity: i < 2 ? 'HIGH' : 'MEDIUM',
        });
      const initial = await dashboard.aggregate(manager, { ...common, basis });
      expect(initial.total).toBe(12);
      for (let round = 0; round < 3; round++) {
        const wider = await dashboard.aggregate(manager, {
          ...common,
          basis,
          scopeMode: 'PARENT',
          level: 'department',
        });
        expect(wider.total).toBe(17);
        expect(wider.organization.map((b) => b.value).sort((a, b) => a - b)).toEqual([5, 12]);
        // Old URLs with only ancestors must also remain anchored in OWN mode.
        const returned = await dashboard.aggregate(manager, {
          ...common,
          basis,
          scopeMode: 'OWN',
          level: 'section',
          division: initial.selected.division,
        });
        expect(returned.total).toBe(12);
        for (const dimension of [
          'status',
          'severity',
          'category',
          'area',
          'organization',
          'trend',
        ] as const) {
          expect(returned[dimension]).toEqual(initial[dimension]);
          expect(wider[dimension].reduce((sum, b) => sum + b.value, 0)).toBe(17);
        }
        expect(returned.previousTotal).toBe(initial.previousTotal);
      }
    },
  );
  it.each(['HANDLING', 'REPORTER'] as const)(
    'rejects sibling filters and descendant bypasses on all three readers for %s',
    async (basis) => {
      for (const actor of [manager, section, deputy]) {
        const siblingPath =
          actor === deputy
            ? [remote.directorate, remote.division]
            : actor === manager
              ? [b.directorate, b.division, b.department]
              : [a.directorate, a.division, a.department, 'Other section'];
        for (const path of [siblingPath, [...siblingPath, 'Child'].slice(0, 4)]) {
          const key = ['directorate', 'division', 'department', 'section'][path.length - 1]!;
          const query = { ...common, basis, [key]: organizationKey(path) };
          for (const read of [
            () => dashboard.metadata(actor, query),
            () => dashboard.aggregate(actor, query),
            () => voices.dashboardPreview(actor, query),
          ])
            await expect(read()).rejects.toMatchObject({ code: 'NOT_FOUND' });
        }
      }
      const overview = await dashboard.metadata(manager, { basis, scopeMode: 'PARENT' });
      expect(overview.organization.department.map((o) => o.label)).toEqual([a.department]);
    },
  );
  it('opens all own-department sections without granting foreign section details', async () => {
    await seed({ handlingSectionSnapshot: 'Assembly' });
    await seed({ handlingSectionSnapshot: 'Other section', routeOwnerId: reporter.accountId });
    expect((await dashboard.aggregate(section, common)).total).toBe(1);
    const parent = await dashboard.aggregate(section, { ...common, scopeMode: 'PARENT' });
    expect(parent.total).toBe(2);
    expect(parent.organization).toHaveLength(2);
    expect(
      (await dashboard.metadata(section, { scopeMode: 'PARENT' })).organization.section.map(
        (o) => o.label,
      ),
    ).toEqual(['Assembly']);
    expect(
      (await voices.dashboardPreview(section, { ...common, scopeMode: 'PARENT' })).items,
    ).toEqual([]);
  });
  it('retains global division overview while restricting selectable divisions', async () => {
    await seed();
    await seed({
      handlingDirectorateSnapshot: remote.directorate,
      handlingDivisionSnapshot: remote.division,
      handlingDepartmentSnapshot: remote.department,
    });
    expect((await dashboard.aggregate(deputy, common)).total).toBe(1);
    const global = await dashboard.aggregate(deputy, { ...common, scopeMode: 'GLOBAL' });
    expect(global.total).toBe(2);
    expect(global.organization).toHaveLength(2);
    const meta = await dashboard.metadata(deputy, { scopeMode: 'GLOBAL' });
    expect(meta.organization.division.map((o) => o.label)).toEqual([a.division]);
  });
  it('allows exact additional PIC mappings without expanding their foreign division', async () => {
    const pic = {
      ...reporter,
      capabilities: ['MEMBER', 'MANAGER'] as Principal['capabilities'],
      organizationUnitId: a.id,
      routeUnitIds: [a.id, remote.id],
    };
    const query = {
      ...common,
      department: organizationKey([remote.directorate, remote.division, remote.department]),
    };
    await seed({
      handlingDirectorateSnapshot: remote.directorate,
      handlingDivisionSnapshot: remote.division,
      handlingDepartmentSnapshot: remote.department,
    });
    expect((await dashboard.aggregate(pic, query)).total).toBe(1);
    const cascade = await dashboard.metadata(pic, {
      basis: 'HANDLING',
      directorate: organizationKey([remote.directorate]),
    });
    expect(cascade.selected.department).toBe(query.department);
    expect(
      (
        await dashboard.aggregate(pic, {
          ...common,
          directorate: organizationKey([remote.directorate]),
        })
      ).total,
    ).toBe(1);
    expect((await dashboard.aggregate(pic, { ...common, scopeMode: 'PARENT' })).total).toBe(0);
  });
  it('fails closed when required own organization is missing', async () => {
    for (const actor of [
      { ...manager, organizationUnitId: null, routeUnitIds: [] },
      { ...section, section: null },
      { ...deputy, organizationUnitId: null },
    ])
      await expect(dashboard.aggregate(actor, common)).rejects.toMatchObject({
        code: 'DASHBOARD_ORGANIZATION_UNAVAILABLE',
      });
  });
  it('keeps all dimensions on one database snapshot during a concurrent submission', async () => {
    await seed();
    let inserted = false;
    const transactional = {
      $transaction: (run: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
        db.$transaction(
          async (tx) =>
            run(
              new Proxy(tx, {
                get(target, property) {
                  if (property === '$queryRaw')
                    return async (...args: Parameters<typeof tx.$queryRaw>) => {
                      const result = await tx.$queryRaw(...args);
                      if (!inserted) {
                        inserted = true;
                        await seed({ status: 'CLOSED', severity: 'LOW' });
                      }
                      return result;
                    };
                  return Reflect.get(target, property);
                },
              }),
            ),
          options,
        ),
    };
    const result = await new OrganizationDashboard(transactional as never).aggregate(
      manager,
      common,
    );
    expect(inserted).toBe(true);
    expect(result.total).toBe(1);
    for (const dimension of [
      'status',
      'severity',
      'category',
      'area',
      'organization',
      'trend',
    ] as const)
      expect(result[dimension].reduce((sum, b) => sum + b.value, 0)).toBe(1);
    expect((await dashboard.aggregate(manager, common)).total).toBe(2);
  });
  it('keeps Private data scoped to Union and never groups or filters by reporter organization', async () => {
    await seed({
      visibility: 'PRIVATE',
      routeOwnerId: head.accountId,
      currentHandlerId: officer.accountId,
      handlerType: 'UNION_OFFICER',
    });
    await seed({
      visibility: 'PRIVATE',
      routeOwnerId: head.accountId,
      currentHandlerId: null,
      handlerType: 'UNION_HEAD',
    });
    const q = { ...common, visibility: 'PRIVATE' as const };
    const officerData = await dashboard.aggregate(officer, q);
    expect(officerData.total).toBe(1);
    expect(officerData.pendingAssignment).toBeUndefined();
    expect(officerData.organization).toEqual([
      { id: officer.accountId, label: 'Union 1', value: 1 },
    ]);
    expect((await dashboard.aggregate(head, q)).pendingAssignment).toBe(1);
    expect((await dashboard.metadata(officer, q)).organization.section).toEqual([]);
    await expect(dashboard.aggregate(officer, { ...q, basis: 'REPORTER' })).rejects.toMatchObject({
      code: 'PRIVATE_DASHBOARD_FILTER',
    });
    await expect(
      dashboard.aggregate(officer, { ...q, handler: head.accountId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(dashboard.aggregate(manager, q)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('keeps preview to three authorized active items with severity priority', async () => {
    await seed({ severity: 'LOW' });
    for (let i = 0; i < 4; i++) await seed();
    await seed({ status: 'CLOSED' });
    const preview = await voices.dashboardPreview(manager, common);
    expect(preview.items).toHaveLength(3);
    expect(preview.items.every((v) => v.severity === 'CRITICAL')).toBe(true);
  });
});
