import {
  AccountKind,
  HandlerType,
  NotificationType,
  Prisma,
  PrismaClient,
  Severity,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PolicyService, type Principal } from '../../src/auth/policy.service';
import { ClosureReviewService } from '../../src/voices/closure-review.service';
import { VoicesService } from '../../src/voices/voices.service';

const prisma = new PrismaClient();
const policy = new PolicyService(prisma as never);
const voices = new VoicesService(prisma as never, {} as never, {} as never, policy);
const reviewWorker = new ClosureReviewService(prisma as never);

let reporter: Principal;
let manager: Principal;
let unitId: string;
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
    status: VoiceStatus.IN_PROGRESS,
    handlerType: HandlerType.MANAGER,
    locationDetail: 'line',
    title: 'closure review voice',
    detail: 'detail',
    severity: Severity.MEDIUM,
    categoryKey: null,
    anonymousAlias: `R-${seq}`,
    version: 1,
    ...overrides,
  } as Prisma.VoiceUncheckedCreateInput;
}

async function closeFreshVoice(key: string) {
  const voice = await prisma.voice.create({ data: voiceSeed() });
  const closure = await voices.close(manager, voice.id, { note: 'resolved', version: 1 }, key);
  return { voice, closure };
}

async function latestCycle(voiceId: string) {
  return prisma.closureCycle.findFirstOrThrow({
    where: { voiceId },
    orderBy: { cycleNumber: 'desc' },
  });
}

