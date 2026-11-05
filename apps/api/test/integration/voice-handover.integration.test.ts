import {
  AccountKind,
  GeneralVoiceCategoryRouteMode,
  HandlerType,
  PrismaClient,
  RouteKind,
  Severity,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { CategoriesService } from '../../src/categories/categories.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);

let reporter: Principal;
let managerA: Principal;
let managerB: Principal;
let managerC: Principal;
let admin: Principal;
let voiceId: string;
let categoryAId: string;
let categoryBId: string;
let categoryCId: string;
let routeAId: string;
let reporterUnitId: string;
const noteAB = 'Pemeriksaan awal selesai; koordinasikan pengecekan guarding pada shift pagi.';
const noteBC = 'Rute sebelumnya kurang tepat; tindak lanjut berada di department reporter.';

describe('Manager Voice handover', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'h'.repeat(64), rowCount: 4, effectiveAt: new Date() },
    });
    const units = await Promise.all(
      ['Assembly', 'Safety', 'Production Control'].map((department) =>
        prisma.organizationUnit.create({
          data: { directorate: 'Manufacturing', division: 'Production', department },
        }),
      ),
    );
    const makeWorkforce = async (
      noReg: string,
      name: string,
      structuralPosition: string,
      organizationUnitId: string,
    ) => {
      const employee = await prisma.employee.create({ data: { noReg, name } });
      const account = await prisma.userAccount.create({
        data: {
          username: `handover-${noReg}`,
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
          organizationUnitId,
          employeeName: name,
          structuralPosition,
          section: 'Management',
          sourceRow: Number(noReg),
        },
      });
      return policy.resolvePrincipal(account, {
        id: crypto.randomUUID(),
        passwordRestricted: false,
      });
    };
    managerA = await makeWorkforce('101', 'Manager Assembly', 'Department Head', units[0]!.id);
    managerB = await makeWorkforce('102', 'Manager Safety', 'Department Head', units[1]!.id);
    managerC = await makeWorkforce(
      '103',
      'Manager Production Control',
      'Department Head',
      units[2]!.id,
    );
    reporter = await makeWorkforce('104', 'Reporter Handover', 'Member', units[2]!.id);
    const adminAccount = await prisma.userAccount.create({
      data: {
        username: 'handover-admin',
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

    const routes = await Promise.all(
      [managerA, managerB, managerC].map((manager, index) =>
        prisma.routeMapping.create({
          data: {
            kind: RouteKind.DEPARTMENT_HEAD,
            organizationUnitId: units[index]!.id,
            ownerAccountId: manager.accountId,
          },
        }),
      ),
    );
    const category = async (
      key: string,
      name: string,
      mode: GeneralVoiceCategoryRouteMode,
      organizationUnitId?: string,
    ) =>
      prisma.generalVoiceCategory.create({
        data: {
          key,
          revisions: {
            create: { revision: 1, name, definition: `${name} definition`, examples: [] },
          },
          routes: { create: { mode, ...(organizationUnitId ? { organizationUnitId } : {}) } },
        },
      });
    const categoryA = await category(
      'ASSEMBLY_HANDOVER',
      'Assembly',
      GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT,
      units[0]!.id,
    );
    const categoryB = await category(
      'SAFETY_HANDOVER',
      'Safety',
      GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT,
      units[1]!.id,
    );
    const categoryC = await category(
      'REPORTER_HANDOVER',
      'Kondisi Area Reporter',
      GeneralVoiceCategoryRouteMode.RELATED_REPORTER_DEPARTMENT,
    );
    await category(
      'ROUTE_GAP_HANDOVER',
      'Kategori Tanpa Department',
      GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT,
    );
    const archived = await category(
      'ARCHIVED_HANDOVER',
      'Kategori Archived',
      GeneralVoiceCategoryRouteMode.FIXED_DEPARTMENT,
      units[1]!.id,
    );
    await prisma.generalVoiceCategory.update({
      where: { id: archived.id },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
    categoryBId = categoryB.id;
    categoryCId = categoryC.id;
    categoryAId = categoryA.id;
    routeAId = routes[0]!.id;
    reporterUnitId = units[2]!.id;
    const voice = await prisma.voice.create({
      data: {
        displayId: 'CARE-202609-990001',
        reporterId: reporter.accountId,
        visibility: VoiceVisibility.GENERAL,
        area: 'KARAWANG_1',
        reporterOrganizationSnapshotId: snapshot.id,
        reporterOrganizationUnitId: units[2]!.id,
        reporterNoRegSnapshot: '104',
        reporterNameSnapshot: 'Reporter Handover',
        reporterDirectorateSnapshot: 'Manufacturing',
        reporterDivisionSnapshot: 'Production',
        reporterDepartmentSnapshot: 'Production Control',
        reporterSectionSnapshot: 'Management',
        reporterPositionSnapshot: 'Member',
        locationDetail: 'Line 1',
        title: 'Voice untuk pengujian handover',
        detail: 'Konten Voice rahasia dari surface riwayat terbatas.',
        categoryKey: categoryA.key,
        categoryId: categoryA.id,
        categoryNameSnapshot: 'Assembly',
        currentCategoryKey: categoryA.key,
        currentCategoryId: categoryA.id,
        currentCategoryNameSnapshot: 'Assembly',
        severity: Severity.MEDIUM,
        routeOwnerId: managerA.accountId,
        routeMappingId: routes[0]!.id,
        handlerType: HandlerType.MANAGER,
        status: VoiceStatus.OPEN,
        anonymousAlias: 'R-HANDOVER',
      },
    });
    voiceId = voice.id;
  });

  afterAll(async () => prisma.$disconnect());

  it('projects category options, excludes the current PIC, and labels reporter routing', async () => {
    const result = await voices.handoverOptions(managerA, voiceId);
    expect(result.options.some((option) => option.category.key === 'ASSEMBLY_HANDOVER')).toBe(
      false,
    );
    expect(result.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: expect.objectContaining({ key: 'REPORTER_HANDOVER' }),
          isReporterDepartment: true,
          department: expect.objectContaining({ department: 'Production Control' }),
          pic: expect.objectContaining({ id: managerC.accountId }),
          available: true,
        }),
      ]),
    );
    expect(result.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: expect.objectContaining({ key: 'ROUTE_GAP_HANDOVER' }),
          available: false,
          disabledReason: expect.stringContaining('Department'),
        }),
      ]),
    );
    expect(result.options.some((option) => option.category.key === 'ARCHIVED_HANDOVER')).toBe(
      false,
    );
  });

  it('supports A → B → C as a response, keeps the original classification, and redacts notes pairwise', async () => {
    const first = await voices.handover(
      managerA,
      voiceId,
      { targetCategoryId: categoryBId, detail: noteAB, expectedVersion: 1 },
      'handover-a-b',
    );
    expect(first).toMatchObject({ status: VoiceStatus.RESPONDED, version: 2 });
    const replay = await voices.handover(
      managerA,
      voiceId,
      { targetCategoryId: categoryBId, detail: noteAB, expectedVersion: 1 },
      'handover-a-b',
    );
    expect(replay).toEqual(first);
    expect(await prisma.voiceHandover.count({ where: { voiceId } })).toBe(1);

    const second = await voices.handover(
      managerB,
      voiceId,
      { targetCategoryId: categoryCId, detail: noteBC, expectedVersion: 2 },
      'handover-b-c',
    );
    expect(second).toMatchObject({ status: VoiceStatus.RESPONDED, version: 3 });
    const stored = await prisma.voice.findUniqueOrThrow({ where: { id: voiceId } });
    expect(stored).toMatchObject({
      status: VoiceStatus.RESPONDED,
      categoryKey: 'ASSEMBLY_HANDOVER',
      categoryNameSnapshot: 'Assembly',
      currentCategoryKey: 'REPORTER_HANDOVER',
      currentCategoryNameSnapshot: 'Kondisi Area Reporter',
      routeOwnerId: managerC.accountId,
      handlingOrganizationUnitId: managerC.organizationUnitId,
      handlingDepartmentSnapshot: managerC.department,
      handlingOrganizationSource: 'HANDOVER',
      handlingSectionSnapshot: null,
      currentHandlerId: null,
    });

    const historyA = await voices.handovers(managerA, voiceId);
    const historyB = await voices.handovers(managerB, voiceId);
    const historyC = await voices.handovers(managerC, voiceId);
    const historyReporter = await voices.handovers(reporter, voiceId);
    const historyAdmin = await voices.handovers(admin, voiceId);
    // The former PIC now reads the Voice, but notes stay redacted pairwise.
    expect(historyA.accessMode).toBe('VOICE_READER');
    expect(historyA.items.map((item) => item.detail)).toEqual([noteAB, undefined]);
    expect(historyB.items.map((item) => item.detail)).toEqual([noteAB, noteBC]);
    expect(historyC.items.map((item) => item.detail)).toEqual([undefined, noteBC]);
    expect(historyReporter.items.every((item) => item.detail === undefined)).toBe(true);
    expect(historyAdmin.items.map((item) => item.detail)).toEqual([noteAB, noteBC]);
    // The source Manager keeps a read-only view of what they handed over.
    const formerView = await voices.detail(managerA, voiceId);
    expect(formerView.availableActions).toEqual([]);
    expect(formerView.conversationState).toBe('READ_ONLY');
    const currentView = await voices.detail(managerC, voiceId);
    expect(currentView.availableActions).toEqual(
      expect.arrayContaining(['PROCEED', 'HANDOVER', 'MESSAGE']),
    );
    const thread = await voices.messages(reporter, voiceId, {});
    expect(thread.items.map((item) => [item.kind, item.text])).toEqual([
      ['SYSTEM', `Diteruskan ke ${managerB.department}`],
      ['SYSTEM', `Diteruskan ke ${managerC.department}`],
    ]);

    const mine = await voices.myHandovers(managerA, {});
    expect(mine.items).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toContain('Voice untuk pengujian handover');
    expect(JSON.stringify(mine)).not.toContain('Konten Voice rahasia');

    const events = await prisma.voiceEvent.findMany({ where: { voiceId } });
    const notifications = await prisma.notification.findMany({ where: { voiceId } });
    expect(events.map((event) => event.type).sort()).toEqual(
      [
        'HANDOVER_COMPLETED',
        'HANDOVER_COMPLETED',
        'MESSAGE_SENT',
        'MESSAGE_SENT',
        'RESPONDED',
      ].sort(),
    );
    expect(JSON.stringify(events)).not.toContain(noteAB);
    expect(JSON.stringify(events)).not.toContain(noteBC);
    expect(notifications.map((item) => item.recipientId).sort()).toEqual(
      [managerB.accountId, managerC.accountId, reporter.accountId, reporter.accountId].sort(),
    );
    expect(JSON.stringify(notifications)).not.toContain(noteAB);
    expect(JSON.stringify(notifications)).not.toContain(noteBC);
  });

  it('rejects non-current actors, non-OPEN state, self destinations, and stale versions', async () => {
    await expect(
      voices.handover(
        managerA,
        voiceId,
        { targetCategoryId: categoryBId, detail: 'Tidak boleh', expectedVersion: 3 },
        'handover-former-pic',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      voices.handover(
        managerC,
        voiceId,
        { targetCategoryId: categoryCId, detail: 'Tujuan sendiri', expectedVersion: 3 },
        'handover-self',
      ),
    ).rejects.toMatchObject({ code: 'HANDOVER_DESTINATION_SELF' });
    await expect(
      voices.handover(
        managerC,
        voiceId,
        { targetCategoryId: categoryBId, detail: 'Versi lama', expectedVersion: 2 },
        'handover-stale',
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await prisma.voice.update({
      where: { id: voiceId },
      data: { status: VoiceStatus.IN_PROGRESS },
    });
    await expect(voices.handoverOptions(managerC, voiceId)).rejects.toMatchObject({
      code: 'HANDOVER_INVALID_STATE',
    });
  });

  it('allows only one winner when handover races Proceed', async () => {
    const competing = await prisma.voice.create({
      data: {
        displayId: 'CARE-202609-990002',
        reporterId: reporter.accountId,
        visibility: VoiceVisibility.GENERAL,
        area: 'KARAWANG_1',
        reporterOrganizationUnitId: reporterUnitId,
        reporterNoRegSnapshot: '104',
        reporterNameSnapshot: 'Reporter Handover',
        reporterDirectorateSnapshot: 'Manufacturing',
        reporterDivisionSnapshot: 'Production',
        reporterDepartmentSnapshot: 'Production Control',
        locationDetail: 'Line 2',
        title: 'Concurrent Voice',
        detail: 'Concurrent mutation fixture.',
        categoryKey: 'ASSEMBLY_HANDOVER',
        categoryId: categoryAId,
        categoryNameSnapshot: 'Assembly',
        currentCategoryKey: 'ASSEMBLY_HANDOVER',
        currentCategoryId: categoryAId,
        currentCategoryNameSnapshot: 'Assembly',
        severity: Severity.MEDIUM,
        routeOwnerId: managerA.accountId,
        routeMappingId: routeAId,
        handlerType: HandlerType.MANAGER,
        status: VoiceStatus.OPEN,
        anonymousAlias: 'R-RACE',
      },
    });
    const results = await Promise.allSettled([
      voices.handover(
        managerA,
        competing.id,
        { targetCategoryId: categoryBId, detail: 'Concurrent handover', expectedVersion: 1 },
        'handover-race',
      ),
      voices.respond(managerA, competing.id, { version: 1, text: 'Respons' }, 'monitor-race'),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const stored = await prisma.voice.findUniqueOrThrow({ where: { id: competing.id } });
    expect(stored).toMatchObject({ version: 2, status: VoiceStatus.RESPONDED });
    expect(
      await prisma.voiceHandover.count({ where: { voiceId: competing.id } }),
    ).toBeLessThanOrEqual(1);
  });

  it('routes an OPEN Voice through Admin, supports return, and keeps reasons private', async () => {
    const queued = await prisma.voice.create({
      data: {
        displayId: 'CARE-202609-990003',
        reporterId: reporter.accountId,
        visibility: VoiceVisibility.GENERAL,
        area: 'KARAWANG_1',
        reporterOrganizationUnitId: reporterUnitId,
        reporterNoRegSnapshot: '104',
        reporterNameSnapshot: 'Reporter Handover',
        reporterDivisionSnapshot: 'Production',
        reporterDepartmentSnapshot: 'Production Control',
        locationDetail: 'Line 3',
        title: 'Admin route fixture',
        detail: 'Perlu rute Admin',
        categoryKey: 'ASSEMBLY_HANDOVER',
        categoryId: categoryAId,
        categoryNameSnapshot: 'Assembly',
        currentCategoryKey: 'ASSEMBLY_HANDOVER',
        currentCategoryId: categoryAId,
        currentCategoryNameSnapshot: 'Assembly',
        severity: Severity.MEDIUM,
        routeOwnerId: managerA.accountId,
        routeMappingId: routeAId,
        handlerType: HandlerType.MANAGER,
        status: VoiceStatus.OPEN,
        anonymousAlias: 'R-ADMIN',
      },
    });
    const request = await voices.requestAdminHandover(
      managerA,
      queued.id,
      { detail: 'Perlu keputusan Admin', expectedVersion: 1 },
      'admin-request-1',
    );
    expect(request).toMatchObject({ status: VoiceStatus.OPEN, version: 2 });
    expect(
      await voices.requestAdminHandover(
        managerA,
        queued.id,
        { detail: 'Perlu keputusan Admin', expectedVersion: 1 },
        'admin-request-1',
      ),
    ).toEqual(request);
    const pending = await prisma.voice.findUniqueOrThrow({ where: { id: queued.id } });
    expect(pending).toMatchObject({
      routeOwnerId: admin.accountId,
      handlerType: HandlerType.ADMIN_TRIAGE,
      currentHandlerId: null,
    });
    const queue = await voices.adminHandoverQueue(admin);
    expect(queue.items.some((item) => item.id === request.handoverId)).toBe(true);
    await expect(
      voices.requestAdminHandover(
        reporter,
        queued.id,
        { detail: 'Tidak sah', expectedVersion: 2 },
        'admin-request-reporter',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const returned = await voices.returnAdminHandover(
      admin,
      request.handoverId,
      { detail: 'Mohon lengkapi konteks', expectedVersion: 2 },
      'admin-return-1',
    );
    expect(returned).toMatchObject({ status: VoiceStatus.OPEN, version: 3 });
    expect((await prisma.voice.findUniqueOrThrow({ where: { id: queued.id } })).routeOwnerId).toBe(
      managerA.accountId,
    );
    const second = await voices.requestAdminHandover(
      managerA,
      queued.id,
      { detail: 'Konteks dilengkapi', expectedVersion: 3 },
      'admin-request-2',
    );
    const options = await voices.adminHandoverOptions(admin, second.handoverId);
    expect(options.currentCategoryId).toBe(categoryAId);
    const assembly = options.items.find((item) => item.id === managerA.organizationUnitId);
    expect(assembly?.available).toBe(true);
    const routed = await voices.resolveAdminHandover(
      admin,
      second.handoverId,
      {
        organizationUnitId: managerA.organizationUnitId,
        detail: 'Diteruskan ke Assembly',
        expectedVersion: 4,
      },
      'admin-route-1',
    );
    expect(routed).toMatchObject({ status: VoiceStatus.OPEN, version: 5 });
    const finalVoice = await prisma.voice.findUniqueOrThrow({ where: { id: queued.id } });
    expect(finalVoice).toMatchObject({
      categoryId: categoryAId,
      currentCategoryId: categoryAId,
      routeOwnerId: managerA.accountId,
    });
    const history = await voices.adminHandoversForVoice(admin, queued.id);
    expect(history.items).toHaveLength(2);
    expect(history.items[0]).toMatchObject({
      managerDetail: 'Konteks dilengkapi',
      adminDetail: 'Diteruskan ke Assembly',
    });
    expect(JSON.stringify(await voices.timeline(reporter, queued.id, {}))).not.toContain(
      'Konteks dilengkapi',
    );

    const noCategoryUnit = await prisma.organizationUnit.create({
      data: {
        directorate: 'Manufacturing',
        division: 'Production',
        department: 'Quality Routing',
      },
    });
    const employee = await prisma.employee.create({
      data: { noReg: '105', name: 'Manager Quality' },
    });
    const pic = await prisma.userAccount.create({
      data: {
        username: 'handover-105',
        displayName: 'Manager Quality',
        passwordHash: 'test',
        accountKind: AccountKind.WORKFORCE,
        passwordChangeRequired: false,
        employeeId: employee.id,
      },
    });
    const snapshot = await prisma.organizationSnapshot.findFirstOrThrow({
      where: { status: 'ACTIVE' },
    });
    await prisma.organizationMembership.create({
      data: {
        snapshotId: snapshot.id,
        employeeId: employee.id,
        organizationUnitId: noCategoryUnit.id,
        employeeName: 'Manager Quality',
        structuralPosition: 'Department Head',
        section: 'Management',
        sourceRow: 105,
      },
    });
    await prisma.routeMapping.create({
      data: {
        kind: RouteKind.DEPARTMENT_HEAD,
        organizationUnitId: noCategoryUnit.id,
        ownerAccountId: pic.id,
      },
    });
    const customRequest = await voices.requestAdminHandover(
      managerA,
      queued.id,
      { detail: 'Rute lintas kategori', expectedVersion: 5 },
      'admin-request-custom',
    );
    await expect(
      voices.resolveAdminHandover(
        admin,
        customRequest.handoverId,
        { organizationUnitId: noCategoryUnit.id, detail: 'Belum ada kategori', expectedVersion: 6 },
        'admin-route-invalid',
      ),
    ).rejects.toMatchObject({
      code: 'ADMIN_HANDOVER_CATEGORY_REQUIRED',
    });
    const catalogCount = await prisma.generalVoiceCategory.count();
    await voices.resolveAdminHandover(
      admin,
      customRequest.handoverId,
      {
        organizationUnitId: noCategoryUnit.id,
        customCategory: 'Kualitas proses',
        detail: 'PIC Quality akan menindaklanjuti',
        expectedVersion: 6,
      },
      'admin-route-custom',
    );
    expect(await prisma.generalVoiceCategory.count()).toBe(catalogCount);
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: queued.id } })).toMatchObject({
      routeOwnerId: pic.id,
      currentCategoryId: null,
      currentCategoryNameSnapshot: 'Kualitas proses',
      categoryId: categoryAId,
    });
  });

  it('lists handed-over Voices for CARE Admin and turns one into a category Example', async () => {
    const categories = new CategoriesService(prisma as never);
    const stored = await prisma.voice.findUniqueOrThrow({ where: { id: voiceId } });
    const targetKey = stored.currentCategoryKey!;
    expect(targetKey).not.toBe(stored.categoryKey);

    const before = await categories.corrections();
    const item = before.items.find((entry) => entry.voiceId === voiceId);
    expect(item).toMatchObject({
      from: { key: 'ASSEMBLY_HANDOVER' },
      to: { key: targetKey },
      canAccept: true,
    });
    expect(item?.handoverNote).toBeTruthy();
    // Reporter identity never reaches the review list.
    expect(JSON.stringify(before)).not.toContain('Reporter Handover');
    const custom = before.items.find((entry) => entry.to.name === 'Kualitas proses');
    expect(custom?.canAccept).toBe(false);
    expect(before.total).toBe(before.items.length);

    await expect(
      categories.acceptCorrection(
        admin,
        voiceId,
        { example: 'Contoh basi', expectedCategoryKey: 'SAFETY_HANDOVER' },
        'correction-stale',
      ),
    ).rejects.toMatchObject({ code: 'CATEGORY_CORRECTION_CHANGED' });
    await expect(
      categories.acceptCorrection(
        admin,
        custom!.voiceId,
        { example: 'Kategori custom', expectedCategoryKey: custom!.to.key },
        'correction-custom',
      ),
    ).rejects.toMatchObject({ code: 'CATEGORY_CORRECTION_TARGET_UNAVAILABLE' });

    const target = await prisma.generalVoiceCategory.findUniqueOrThrow({
      where: { key: targetKey },
      include: { revisions: { where: { effectiveTo: null } } },
    });
    const body = {
      example: '  Guarding mesin perlu dicek ulang  ',
      expectedCategoryKey: targetKey,
    };
    const accepted = await categories.acceptCorrection(admin, voiceId, body, 'correction-accept');
    expect(accepted).toMatchObject({
      decision: 'ACCEPTED',
      categoryKey: targetKey,
      revision: target.revisions[0]!.revision + 1,
    });
    expect(await categories.acceptCorrection(admin, voiceId, body, 'correction-accept')).toEqual(
      accepted,
    );
    await expect(
      categories.acceptCorrection(admin, voiceId, body, 'correction-accept-again'),
    ).rejects.toMatchObject({ code: 'CATEGORY_CORRECTION_REVIEWED' });

    const catalog = await categories.activeCatalog();
    expect(catalog.find((entry) => entry.key === targetKey)?.examples).toContain(
      'Guarding mesin perlu dicek ulang',
    );
    expect(
      await prisma.auditEvent.count({
        where: {
          action: 'GENERAL_VOICE_CATEGORY_UPDATED',
          resourceId: target.id,
          summary: { path: ['source'], equals: 'CATEGORY_CORRECTION' },
        },
      }),
    ).toBe(1);

    const dismissed = await categories.dismissCorrection(
      admin,
      custom!.voiceId,
      { expectedCategoryKey: custom!.to.key },
      'correction-dismiss',
    );
    expect(dismissed).toMatchObject({ decision: 'DISMISSED', revision: null });
    const after = await categories.corrections();
    expect(after.items.map((entry) => entry.voiceId)).not.toContain(voiceId);
    expect(after.items.map((entry) => entry.voiceId)).not.toContain(custom!.voiceId);
    expect(after.total).toBe(before.total - 2);
  });

  it('lets CARE Admin hand an active Voice to any responder by name', async () => {
    const snapshot = await prisma.organizationSnapshot.findFirstOrThrow({
      where: { status: 'ACTIVE' },
    });
    const person = async (noReg: string, name: string, structuralPosition: string) => {
      const employee = await prisma.employee.create({ data: { noReg, name } });
      const account = await prisma.userAccount.create({
        data: {
          username: `handover-${noReg}`,
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
          organizationUnitId: managerB.organizationUnitId!,
          employeeName: name,
          structuralPosition,
          section: 'Press',
          sourceRow: Number(noReg),
        },
      });
      return policy.resolvePrincipal(account, {
        id: crypto.randomUUID(),
        passwordRestricted: false,
      });
    };
    const oldHandler = await person('201', 'Pic Lama Section', 'Section Head');
    const sectionHead = await person('202', 'Pic Baru Section', 'Section Head');
    await person('203', 'Pic Baru Member', 'Member');
    const voice = await prisma.voice.create({
      data: {
        displayId: 'CARE-202611-990010',
        reporterId: reporter.accountId,
        visibility: VoiceVisibility.GENERAL,
        area: 'KARAWANG_1',
        reporterOrganizationUnitId: reporterUnitId,
        reporterNoRegSnapshot: '104',
        reporterNameSnapshot: 'Reporter Handover',
        reporterDivisionSnapshot: 'Production',
        reporterDepartmentSnapshot: 'Production Control',
        locationDetail: 'Line 4',
        title: 'Admin PIC fixture',
        detail: 'Perlu PIC lain',
        categoryKey: 'ASSEMBLY_HANDOVER',
        categoryId: categoryAId,
        categoryNameSnapshot: 'Assembly',
        currentCategoryKey: 'ASSEMBLY_HANDOVER',
        currentCategoryId: categoryAId,
        currentCategoryNameSnapshot: 'Assembly',
        severity: Severity.MEDIUM,
        routeOwnerId: managerA.accountId,
        routeMappingId: routeAId,
        currentHandlerId: oldHandler.accountId,
        handlerType: HandlerType.SECTION_HEAD,
        status: VoiceStatus.IN_PROGRESS,
        anonymousAlias: 'R-ADMIN-PIC',
      },
    });

    // Only responders match the typed name; the Member does not.
    const found = await voices.adminPicCandidates(admin, voice.id, { search: 'pic baru' });
    expect(found.items.map((item) => item.displayName)).toEqual(['Pic Baru Section']);
    const managers = await voices.adminPicCandidates(admin, voice.id, { search: 'manager' });
    expect(managers.items.map((item) => item.id)).toContain(managerB.accountId);
    expect((await voices.adminPicCandidates(admin, voice.id, { search: 'p' })).items).toEqual([]);

    await expect(
      voices.adminPicHandover(
        managerA,
        voice.id,
        { toAccountId: managerB.accountId, expectedVersion: 1 },
        'admin-pic-forbidden',
      ),
    ).rejects.toBeTruthy();
    const member = await prisma.userAccount.findFirstOrThrow({
      where: { displayName: 'Pic Baru Member' },
    });
    await expect(
      voices.adminPicHandover(
        admin,
        voice.id,
        { toAccountId: member.id, expectedVersion: 1 },
        'admin-pic-member',
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_PIC_UNAVAILABLE' });
    await expect(
      voices.adminPicHandover(
        admin,
        voice.id,
        { toAccountId: managerB.accountId, expectedVersion: 9 },
        'admin-pic-stale',
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    // A Manager takes the route; processing starts over and the old PIC lets go.
    const toManager = await voices.adminPicHandover(
      admin,
      voice.id,
      {
        toAccountId: managerB.accountId,
        detail: 'Alasan internal Admin',
        expectedVersion: 1,
      },
      'admin-pic-1',
    );
    expect(toManager).toMatchObject({ status: VoiceStatus.RESPONDED, version: 2 });
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
      routeOwnerId: managerB.accountId,
      currentHandlerId: null,
      handlerType: HandlerType.MANAGER,
      handlingDepartmentSnapshot: 'Safety',
      tierLevel: null,
    });
    const inbox = async (actor: Principal) =>
      prisma.voice.count({ where: { id: voice.id, AND: [policy.workItemScope(actor)] } });
    expect(await inbox(managerB)).toBe(1);
    expect(await inbox(oldHandler)).toBe(0);
    expect(
      await prisma.notification.count({
        where: { voiceId: voice.id, recipientId: managerB.accountId, type: 'HANDOVER_RECEIVED' },
      }),
    ).toBe(1);

    // A Section Head also becomes the handler, so the Voice reaches them.
    await voices.adminPicHandover(
      admin,
      voice.id,
      { toAccountId: sectionHead.accountId, expectedVersion: 2 },
      'admin-pic-2',
    );
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
      routeOwnerId: sectionHead.accountId,
      currentHandlerId: sectionHead.accountId,
      handlerType: HandlerType.SECTION_HEAD,
      handlingSectionSnapshot: 'Press',
    });
    expect(await inbox(sectionHead)).toBe(1);
    expect(await inbox(managerB)).toBe(0);
    await expect(
      voices.adminPicHandover(
        admin,
        voice.id,
        { toAccountId: sectionHead.accountId, expectedVersion: 3 },
        'admin-pic-self',
      ),
    ).rejects.toMatchObject({ code: 'HANDOVER_DESTINATION_SELF' });

    const history = await voices.adminHandoversForVoice(admin, voice.id);
    expect(history.picItems).toEqual([
      expect.objectContaining({ fromName: 'Manager Safety', toName: 'Pic Baru Section' }),
      expect.objectContaining({
        fromName: 'Manager Assembly',
        toName: 'Manager Safety',
        detail: 'Alasan internal Admin',
      }),
    ]);
    expect(JSON.stringify(await voices.timeline(reporter, voice.id, {}))).not.toContain(
      'Alasan internal Admin',
    );

    await prisma.voice.update({ where: { id: voice.id }, data: { status: VoiceStatus.CLOSED } });
    await expect(
      voices.adminPicHandover(
        admin,
        voice.id,
        { toAccountId: managerB.accountId, expectedVersion: 3 },
        'admin-pic-closed',
      ),
    ).rejects.toMatchObject({ code: 'ADMIN_PIC_HANDOVER_INVALID_STATE' });
  });
});
