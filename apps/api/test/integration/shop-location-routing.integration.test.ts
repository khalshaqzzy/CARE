import {
  AccountKind,
  GeneralVoiceCategoryRouteMode,
  PrismaClient,
  RouteKind,
  Severity,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { ShopLocationsService } from '../../src/shops/shop-locations.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const shops = new ShopLocationsService(prisma as never);
const voices = new VoicesService(
  prisma as never,
  {} as never,
  {} as never,
  policy,
  undefined,
  undefined,
  shops,
);

let officeReporter: Principal;
let assyReporter: Principal;
let admin: Principal;
const heads: Record<string, Principal> = {};
const units: Record<string, string> = {};
const shopIds: Record<string, string> = {};
let sequence = 0;

async function draft(
  reporter: Principal,
  area: 'KARAWANG_1' | 'KARAWANG_3' | 'SUNTER_1',
  locationDetail: string,
  category = 'SHOP_WORK_DIFFICULTY',
  severity: Severity = Severity.MEDIUM,
) {
  const created = await voices.createDraft(reporter, {
    visibility: 'GENERAL',
    area,
    locationDetail,
    title: 'Torque wrench sering error',
    detail: 'Torque wrench di stasiun 5 sering error dan menghambat line.',
  });
  await voices.manualClassification(reporter, created.id, {
    category,
    severity,
  });
  return created.id;
}

async function submit(reporter: Principal, id: string) {
  const preview = await voices.previewDraft(reporter, id);
  sequence += 1;
  const result = (await voices.submit(
    reporter,
    id,
    { version: preview.version },
    `shop-routing-submit-${sequence}`,
  )) as { id: string };
  return prisma.voice.findUniqueOrThrow({ where: { id: result.id } });
}

describe('Incident shop routing', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 's'.repeat(64), rowCount: 8, effectiveAt: new Date() },
    });
    for (const department of [
      'Assembly & PIO Production #1 Dept',
      'Assembly & PIO Production #2 Dept',
      'Logistic Operation Unit Dept',
      'Smart Plant Facility Mfg Dept',
      'Office Dept X',
    ])
      units[department] = (
        await prisma.organizationUnit.create({
          data: { directorate: 'Manufacturing & PE Dir', division: 'Production Div', department },
        })
      ).id;
    let row = 0;
    const makeWorkforce = async (
      name: string,
      structuralPosition: string,
      department: string,
      section: string,
    ) => {
      row += 1;
      const noReg = String(700_000 + row);
      const employee = await prisma.employee.create({ data: { noReg, name } });
      const account = await prisma.userAccount.create({
        data: {
          username: `shop-${noReg}`,
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
          organizationUnitId: units[department]!,
          employeeName: name,
          structuralPosition,
          section,
          sourceRow: row,
        },
      });
      if (structuralPosition === 'Department Head')
        await prisma.routeMapping.create({
          data: {
            kind: RouteKind.DEPARTMENT_HEAD,
            organizationUnitId: units[department]!,
            ownerAccountId: account.id,
          },
        });
      return policy.resolvePrincipal(account, {
        id: crypto.randomUUID(),
        passwordRestricted: false,
      });
    };
    for (const department of Object.keys(units))
      heads[department] = await makeWorkforce(
        `Head ${department}`,
        'Department Head',
        department,
        'Management',
      );
    await makeWorkforce(
      'Section Head Assy Line 1',
      'Section Head',
      'Assembly & PIO Production #1 Dept',
      'Assy Line 1 Karawang 1 Sect',
    );
    officeReporter = await makeWorkforce('Office Reporter', 'Member', 'Office Dept X', 'Admin');
    assyReporter = await makeWorkforce(
      'Assy 2 Reporter',
      'Member',
      'Assembly & PIO Production #2 Dept',
      'Line 2',
    );
    const adminAccount = await prisma.userAccount.create({
      data: {
        username: 'shop-routing-admin',
        displayName: 'CARE Admin',
        passwordHash: 'test',
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
    admin = await policy.resolvePrincipal(adminAccount, {
      id: crypto.randomUUID(),
      passwordRestricted: false,
    });

    const category = (key: string, mode: GeneralVoiceCategoryRouteMode, unit?: string) =>
      prisma.generalVoiceCategory.create({
        data: {
          key,
          revisions: {
            create: { revision: 1, name: key, definition: `${key} definition`, examples: [] },
          },
          routes: { create: { mode, ...(unit ? { organizationUnitId: unit } : {}) } },
        },
      });
    await category('SHOP_WORK_DIFFICULTY', GeneralVoiceCategoryRouteMode.LOCATION_OWNER_DEPARTMENT);
    await category(
      'SHOP_FACILITY_REPAIR',
      GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT,
      units['Smart Plant Facility Mfg Dept'],
    );

    const addShop = async (department: string, areas: string[], aliases: string[]) =>
      (
        await shops.create(
          admin,
          { organizationUnitId: units[department], areas, aliases },
          `shop-create-${department}`,
        )
      ).id;
    shopIds.assy1 = await addShop(
      'Assembly & PIO Production #1 Dept',
      ['KARAWANG_1'],
      ['Assy', 'asy', 'Assy #1', 'assembly 1'],
    );
    shopIds.assy2 = await addShop(
      'Assembly & PIO Production #2 Dept',
      ['KARAWANG_1'],
      ['assy', 'assy 2'],
    );
    shopIds.logistic = await addShop(
      'Logistic Operation Unit Dept',
      ['KARAWANG_3', 'SUNTER_1', 'SUNTER_2'],
      ['logistic', 'gudang', 'warehouse'],
    );
  });

  afterAll(async () => prisma.$disconnect());

  it('routes an outsider report inside a shop to the shop manager', async () => {
    const id = await draft(officeReporter, 'KARAWANG_1', 'asy line 2 dekat pos 3');
    const preview = await voices.previewDraft(officeReporter, id);
    expect(preview.shopResolution).toMatchObject({
      applies: true,
      status: 'RESOLVED',
      source: 'ALIAS',
      shop: { id: shopIds.assy1, department: 'Assembly & PIO Production #1 Dept' },
    });
    expect(preview.routeReadiness).toMatchObject({ ready: true });
    const voice = await submit(officeReporter, id);
    expect(voice).toMatchObject({
      routeOwnerId: heads['Assembly & PIO Production #1 Dept']!.accountId,
      shopLocationId: shopIds.assy1,
      shopOrganizationUnitId: units['Assembly & PIO Production #1 Dept'],
      shopDepartmentSnapshot: 'Assembly & PIO Production #1 Dept',
      shopResolutionSource: 'ALIAS',
    });
    const manager = heads['Assembly & PIO Production #1 Dept']!;
    const detail = await voices.detail(manager, voice.id);
    expect(detail).toMatchObject({
      shopLocation: { department: 'Assembly & PIO Production #1 Dept', source: 'ALIAS' },
    });
    expect(await voices.assignmentCandidates(manager, voice.id)).toEqual([
      expect.objectContaining({
        displayName: 'Section Head Assy Line 1',
        section: 'Assy Line 1 Karawang 1 Sect',
      }),
    ]);
  });

  it('requires a confirmation for an ambiguous shop and honors the answer', async () => {
    const id = await draft(officeReporter, 'KARAWANG_1', 'assy dekat pos 3');
    const preview = await voices.previewDraft(officeReporter, id);
    expect(preview.shopResolution).toMatchObject({
      applies: true,
      status: 'NEEDS_CONFIRMATION',
      candidates: expect.arrayContaining([
        { id: shopIds.assy1, department: 'Assembly & PIO Production #1 Dept' },
        { id: shopIds.assy2, department: 'Assembly & PIO Production #2 Dept' },
      ]),
    });
    expect(preview.routeReadiness).toMatchObject({
      ready: false,
      reason: 'SHOP_CONFIRMATION_REQUIRED',
    });
    await expect(
      voices.submit(officeReporter, id, { version: preview.version }, 'shop-routing-ambiguous'),
    ).rejects.toMatchObject({ code: 'SHOP_CONFIRMATION_REQUIRED' });
    await expect(
      voices.confirmShop(officeReporter, id, {
        shopLocationId: shopIds.logistic,
        expectedVersion: preview.version,
      }),
    ).rejects.toMatchObject({ code: 'SHOP_LOCATION_UNAVAILABLE' });
    const confirmed = await voices.confirmShop(officeReporter, id, {
      shopLocationId: shopIds.assy2,
      expectedVersion: preview.version,
    });
    expect(confirmed.shopResolution).toMatchObject({
      status: 'RESOLVED',
      source: 'REPORTER_CONFIRMED',
      shop: { id: shopIds.assy2 },
    });
    const voice = await submit(officeReporter, id);
    expect(voice.routeOwnerId).toBe(heads['Assembly & PIO Production #2 Dept']!.accountId);
    expect(voice.shopResolutionSource).toBe('REPORTER_CONFIRMED');
  });

  it('breaks an ambiguous alias with the reporter own shop', async () => {
    const id = await draft(assyReporter, 'KARAWANG_1', 'assy dekat pos 3');
    const voice = await submit(assyReporter, id);
    expect(voice.routeOwnerId).toBe(heads['Assembly & PIO Production #2 Dept']!.accountId);
  });

  it('keeps reporter-department routing outside a shop and after a not-shop answer', async () => {
    const office = await draft(officeReporter, 'KARAWANG_1', 'Ruang meeting lantai 2');
    expect((await voices.previewDraft(officeReporter, office)).shopResolution).toMatchObject({
      status: 'NOT_SHOP',
      source: 'NO_MATCH',
    });
    const officeVoice = await submit(officeReporter, office);
    expect(officeVoice).toMatchObject({
      routeOwnerId: heads['Office Dept X']!.accountId,
      shopLocationId: null,
      shopResolutionSource: 'NO_MATCH',
    });

    const answered = await draft(officeReporter, 'KARAWANG_1', 'asy line 2');
    const preview = await voices.previewDraft(officeReporter, answered);
    await voices.confirmShop(officeReporter, answered, {
      shopLocationId: null,
      expectedVersion: preview.version,
    });
    const answeredVoice = await submit(officeReporter, answered);
    expect(answeredVoice).toMatchObject({
      routeOwnerId: heads['Office Dept X']!.accountId,
      shopResolutionSource: 'REPORTER_NOT_SHOP',
    });
  });

  it('clears a confirmation when the location text changes', async () => {
    const id = await draft(officeReporter, 'KARAWANG_1', 'assy dekat pos 3');
    const preview = await voices.previewDraft(officeReporter, id);
    await voices.confirmShop(officeReporter, id, {
      shopLocationId: shopIds.assy1,
      expectedVersion: preview.version,
    });
    const updated = await voices.updateDraft(officeReporter, id, {
      locationDetail: 'assy dekat pos 4',
    });
    expect(updated).toMatchObject({ shopConfirmation: null, confirmedShopLocationId: null });
  });

  it('matches a multi-area shop only within its areas', async () => {
    const sunter = await draft(officeReporter, 'SUNTER_1', 'Gudang rak 3 dekat dock B');
    expect((await submit(officeReporter, sunter)).routeOwnerId).toBe(
      heads['Logistic Operation Unit Dept']!.accountId,
    );
    const karawang1 = await draft(officeReporter, 'KARAWANG_1', 'gudang belakang');
    expect((await voices.previewDraft(officeReporter, karawang1)).shopResolution).toMatchObject({
      status: 'NOT_SHOP',
      areaShops: expect.not.arrayContaining([expect.objectContaining({ id: shopIds.logistic })]),
    });
  });

  it('keeps fixed categories fixed and hands over to the incident shop', async () => {
    const id = await draft(officeReporter, 'KARAWANG_1', 'asy line 2', 'SHOP_FACILITY_REPAIR');
    const preview = await voices.previewDraft(officeReporter, id);
    expect(preview.shopResolution).toMatchObject({ applies: false, status: 'RESOLVED' });
    const voice = await submit(officeReporter, id);
    const facility = heads['Smart Plant Facility Mfg Dept']!;
    expect(voice).toMatchObject({
      routeOwnerId: facility.accountId,
      shopOrganizationUnitId: units['Assembly & PIO Production #1 Dept'],
    });
    const options = await voices.handoverOptions(facility, voice.id);
    expect(options.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: expect.objectContaining({ key: 'SHOP_WORK_DIFFICULTY' }),
          routeMode: 'LOCATION_OWNER_DEPARTMENT',
          isReporterDepartment: false,
          department: expect.objectContaining({
            department: 'Assembly & PIO Production #1 Dept',
          }),
          available: true,
        }),
      ]),
    );
  });

  it('administers shop locations with conflicts and unmatched texts', async () => {
    await expect(
      shops.create(
        admin,
        {
          organizationUnitId: units['Logistic Operation Unit Dept'],
          areas: ['SUNTER_2'],
          aliases: [],
        },
        'shop-create-duplicate',
      ),
    ).rejects.toMatchObject({ code: 'SHOP_LOCATION_EXISTS' });
    const list = await shops.list();
    const logistic = list.find((item) => item.id === shopIds.logistic)!;
    expect(logistic).toMatchObject({
      areas: ['KARAWANG_3', 'SUNTER_1', 'SUNTER_2'],
      aliases: ['logistic', 'gudang', 'warehouse'],
      health: 'HEALTHY',
    });
    await expect(
      shops.update(
        admin,
        logistic.id,
        { areas: ['SUNTER_1'], aliases: ['Gudang #1'], expectedVersion: logistic.version + 5 },
        'shop-update-stale',
      ),
    ).rejects.toMatchObject({ code: 'SHOP_LOCATION_VERSION_CONFLICT' });
    const updated = await shops.update(
      admin,
      logistic.id,
      {
        areas: ['SUNTER_1'],
        aliases: ['Gudang #1', 'gudang 1'],
        expectedVersion: logistic.version,
      },
      'shop-update-ok',
    );
    expect(updated).toMatchObject({ areas: ['SUNTER_1'], aliases: ['gudang 1'] });
    expect(await shops.unmatched()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: 'KARAWANG_1', locationDetail: 'Ruang meeting lantai 2' }),
      ]),
    );
  });
  it('starts a tiered outsider report at the shop Manager with the outside badge', async () => {
    await prisma.generalVoiceCategory.update({
      where: { key: 'SHOP_WORK_DIFFICULTY' },
      data: { tiered: true },
    });
    try {
      const id = await draft(officeReporter, 'KARAWANG_1', 'asy line 2 dekat pos 4');
      const voice = await submit(officeReporter, id);
      const manager = heads['Assembly & PIO Production #1 Dept']!;
      expect(voice).toMatchObject({
        outsideReporter: true,
        tierLevel: 'MANAGER',
        tierHolderIds: [manager.accountId],
        routeOwnerId: manager.accountId,
      });
      const detail = await voices.detail(manager, voice.id);
      expect(detail).toMatchObject({ outsideReporter: true, tierLevel: 'MANAGER' });
      expect(detail.availableActions).toEqual(
        expect.arrayContaining(['RESPOND', 'ASSIGN', 'HANDOVER']),
      );
    } finally {
      await prisma.generalVoiceCategory.update({
        where: { key: 'SHOP_WORK_DIFFICULTY' },
        data: { tiered: false },
      });
    }
  });
  it('alerts only the reporter Manager, read-only, for a Critical fixed-route Voice', async () => {
    const id = await draft(
      officeReporter,
      'KARAWANG_1',
      'asy line 2 dekat pos 5',
      'SHOP_WORK_DIFFICULTY',
      Severity.CRITICAL,
    );
    const voice = await submit(officeReporter, id);
    expect(voice.tierLevel).toBeNull();
    const alerts = await prisma.notification.findMany({
      where: { voiceId: voice.id, type: 'CRITICAL_VOICE' },
      select: { recipientId: true },
    });
    expect(alerts).toEqual([{ recipientId: heads['Office Dept X']!.accountId }]);
    const view = await voices.detail(heads['Office Dept X']!, voice.id);
    expect(view.availableActions).toEqual([]);
  });
});
