import {
  AccountKind,
  AttachmentPurpose,
  AttachmentState,
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
let otherMember: Principal;
let manager: Principal;
let sectionHead: Principal;
let director: Principal;
let unionHead: Principal;
let officer: Principal;
let careAdmin: Principal;
let unitId: string;
let sourceRow = 0;
let seq = 0;

async function seedVoice(
  overrides: Partial<{
    visibility: VoiceVisibility;
    reporterId: string;
    routeOwnerId: string;
    currentHandlerId: string | null;
    handlerType: HandlerType;
    status: VoiceStatus;
    showReporterIdentity: boolean;
  }> = {},
) {
  seq += 1;
  const visibility = overrides.visibility ?? VoiceVisibility.GENERAL;
  return prisma.voice.create({
    data: {
      displayId: `CARE-202608-${String(seq).padStart(6, '0')}`,
      reporterId: overrides.reporterId ?? reporter.accountId,
      visibility,
      area: 'KARAWANG_1',
      reporterNoRegSnapshot: '000001',
      reporterNameSnapshot: 'Reporter',
      reporterDirectorateSnapshot: 'Manufacturing',
      reporterDivisionSnapshot: 'Division A',
      reporterDepartmentSnapshot: 'Department A',
      reporterOrganizationUnitId: unitId,
      routeOwnerId: overrides.routeOwnerId ?? manager.accountId,
      status: overrides.status ?? VoiceStatus.OPEN,
      handlerType: overrides.handlerType ?? HandlerType.MANAGER,
      currentHandlerId: overrides.currentHandlerId ?? null,
      showReporterIdentity:
        visibility === VoiceVisibility.PRIVATE ? (overrides.showReporterIdentity ?? false) : null,
      locationDetail: 'line',
      title: 'matrix voice',
      detail: 'detail',
      severity: Severity.MEDIUM,
      category: null,
      anonymousAlias: `R-${seq}`,
      version: 1,
    },
  });
}

async function evidence(voiceId: string, uploaderId: string, key: string) {
  await prisma.attachment.create({
    data: {
      voiceId,
      uploaderId,
      purpose: AttachmentPurpose.CLOSURE_EVIDENCE,
      state: AttachmentState.READY,
      storageKey: `matrix/${key}.webp`,
      mimeType: 'image/webp',
      size: 10,
      checksum: 'a'.repeat(64),
      readyAt: new Date(),
    },
  });
}

describe('Responder and leadership permission matrix', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'c'.repeat(64), rowCount: 9, effectiveAt: new Date() },
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
    const careAdminAccount = await prisma.userAccount.create({
      data: {
        username: 'care-admin',
        displayName: 'CARE Admin',
        passwordHash: 'test',
        accountKind: AccountKind.CARE_ADMIN,
        passwordChangeRequired: false,
      },
    });
    const resolve = async (account: Parameters<typeof policy.resolvePrincipal>[0]) =>
      policy.resolvePrincipal(account, { id: crypto.randomUUID(), passwordRestricted: false });

    reporter = await resolve(await workforce('000001', 'Reporter', 'Member'));
    otherMember = await resolve(await workforce('000002', 'Other Member', 'Member'));
    manager = await resolve(await workforce('000003', 'Manager', 'Department Head'));
    sectionHead = await resolve(await workforce('000004', 'Section Head', 'Section Head'));
    director = await resolve(await workforce('000005', 'Director', 'Director'));
    unionHead = await resolve(await union(UnionSlot.HEAD));
    officer = await resolve(await union(UnionSlot.OFFICER_1));
    careAdmin = await resolve(careAdminAccount);
  });
  afterAll(async () => prisma.$disconnect());

  it('keeps a Member list and detail scoped to only their own voices', async () => {
    const mine = await seedVoice();
    const theirs = await seedVoice({ reporterId: otherMember.accountId });
    const memberList = await voices.list(reporter, {});
    expect(memberList.items.map((item) => item.id)).toEqual(expect.arrayContaining([mine.id]));
    expect(memberList.items.map((item) => item.id)).not.toContain(theirs.id);
    // A Member cannot open another Member's voice detail.
    await expect(voices.detail(reporter, theirs.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // A Member cannot operate (ask) on their own voice as a responder action.
    await expect(
      voices.ask(reporter, mine.id, { text: 'hai', version: 1 }, 'ask-mem'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('prevents a Section Head from assigning or reassigning', async () => {
    const assigned = await seedVoice({
      currentHandlerId: sectionHead.accountId,
      handlerType: HandlerType.SECTION_HEAD,
    });
    await expect(
      voices.assign(
        sectionHead,
        assigned.id,
        { handlerAccountId: sectionHead.accountId },
        'assign-sh',
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('gives leadership read-only detail and no lifecycle action', async () => {
    const voice = await seedVoice();
    const detail = await voices.detail(director, voice.id);
    expect(detail.audience).toBe('LEADERSHIP_GENERAL_READ_ONLY');
    expect(detail.availableActions).toEqual([]);
    await expect(
      voices.ask(director, voice.id, { text: 'x', version: detail.version as number }, 'ask-dir'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('isolates Union Officer access to assigned Private voices only', async () => {
    const privateVoice = await seedVoice({
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: unionHead.accountId,
      handlerType: HandlerType.UNION_HEAD,
    });
    // Unassigned Private is not visible to an Officer.
    await expect(voices.detail(officer, privateVoice.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    // Union Head sees it anonymously when consent hides the identity.
    const headDetail = await voices.detail(unionHead, privateVoice.id);
    expect(headDetail.audience).toBe('UNION_ANONYMOUS');
    expect((headDetail as { reporter?: unknown }).reporter).toBeUndefined();
  });

  it('gives CARE Admin full read-only Private identity and rejects mutations', async () => {
    const privateVoice = await seedVoice({
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: unionHead.accountId,
      handlerType: HandlerType.UNION_HEAD,
    });
    const detail = await voices.detail(careAdmin, privateVoice.id);
    expect(detail.audience).toBe('ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY');
    expect((detail as { reporter: { name: string } }).reporter.name).toBe('Reporter');
    expect(detail.availableActions).toEqual([]);
    await expect(
      voices.close(careAdmin, privateVoice.id, { note: 'x', version: 1 }, 'close-admin'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lets a route Manager close a General voice even when a Section Head is the handler', async () => {
    const voice = await seedVoice({
      status: VoiceStatus.IN_PROGRESS,
      currentHandlerId: sectionHead.accountId,
      handlerType: HandlerType.SECTION_HEAD,
    });
    await evidence(voice.id, manager.accountId, 'close-mgr');
    const closure = await voices.close(
      manager,
      voice.id,
      { note: 'resolved by manager', version: 1 },
      'close-mgr-k',
    );
    expect(closure.cycleNumber).toBe(1);
  });
});
