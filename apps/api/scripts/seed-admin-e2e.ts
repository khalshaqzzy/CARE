import {
  AccountKind,
  Area,
  HandlerType,
  ImportStatus,
  PrismaClient,
  RouteKind,
  Severity,
  UnionSlot,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { hash } from 'argon2';
import { createHash } from 'node:crypto';

// Deterministic UUIDs so repeated runs (after a reset) are reproducible.
function stableUuid(namespace: string, value: string) {
  const hex = createHash('sha256').update(`${namespace}:${value}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

async function main() {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('Admin e2e fixture seeding is test-only (set NODE_ENV=test)');
  const adminUsername = process.env.E2E_ADMIN_USERNAME ?? 'e2e-admin';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-1';
  if (adminPassword.length < 12 || adminPassword === adminUsername)
    throw new Error('E2E_ADMIN_PASSWORD must be 12+ chars and differ from the username');

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await reset(prisma);

    const passwordHash = await hash(adminPassword);
    const admin = await prisma.userAccount.create({
      data: {
        id: stableUuid('account', 'admin'),
        username: adminUsername,
        displayName: 'CARE Admin',
        accountKind: AccountKind.CARE_ADMIN,
        passwordHash,
        passwordChangeRequired: true, // exercises the forced-password path
      },
    });

    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'a'.repeat(64), rowCount: 5, effectiveAt: new Date() },
    });

    const unitA = await prisma.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Division A', department: 'Department A' },
    });
    const unitB = await prisma.organizationUnit.create({
      data: { directorate: 'Manufacturing', division: 'Division A', department: 'Department B' },
    });

    // Workforce slice: reporter, a Department Head (Manager of Division A),
    // a Section Head, and a Director in the same organization unit.
    const work = {
      reporter: await workforce(
        prisma,
        snapshot.id,
        unitA.id,
        '000128',
        'Budi Santoso',
        'Member',
        1,
      ),
      manager: await workforce(
        prisma,
        snapshot.id,
        unitA.id,
        '000003',
        'Manager PIC',
        'Department Head',
        2,
      ),
      sectionHead: await workforce(
        prisma,
        snapshot.id,
        unitA.id,
        '000004',
        'Section Head',
        'Section Head',
        3,
      ),
      director: await workforce(prisma, snapshot.id, unitA.id, '000005', 'Director', 'Director', 4),
    };

    // Union: exactly one Head and two Officers.
    const unionHead = await union(prisma, UnionSlot.HEAD, 'union-head', 'Union Head');
    await union(prisma, UnionSlot.OFFICER_1, 'union-1', 'Union 1');
    await union(prisma, UnionSlot.OFFICER_2, 'union-2', 'Union 2');

    // Routes: a Department Head for Division A and the single global special PIC.
    await prisma.routeMapping.create({
      data: {
        kind: RouteKind.DEPARTMENT_HEAD,
        organizationUnitId: unitA.id,
        ownerAccountId: work.manager.id,
        effectiveFrom: new Date(),
      },
    });
    await prisma.routeMapping.create({
      data: {
        kind: RouteKind.GLOBAL_SPECIAL,
        ownerAccountId: work.manager.id,
        effectiveFrom: new Date(),
      },
    });

    // Voices: one General (Division A/route to Manager), one Private (to Union Head).
    const generalVoice = await prisma.voice.create({
      data: {
        id: stableUuid('voice', 'general'),
        displayId: 'CARE-202608-900001',
        reporterId: work.reporter.id,
        visibility: VoiceVisibility.GENERAL,
        area: Area.KARAWANG_1,
        reporterOrganizationSnapshotId: snapshot.id,
        reporterOrganizationUnitId: unitA.id,
        reporterNoRegSnapshot: '000128',
        reporterNameSnapshot: 'Budi Santoso',
        reporterDirectorateSnapshot: 'Manufacturing',
        reporterDivisionSnapshot: 'Division A',
        reporterDepartmentSnapshot: 'Department A',
        reporterSectionSnapshot: 'Section A',
        reporterPositionSnapshot: 'Member',
        locationDetail: 'Lantai 3, dekat mesin produksi',
        title: 'Pencahayaan area produksi kurang',
        detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
        category: 'SAFETY',
        severity: Severity.HIGH,
        status: VoiceStatus.IN_PROGRESS,
        routeOwnerId: work.manager.id,
        handlerType: HandlerType.MANAGER,
        currentHandlerId: work.manager.id,
        anonymousAlias: 'E2E-GEN',
      },
    });
    const privateVoice = await prisma.voice.create({
      data: {
        id: stableUuid('voice', 'private'),
        displayId: 'CARE-202608-900002',
        reporterId: work.reporter.id,
        visibility: VoiceVisibility.PRIVATE,
        area: Area.KARAWANG_1,
        reporterOrganizationSnapshotId: snapshot.id,
        reporterOrganizationUnitId: unitA.id,
        reporterNoRegSnapshot: '000128',
        reporterNameSnapshot: 'Budi Santoso',
        reporterDirectorateSnapshot: 'Manufacturing',
        reporterDivisionSnapshot: 'Division A',
        reporterDepartmentSnapshot: 'Department A',
        reporterSectionSnapshot: 'Section A',
        reporterPositionSnapshot: 'Member',
        showReporterIdentity: true,
        locationDetail: 'Toilet lantai 2, blok B',
        title: 'Keluhan fasilitas toilet',
        detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
        severity: Severity.MEDIUM,
        status: VoiceStatus.IN_PROGRESS,
        routeOwnerId: unionHead.id,
        handlerType: HandlerType.UNION_HEAD,
        currentHandlerId: unionHead.id,
        anonymousAlias: 'E2E-PRV',
      },
    });

    // A minimal append-only timeline so the member smoke can render a timeline
    // for the seeded voices instead of an empty/hidden section.
    await prisma.voiceEvent.createMany({
      data: [
        {
          id: stableUuid('event', 'general-submitted'),
          voiceId: generalVoice.id,
          type: 'SUBMITTED',
          actorId: work.reporter.id,
          actorAccountKind: AccountKind.WORKFORCE,
          actorStructuralPosition: 'Member',
          actorCapabilities: ['MEMBER'],
          payload: {},
        },
        {
          id: stableUuid('event', 'general-proceeded'),
          voiceId: generalVoice.id,
          type: 'PROCEEDED',
          actorId: work.manager.id,
          actorAccountKind: AccountKind.WORKFORCE,
          actorStructuralPosition: 'Department Head',
          actorCapabilities: ['MEMBER', 'MANAGER'],
          payload: {},
        },
        {
          id: stableUuid('event', 'private-submitted'),
          voiceId: privateVoice.id,
          type: 'SUBMITTED',
          actorId: work.reporter.id,
          actorAccountKind: AccountKind.WORKFORCE,
          actorStructuralPosition: 'Member',
          actorCapabilities: ['MEMBER'],
          payload: {},
        },
      ],
    });

    // A confirmed import batch + its changes and an unresolved remediation issue,
    // so the Imports and Remediation pages render real data.
    const batch = await prisma.importBatch.create({
      data: {
        id: stableUuid('import', 'batch'),
        actorId: admin.id,
        status: ImportStatus.CONFIRMED,
        checksum: 'b'.repeat(64),
        storageKey: 'imports/e2e.csv',
        summary: { rowCount: 4, create: 3, update: 1, deactivate: 0 },
        errors: [],
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        confirmedAt: new Date(),
      },
    });
    await prisma.importChange.create({
      data: {
        batchId: batch.id,
        sequence: 1,
        type: 'CREATE',
        noReg: '000128',
        payload: { type: 'CREATE', noReg: '000128' },
      },
    });

    await prisma.importIssue.create({
      data: {
        batchId: batch.id,
        type: 'MISSING_DEPARTMENT_HEAD',
        status: 'OPEN',
        organizationUnitId: unitB.id,
        details: { organizationUnit: 'Division A / Department B', missing: 'Department Head' },
        createdAt: new Date(),
      },
    });

    // Seed a couple of audit events so the Audit page renders; reading the
    // Private voice below will append a PRIVATE_*_READ event to assert.
    const baseAudit = {
      actorId: admin.id,
      actorAccountKind: AccountKind.CARE_ADMIN,
      actorStructuralPosition: null,
      correlationId: 'e2e-fullstack',
      releaseSha: 'ci',
    };
    await prisma.auditEvent.createMany({
      data: [
        {
          ...baseAudit,
          action: 'ADMIN_LOGIN',
          result: 'SUCCESS',
          resourceType: 'Session',
          resourceId: null,
          summary: {},
          reason: null,
        },
        {
          ...baseAudit,
          action: 'ACCOUNT_PASSWORD_RESET',
          result: 'SUCCESS',
          resourceType: 'UserAccount',
          resourceId: work.reporter.id,
          summary: {},
          reason: 'e2e',
        },
        {
          ...baseAudit,
          action: 'VOICE_PRIVATE_DETAIL_READ',
          result: 'SUCCESS',
          resourceType: 'Voice',
          resourceId: privateVoice.id,
          summary: {},
          reason: null,
        },
      ],
    });

    process.stdout.write(
      `Admin e2e fixture seeded (${adminUsername}; voices=${generalVoice.displayId},${privateVoice.displayId})\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function reset(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "LegacyVoiceAccess","OutboxEvent","PushSubscription","Session","IdempotencyRecord","AuditEvent","Rating","ClosureCycle","Message","Conversation","VoiceEvent","VoiceAssignment","Attachment","LocationReviewSnapshot","AIClassification","Voice","VoiceDraft","ImportIssueResolution","ImportIssue","ImportChange","ImportBatch","RouteMapping","UnionAccountTerm","OrganizationMembership","OrganizationUnit","OrganizationSnapshot","UserAccount","Employee" CASCADE',
  );
}

async function workforce(
  prisma: PrismaClient,
  snapshotId: string,
  unitId: string,
  noReg: string,
  name: string,
  position: string,
  sourceRow: number,
) {
  const employee = await prisma.employee.create({
    data: { id: stableUuid('employee', noReg), noReg, name },
  });
  const account = await prisma.userAccount.create({
    data: {
      id: stableUuid('account', noReg),
      employeeId: employee.id,
      username: noReg,
      displayName: name,
      passwordHash: await hash(noReg),
      accountKind: AccountKind.WORKFORCE,
      passwordChangeRequired: true,
    },
  });
  await prisma.organizationMembership.create({
    data: {
      snapshotId,
      employeeId: employee.id,
      organizationUnitId: unitId,
      employeeName: name,
      structuralPosition: position,
      section: 'Section A',
      sourceRow,
    },
  });
  return account;
}

async function union(prisma: PrismaClient, slot: UnionSlot, username: string, displayName: string) {
  const account = await prisma.userAccount.create({
    data: {
      id: stableUuid('account', username),
      username,
      displayName,
      passwordHash: await hash(username),
      accountKind: AccountKind.UNION,
      passwordChangeRequired: true,
    },
  });
  await prisma.unionAccountTerm.create({
    data: { accountId: account.id, slot, effectiveFrom: new Date() },
  });
  return account;
}

void main();
