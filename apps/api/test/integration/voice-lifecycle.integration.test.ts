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
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { MediaService } from '../../src/media/media.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);
const media = new MediaService(prisma as never, policy);

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
    categoryKey: null,
    anonymousAlias: `R-${seq}`,
    version: 1,
    ...overrides,
  } as Prisma.VoiceUncheckedCreateInput;
}

async function evidence(voiceId: string, uploaderId: string, key: string, count = 1) {
  const attachments = [];
  for (let index = 0; index < count; index += 1)
    attachments.push(
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
      }),
    );
  return attachments;
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

  it('requires monitor and a note before opening the conversation; replays concurrent actions', async () => {
    const voice = await createVoice();
    expect((await voices.detail(manager, voice.id)).conversationState).toBe('UNAVAILABLE');
    expect(await prisma.notification.count({ where: { voiceId: voice.id } })).toBe(0);
    await expect(
      voices.ask(manager, voice.id, { text: 'old', version: 1 }, 'old-ask'),
    ).rejects.toMatchObject({ code: 'CLIENT_UPDATE_REQUIRED' });
    await expect(
      voices.proceed(manager, voice.id, { text: 'Tindak lanjut', version: 1 }, 'skip-monitor'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    const monitored = await Promise.all([
      voices.monitor(manager, voice.id, { version: 1 }, 'monitor-replay'),
      voices.monitor(manager, voice.id, { version: 1 }, 'monitor-replay'),
    ]);
    expect(monitored[0]).toEqual(monitored[1]);
    expect(monitored[0].status).toBe('MONITORED');
    expect((await voices.detail(reporter, voice.id)).conversationState).toBe('UNAVAILABLE');
    expect(
      await prisma.notification.count({
        where: { voiceId: voice.id, recipientId: reporter.accountId },
      }),
    ).toBe(1);
    await expect(
      voices.proceed(manager, voice.id, { text: '   ', version: 2 }, 'blank'),
    ).rejects.toBeDefined();
    const processed = await Promise.all([
      voices.proceed(
        manager,
        voice.id,
        { text: '  Memeriksa lokasi  ', version: 2 },
        'process-replay',
      ),
      voices.proceed(
        manager,
        voice.id,
        { text: '  Memeriksa lokasi  ', version: 2 },
        'process-replay',
      ),
    ]);
    expect(processed[0]).toEqual(processed[1]);
    expect(processed[0]).toMatchObject({
      status: 'IN_PROGRESS',
      currentHandlerId: manager.accountId,
      version: 3,
    });
    expect((await voices.messages(reporter, voice.id, {})).items).toHaveLength(1);
    expect((await voices.messages(reporter, voice.id, {})).items[0]?.text).toBe('Memeriksa lokasi');
    expect(
      await prisma.notification.count({
        where: { voiceId: voice.id, recipientId: reporter.accountId },
      }),
    ).toBe(2);
    await expect(
      voices.proceed(manager, voice.id, { text: 'different', version: 2 }, 'process-replay'),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('assignment monitors without chat and only the assigned PIC can start processing', async () => {
    const voice = await createVoice();
    const body = { handlerAccountId: sectionHead.accountId, expectedVersion: 1 };
    const assigned = await voices.assign(manager, voice.id, body, 'assign-chat-room');
    expect(await voices.assign(manager, voice.id, body, 'assign-chat-room')).toEqual(assigned);
    expect(await prisma.conversation.count({ where: { voiceId: voice.id } })).toBe(0);
    expect((await voices.detail(sectionHead, voice.id)).conversationState).toBe('UNAVAILABLE');
    await expect(
      voices.proceed(manager, voice.id, { text: 'take over', version: 2 }, 'owner-denied'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await expect(
      voices.addMessage(sectionHead, voice.id, { text: 'too soon' }, [], 'message-soon'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await voices.proceed(
      sectionHead,
      voice.id,
      { text: 'Memeriksa lokasi', version: 2 },
      'assigned-process',
    );
    expect((await voices.detail(reporter, voice.id)).conversationState).toBe('ACTIVE');
    expect((await voices.messages(reporter, voice.id, {})).items).toHaveLength(1);
    expect(await prisma.voiceEvent.count({ where: { voiceId: voice.id, type: 'MONITORED' } })).toBe(
      1,
    );
  });

  it('allows assignment and reassign after monitoring without duplicate reporter acknowledgement', async () => {
    const voice = await createVoice();
    await voices.monitor(manager, voice.id, { version: 1 }, 'later-monitor');
    const assigned = await voices.assign(
      manager,
      voice.id,
      { handlerAccountId: sectionHead.accountId, expectedVersion: 2 },
      'later-assign',
    );
    expect(assigned.status).toBe('MONITORED');
    const reassigned = await voices.reassign(
      manager,
      voice.id,
      { handlerAccountId: sectionHead.accountId, expectedVersion: 3 },
      'later-reassign',
    );
    expect(reassigned.version).toBe(4);
    expect(
      await prisma.notification.count({
        where: { voiceId: voice.id, recipientId: reporter.accountId },
      }),
    ).toBe(1);
    expect(
      await prisma.voiceAssignment.count({ where: { voiceId: voice.id, endedAt: null } }),
    ).toBe(1);
    expect(await prisma.voiceAssignment.count({ where: { voiceId: voice.id } })).toBe(2);
    await voices.proceed(
      sectionHead,
      voice.id,
      { version: 4, text: 'Pemeriksaan dimulai' },
      'later-process',
    );
    await expect(
      voices.reassign(
        manager,
        voice.id,
        { handlerAccountId: sectionHead.accountId, expectedVersion: 5 },
        'late-reassign',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('Private assignment acknowledges anonymously and reserves processing for the officer', async () => {
    const voice = await createVoice({
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: unionHead.accountId,
      handlerType: HandlerType.UNION_HEAD,
      showReporterIdentity: false,
    });
    await voices.assign(
      unionHead,
      voice.id,
      { handlerAccountId: officer.accountId, expectedVersion: 1 },
      'private-assign',
    );
    await expect(
      voices.proceed(unionHead, voice.id, { version: 2, text: 'takeover' }, 'private-owner'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    await voices.proceed(
      officer,
      voice.id,
      { version: 2, text: 'Komite menindaklanjuti laporan' },
      'private-process',
    );
    await voices.addMessage(reporter, voice.id, { text: 'Terima kasih' }, [], 'private-reply');
    const messages = await voices.messages(officer, voice.id, {});
    expect(messages.items[1]?.sender).toMatchObject({ kind: 'ANONYMOUS_REPORTER' });
    expect(messages.items[1]?.senderId).toBeUndefined();
  });

  it('serializes closure against message writes and never accepts a post-closure message', async () => {
    const voice = await createVoice({ status: VoiceStatus.MONITORED });
    const processed = await voices.proceed(
      manager,
      voice.id,
      { version: 1, text: 'Pemeriksaan dimulai' },
      'race-process',
    );
    await Promise.allSettled([
      voices.close(
        manager,
        voice.id,
        { version: processed.version, note: 'Selesai' },
        'race-close',
      ),
      voices.addMessage(reporter, voice.id, { text: 'Concurrent reply' }, [], 'race-reply'),
    ]);
    const closure = await prisma.closureCycle.findFirstOrThrow({ where: { voiceId: voice.id } });
    const messages = await prisma.message.findMany({
      where: { conversation: { voiceId: voice.id } },
    });
    expect(messages.every((message) => message.createdAt <= closure.closedAt)).toBe(true);
    await expect(
      voices.addMessage(reporter, voice.id, { text: 'Late' }, [], 'race-late'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('rolls back reopen and rating when neither last PIC nor route owner is active', async () => {
    const voice = await createVoice({
      status: VoiceStatus.IN_PROGRESS,
      currentHandlerId: manager.accountId,
    });
    const closed = await voices.close(
      manager,
      voice.id,
      { version: 1, note: 'Selesai' },
      'inactive-close',
    );
    await prisma.userAccount.update({
      where: { id: manager.accountId },
      data: { status: 'INACTIVE' },
    });
    try {
      await expect(
        voices.rate(
          reporter,
          voice.id,
          { score: 1, feedback: 'Masih bermasalah', reopen: true },
          'inactive-reopen',
        ),
      ).rejects.toMatchObject({ code: 'REOPEN_HANDLER_UNAVAILABLE' });
      expect(await prisma.rating.count({ where: { closureCycleId: closed.id } })).toBe(0);
      expect((await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).status).toBe(
        'CLOSED',
      );
    } finally {
      await prisma.userAccount.update({
        where: { id: manager.accountId },
        data: { status: 'ACTIVE' },
      });
    }
  });

  it.each([0, 1, 5])(
    'closes with %i optional photos and preserves the review cycle',
    async (count) => {
      const voice = await createVoice({
        status: VoiceStatus.IN_PROGRESS,
        currentHandlerId: manager.accountId,
      });
      await evidence(voice.id, manager.accountId, `optional-${count}`, count);
      await voices.close(
        manager,
        voice.id,
        { note: 'Perbaikan selesai', version: 1 },
        `optional-close-${count}`,
      );
      const result = await voices.detail(reporter, voice.id);
      expect(result.status).toBe('CLOSED');
      expect(result.closureCycles[0].evidence).toHaveLength(count);
      expect(result.closureCycles[0].reviewState).toBe('PENDING');
      const event = await prisma.voiceEvent.findFirstOrThrow({
        where: { voiceId: voice.id, type: 'CLOSED' },
      });
      expect(event.payload).toMatchObject({ evidenceCount: count });
    },
  );

  it('preserves a processing conversation through IN_PROGRESS and makes it read-only when CLOSED', async () => {
    const voice = await createVoice({ status: VoiceStatus.OPEN });
    const asked = await voices.monitor(manager, voice.id, { version: 1 }, 'ask-chat-lifecycle');
    expect((await voices.detail(reporter, voice.id)).conversationState).toBe('UNAVAILABLE');

    const progressed = await voices.proceed(
      manager,
      voice.id,
      { text: 'Memeriksa lokasi', version: asked.version },
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
    const previousCount = privateCandidates[0]!.activeCount;
    await createVoice({
      status: VoiceStatus.MONITORED,
      visibility: VoiceVisibility.PRIVATE,
      routeOwnerId: unionHead.accountId,
      handlerType: HandlerType.UNION_HEAD,
      currentHandlerId: officer.accountId,
    });
    const reloaded = await voices.assignmentCandidates(unionHead, privateVoice.id);
    expect(reloaded[0]).toMatchObject({ id: officer.accountId, activeCount: previousCount + 1 });
  });

  it('links staged closure evidence to the closure cycle with a 1-5 cap', async () => {
    const voice = await createVoice({ status: VoiceStatus.IN_PROGRESS });
    const staged = await evidence(voice.id, manager.accountId, 'close-evidence', 2);
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

    const mediaPath = resolve(process.env.MEDIA_ROOT!, 'objects', staged[0]!.storageKey);
    await mkdir(dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, 'closure evidence');
    try {
      await expect(media.readAuthorized(staged[0]!.id, reporter)).resolves.toMatchObject({
        buffer: Buffer.from('closure evidence'),
      });
      await expect(media.readAuthorized(staged[0]!.id, manager)).resolves.toMatchObject({
        buffer: Buffer.from('closure evidence'),
      });
      await expect(media.readAuthorized(staged[0]!.id, sectionHead)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    } finally {
      await unlink(mediaPath).catch(() => undefined);
    }
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
    expect(reopened.status).toBe(VoiceStatus.IN_PROGRESS);
    expect(reopened.currentHandlerId).toBe(manager.accountId);
    expect(reopened.handlerType).toBe(HandlerType.MANAGER);
    expect(reopened.handlingSectionSnapshot).toBeNull();
  });
});