describe('Closure review window and auto-acceptance', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserAccount", "Employee", "OrganizationSnapshot", "OrganizationUnit", "OrganizationMembership", "UnionAccountTerm" CASCADE',
    );
    const snapshot = await prisma.organizationSnapshot.create({
      data: { status: 'ACTIVE', checksum: 'c'.repeat(64), rowCount: 2, effectiveAt: new Date() },
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
          sourceRow: seq * 100 + Number(noReg),
        },
      });
      return account;
    };
    const resolve = async (account: Parameters<typeof policy.resolvePrincipal>[0]) =>
      policy.resolvePrincipal(account, { id: crypto.randomUUID(), passwordRestricted: false });

    reporter = await resolve(await workforce('000001', 'Reporter', 'Member', 'Section A'));
    manager = await resolve(
      await workforce('000002', 'Manager PIC', 'Department Head', 'Section A'),
    );
  });
  afterAll(async () => prisma.$disconnect());

  it('opens a pending review window with a two-day deadline on close', async () => {
    const { voice, closure } = await closeFreshVoice('cr-close-1');
    const cycle = await latestCycle(voice.id);
    expect(cycle.reviewState).toBe('PENDING');
    expect(cycle.reviewResolvedAt).toBeNull();
    const expected = closure.closedAt.getTime() + 2 * 86_400_000;
    expect(cycle.reviewDeadline?.getTime()).toBe(expected);

    // Reporter-facing aggregates and serializers carry the review state.
    const dashboard = await voices.dashboardMember(reporter);
    expect(dashboard.closedPendingReview).toBe(1);
    const detail = await voices.detail(reporter, voice.id);
    const serialized = detail.closureCycles?.[0];
    expect(serialized).toMatchObject({ reviewState: 'PENDING' });
    expect(serialized).toHaveProperty('reviewDeadline');
  });

  it('accepts the closure on a rating of three or more', async () => {
    const { voice } = await closeFreshVoice('cr-close-2');
    // The queue also holds leftovers from earlier tests, so assert the delta.
    const pendingBefore = (await voices.dashboardMember(reporter)).closedPendingReview;
    await voices.rate(reporter, voice.id, { score: 4, reopen: false }, 'cr-rate-2');
    const cycle = await latestCycle(voice.id);
    expect(cycle.reviewState).toBe('ACCEPTED');
    expect(cycle.reviewResolvedAt).not.toBeNull();
    expect(cycle.reopenedAt).toBeNull();
    expect((await voices.dashboardMember(reporter)).closedPendingReview).toBe(pendingBefore - 1);

    // The rating consumed the cycle: no second RATE and no standalone REOPEN.
    const detail = await voices.detail(reporter, voice.id);
    expect(detail.availableActions).not.toContain('RATE');
    expect(detail.availableActions).not.toContain('REOPEN');
    await expect(
      voices.rate(reporter, voice.id, { score: 3, reopen: false }, 'cr-rate-2b'),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
  });

  it('rejects the closure when a low rating reopens the voice', async () => {
    const { voice } = await closeFreshVoice('cr-close-3');
    await voices.rate(
      reporter,
      voice.id,
      { score: 2, feedback: 'belum selesai', reopen: true },
      'cr-rate-3',
    );
    const cycle = await latestCycle(voice.id);
    expect(cycle.reviewState).toBe('REJECTED');
    expect(cycle.reviewResolvedAt).not.toBeNull();
    expect(cycle.reopenedAt).not.toBeNull();

    const reopened = await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } });
    expect(reopened.status).toBe(VoiceStatus.IN_VERIFICATION);

    // The rejected cycle no longer accepts a rating at all.
    await expect(
      voices.rate(reporter, voice.id, { score: 5, reopen: false }, 'cr-rate-3b'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses reopen once the window has passed but still records the late rating', async () => {
    const { voice, closure } = await closeFreshVoice('cr-close-4');
    const pendingBeforeExpiry = (await voices.dashboardMember(reporter)).closedPendingReview;
    const deadline = new Date(closure.closedAt.getTime() - 60_000);
    await prisma.closureCycle.update({
      where: { id: closure.id },
      data: { reviewDeadline: deadline },
    });

    // Read paths must not expose a stale reopen affordance while the worker is
    // delayed: the effective state is accepted immediately at the deadline.
    const expiredDetail = await voices.detail(reporter, voice.id);
    expect(expiredDetail.closureCycles?.[0]).toMatchObject({
      reviewState: 'ACCEPTED',
      reviewResolvedAt: deadline,
    });
    expect(expiredDetail.availableActions).toContain('RATE');
    expect((await voices.dashboardMember(reporter)).closedPendingReview).toBe(
      pendingBeforeExpiry - 1,
    );

    await expect(
      voices.rate(
        reporter,
        voice.id,
        { score: 2, feedback: 'belum selesai', reopen: true },
        'cr-rate-4a',
      ),
    ).rejects.toMatchObject({ code: 'REOPEN_NOT_ALLOWED' });
    // Nothing was written by the refused reopen.
    expect(await prisma.rating.count({ where: { closureCycleId: closure.id } })).toBe(0);
    expect((await latestCycle(voice.id)).reviewState).toBe('PENDING');

    // A late feedback-only rating still lands and resolves the cycle.
    await voices.rate(
      reporter,
      voice.id,
      { score: 2, feedback: 'sudah oke sebenarnya', reopen: false },
      'cr-rate-4b',
    );
    const cycle = await latestCycle(voice.id);
    expect(cycle.reviewState).toBe('ACCEPTED');
    expect(cycle.reviewResolvedAt).not.toBeNull();
    expect(
      await prisma.rating.findFirstOrThrow({ where: { closureCycleId: closure.id } }),
    ).toMatchObject({ score: 2, reopen: false });
  });

  it('auto-accepts an expired pending cycle, emits a system event, and notifies reporter and closer', async () => {
    const { voice, closure } = await closeFreshVoice('cr-close-5');
    const forcedDeadline = new Date(Date.now() - 86_400_000);
    await prisma.closureCycle.update({
      where: { id: closure.id },
      data: { reviewDeadline: forcedDeadline },
    });

    await reviewWorker.tick();

    const cycle = await latestCycle(voice.id);
    expect(cycle.reviewState).toBe('ACCEPTED');
    expect(cycle.reviewResolvedAt?.getTime()).toBe(forcedDeadline.getTime());

    // The timeline event is system-generated: attributed to the closing PIC's
    // snapshot but marked system so the UI hides the actor.
    const event = await prisma.voiceEvent.findFirstOrThrow({
      where: { voiceId: voice.id, type: VoiceEventType.AUTO_ACCEPTED },
    });
    expect(event.actorId).toBe(manager.accountId);
    expect(event.payload).toMatchObject({ closureId: closure.id, system: true });

    const notifications = await prisma.notification.findMany({
      where: { voiceId: voice.id, type: NotificationType.CLOSURE_AUTO_ACCEPTED },
    });
    expect(new Set(notifications.map((item) => item.recipientId))).toEqual(
      new Set([reporter.accountId, manager.accountId]),
    );
    const outbox = await prisma.outboxEvent.findMany({
      where: {
        topic: 'PUSH_NOTIFICATION',
        dedupeKey: { startsWith: `CLOSURE_AUTO_ACCEPTED:${voice.id}:` },
      },
    });
    expect(outbox).toHaveLength(2);

    // The tick is idempotent: a second pass resolves nothing new.
    await reviewWorker.tick();
    expect(
      await prisma.voiceEvent.count({
        where: { voiceId: voice.id, type: VoiceEventType.AUTO_ACCEPTED },
      }),
    ).toBe(1);
    expect(await latestCycle(voice.id)).toMatchObject({ reviewState: 'ACCEPTED' });

    // A late rating after auto-acceptance stays feedback-only and never
    // touches the resolved timestamp.
    const resolvedAt = cycle.reviewResolvedAt;
    await expect(
      voices.rate(reporter, voice.id, { score: 1, feedback: 'kurang', reopen: true }, 'cr-rate-5a'),
    ).rejects.toMatchObject({ code: 'REOPEN_NOT_ALLOWED' });
    await voices.rate(reporter, voice.id, { score: 5, reopen: false }, 'cr-rate-5b');
    const after = await latestCycle(voice.id);
    expect(after.reviewState).toBe('ACCEPTED');
    expect(after.reviewResolvedAt?.getTime()).toBe(resolvedAt?.getTime());
    expect(await prisma.voice.findUniqueOrThrow({ where: { id: voice.id } })).toMatchObject({
      status: VoiceStatus.CLOSED,
    });
  });

  it('starts a fresh pending cycle when a reopened voice closes again', async () => {
    const { voice } = await closeFreshVoice('cr-close-6');
    const pendingBefore = (await voices.dashboardMember(reporter)).closedPendingReview;
    await voices.rate(
      reporter,
      voice.id,
      { score: 1, feedback: 'tidak selesai', reopen: true },
      'cr-rate-6a',
    );
    const reopened = await prisma.voice.findUniqueOrThrow({
      where: { id: voice.id },
      select: { version: true },
    });
    const proceeded = await voices.proceed(
      manager,
      voice.id,
      { version: reopened.version },
      'cr-proceed-6',
    );
    await voices.close(
      manager,
      voice.id,
      { note: 'attempt two', version: proceeded.version },
      'cr-close-6b',
    );

    const cycles = await prisma.closureCycle.findMany({
      where: { voiceId: voice.id },
      orderBy: { cycleNumber: 'asc' },
    });
    expect(cycles).toHaveLength(2);
    expect(cycles[0]).toMatchObject({ reviewState: 'REJECTED' });
    expect(cycles[1]).toMatchObject({ cycleNumber: 2, reviewState: 'PENDING', reopenedAt: null });
    // The rejected cycle stopped counting; the fresh one takes its place.
    expect((await voices.dashboardMember(reporter)).closedPendingReview).toBe(pendingBefore);
  });
});
