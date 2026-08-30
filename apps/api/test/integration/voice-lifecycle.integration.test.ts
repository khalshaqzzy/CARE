import {
  AccountKind,
  AttachmentPurpose,
  AttachmentState,
  HandlerType,
  Prisma,
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
let manager: Principal;
let sectionHead: Principal;
let staleHandler: Principal;
let unionHead: Principal;
let officer: Principal;
let unitId: string;
let sourceRow = 0;
let seq = 0;

type VoiceOverride = Partial<Prisma.VoiceUncheckedCreateInput>;

function voiceSeed(overrides: VoiceOverride = {}): Prisma.VoiceUncheckedCreateInput {
  seq += 1;
  return {
    displayId: `CARE-202608-${String(seq).padStart(6, '0')}`,
    reporterId: reporter.accountId,
    visibility: VoiceVisibility.GENERAL,
    area: 'KARAWANG_1',
    reporterNoRegSnapshot: '000001',
    reporterNameSnapshot: 'Reporter',
    reporterDivisionSnapshot: 'Division A',
    reporterDepartmentSnapshot: 'Department A',
    reporterOrganizationUnitId: unitId,
    routeOwnerId: manager.accountId,
    status: VoiceStatus.OPEN,
    handlerType: HandlerType.MANAGER,
    locationDetail: 'line',
    title: 'test voice',
    detail: 'detail',
    severity: Severity.MEDIUM,
    category: null,
    anonymousAlias: `R-${seq}`,
    version: 1,
    ...overrides,
  } as Prisma.VoiceUncheckedCreateInput;
}

async function evidence(voiceId: string, uploaderId: string, key: string, count = 1) {
  for (let index = 0; index < count; index += 1)
    await prisma.attachment.create({
      data: {
        voiceId,
        uploaderId,
        purpose: AttachmentPurpose.CLOSURE_EVIDENCE,
        state: AttachmentState.READY,
        storageKey: `voice-lifecycle/${key}-${index}.webp`,
        mimeType: 'image/webp',
        size: 10,
        checksum: 'a'.repeat(64),
        readyAt: new Date(),
      },
    });
}

async function createVoice(overrides: VoiceOverride = {}) {
  return prisma.voice.create({ data: voiceSeed(overrides) });
}

describe('Voice lifecycle backend completion', () => {
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

    const workforce = async (noReg: string, name: string, position: string, section: string) => {
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
          section,
          sourceRow: (sourceRow += 1),
        },
      });
      return account;
    };
    const union = async (name: string, slot: UnionSlot) => {
      const account = await prisma.userAccount.create({
        data: {
          username: `union-${name}`,
          displayName: name,
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

    reporter = await resolve(await workforce('000001', 'Reporter', 'Member', 'Section A'));
    manager = await resolve(
      await workforce('000002', 'Manager PIC', 'Department Head', 'Section A'),
    );
    sectionHead = await resolve(
      await workforce('000003', 'Section Head One', 'Section Head', 'Section A'),
    );
    staleHandler = await resolve(
      await workforce('000004', 'Section Head Stale', 'Section Head', 'Section A'),
    );
    unionHead = await resolve(await union('Union Head', UnionSlot.HEAD));
    officer = await resolve(await union('Officer One', UnionSlot.OFFICER_1));
  });
  afterAll(async () => prisma.$disconnect());

  it('rejects assignment when expectedVersion is stale', async () => {
    const voice = await createVoice({ status: VoiceStatus.OPEN });
    await expect(
      voices.assign(
        manager,
        voice.id,
        { handlerAccountId: sectionHead.accountId, expectedVersion: 999 },
        'assign-k1',
      ),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('keeps chat absent for OPEN and for a direct OPEN to IN_PROGRESS transition', async () => {
    const voice = await createVoice({ status: VoiceStatus.OPEN });
    const openDetail = await voices.detail(manager, voice.id);
    expect(openDetail.conversationState).toBe('UNAVAILABLE');
    expect(openDetail.availableActions).not.toContain('MESSAGE');
    await expect(voices.messages(manager, voice.id, {})).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    const progressed = await voices.proceed(manager, voice.id, { version: 1 }, 'proceed-no-chat');
    expect(progressed.status).toBe(VoiceStatus.IN_PROGRESS);
    expect(await prisma.conversation.count({ where: { voiceId: voice.id } })).toBe(0);
    const progressedDetail = await voices.detail(manager, voice.id);
    expect(progressedDetail.conversationState).toBe('UNAVAILABLE');
    await expect(
      voices.addMessage(manager, voice.id, { text: 'should fail' }, [], 'message-no-chat'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('opens an empty active room on assignment and creates records on the first message', async () => {
    const voice = await createVoice({ status: VoiceStatus.OPEN });
    await voices.assign(
      manager,
      voice.id,
      { handlerAccountId: sectionHead.accountId, expectedVersion: 1 },
      'assign-chat-room',
    );

    expect(await prisma.conversation.count({ where: { voiceId: voice.id } })).toBe(0);
    const assignedDetail = await voices.detail(sectionHead, voice.id);
    expect(assignedDetail.conversationState).toBe('ACTIVE');
    expect(assignedDetail.availableActions).toContain('MESSAGE');
    expect(await voices.messages(sectionHead, voice.id, {})).toMatchObject({ items: [] });

    await voices.addMessage(
      sectionHead,
      voice.id,
      { text: 'Mohon lengkapi lokasi.' },
      [],
      'message-first',
    );
    expect(await prisma.conversation.count({ where: { voiceId: voice.id } })).toBe(1);
    expect((await voices.messages(reporter, voice.id, {})).items).toHaveLength(1);
  });

  it('preserves an asked conversation through IN_PROGRESS and makes it read-only when CLOSED', async () => {
    const voice = await createVoice({ status: VoiceStatus.OPEN });
    const asked = await voices.ask(
      manager,
      voice.id,
      { text: 'Bisa beri detail tambahan?', version: 1 },
      'ask-chat-lifecycle',
    );
    expect((await voices.detail(reporter, voice.id)).conversationState).toBe('ACTIVE');

    const progressed = await voices.proceed(
      manager,
      voice.id,
      { version: asked.version },
      'proceed-chat-lifecycle',
    );
    expect((await voices.detail(manager, voice.id)).conversationState).toBe('ACTIVE');

    await evidence(voice.id, manager.accountId, 'chat-close');
    await voices.close(
      manager,
      voice.id,
      { note: 'resolved', version: progressed.version },
      'close-chat-lifecycle',
    );
    expect((await voices.detail(reporter, voice.id)).conversationState).toBe('READ_ONLY');
    await expect(
      voices.addMessage(reporter, voice.id, { text: 'too late' }, [], 'message-closed'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('lists section head candidates for General and union officers for Private', async () => {
    const general = await createVoice({
      status: VoiceStatus.OPEN,
      visibility: VoiceVisibility.GENERAL,
    });
    const generalCandidates = await voices.assignmentCandidates(manager, general.id);
    expect(generalCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: sectionHead.accountId, displayName: 'Section Head One' }),
      ]),
    );

    const privateVoice = await createVoice({
      status: VoiceStatus.OPEN,
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: unionHead.accountId,
      handlerType: HandlerType.UNION_HEAD,
    });
    const privateCandidates = await voices.assignmentCandidates(unionHead, privateVoice.id);
    expect(privateCandidates).toEqual([
      expect.objectContaining({ id: officer.accountId, slot: UnionSlot.OFFICER_1 }),
    ]);
    // Workload subtitle: the candidate has no active voice yet, then gains one.
    expect(privateCandidates[0]).toMatchObject({ activeCount: 0 });
    await createVoice({
      status: VoiceStatus.IN_VERIFICATION,
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: unionHead.accountId,
      handlerType: HandlerType.UNION_HEAD,
      currentHandlerId: officer.accountId,
    });
    const reloaded = await voices.assignmentCandidates(unionHead, privateVoice.id);
    expect(reloaded[0]).toMatchObject({ id: officer.accountId, activeCount: 1 });
  });

  it('links staged closure evidence to the closure cycle with a 1-5 cap', async () => {
    const voice = await createVoice({ status: VoiceStatus.IN_PROGRESS });
    await evidence(voice.id, manager.accountId, 'close-evidence', 2);
    const closure = await voices.close(
      manager,
      voice.id,
      { note: 'resolved', version: 1 },
      'close-k1',
    );
    const linked = await prisma.attachment.count({
      where: {
        closureId: closure.id,
        purpose: AttachmentPurpose.CLOSURE_EVIDENCE,
        state: AttachmentState.REFERENCED,
      },
    });
    expect(linked).toBe(2);
  });

  it('enforces the closure evidence cap', async () => {
    const voice = await createVoice({ status: VoiceStatus.IN_PROGRESS });
    await evidence(voice.id, manager.accountId, 'close-cap', 6);
    await expect(
      voices.close(manager, voice.id, { note: 'resolved', version: 1 }, 'close-k2'),
    ).rejects.toMatchObject({ code: 'EVIDENCE_LIMIT' });
  });

  it('replays an idempotent close and rate with the same key', async () => {
    const voice = await createVoice({ status: VoiceStatus.IN_PROGRESS });
    const firstClose = await voices.close(
      manager,
      voice.id,
      { note: 'done', version: 1 },
      'close-k3',
    );
    const replayedClose = await voices.close(
      manager,
      voice.id,
      { note: 'done', version: 1 },
      'close-k3',
    );
    expect(replayedClose.id).toBe(firstClose.id);

    const firstRate = await voices.rate(
      reporter,
      voice.id,
      { score: 5, feedback: 'ok', reopen: false },
      'rate-k3',
    );
    const replayedRate = await voices.rate(
      reporter,
      voice.id,
      { score: 5, feedback: 'ok', reopen: false },
      'rate-k3',
    );
    expect(replayedRate.id).toBe(firstRate.id);
    expect(await prisma.rating.count({ where: { closureCycleId: firstClose.id } })).toBe(1);
    await expect(
      voices.rate(
        reporter,
        voice.id,
        { score: 4, feedback: 'different', reopen: false },
        'rate-k3',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('falls back to the route owner on reopen when the last PIC is deactivated', async () => {
    const voice = await createVoice({
      status: VoiceStatus.IN_PROGRESS,
      currentHandlerId: staleHandler.accountId,
      handlerType: HandlerType.SECTION_HEAD,
    });
    await voices.close(manager, voice.id, { note: 'done', version: 1 }, 'close-k4');
    await prisma.userAccount.update({
      where: { id: staleHandler.accountId },
      data: { status: 'INACTIVE' },
    });
    await voices.rate(
      reporter,
      voice.id,
      { score: 2, feedback: 'not resolved', reopen: true },
      'rate-k4',
    );
    const reopened = await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } });
    expect(reopened.status).toBe(VoiceStatus.IN_VERIFICATION);
    expect(reopened.currentHandlerId).toBe(manager.accountId);
    expect(reopened.handlerType).toBe(HandlerType.MANAGER);
  });
});
