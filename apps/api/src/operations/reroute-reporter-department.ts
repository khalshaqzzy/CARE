import {
  AccountStatus,
  ClosureReportState,
  GeneralVoiceCategoryRouteMode,
  HandlerType,
  MessageKind,
  NotificationType,
  Prisma,
  PrismaClient,
  RouteKind,
  VoiceEventType,
  VoiceStatus,
  VoiceVisibility,
} from '@prisma/client';
import { activeSubstitutes } from '../away/away';
import { tierWindow } from '../escalation/tier-window';
import { resolveTierChain, sectionHasGroupLeader, type TierStep } from '../voices/tier-chain';

type Tx = Prisma.TransactionClient;

/**
 * One-off: active Voices of a category that now routes to the reporter's
 * department (Admin changed it from the incident shop owner) but were sent to
 * another department's shop. Each one starts again at the bottom of the
 * reporter's own chain (Group Leader → Section Head → Manager), with a new
 * window. A Voice already in Diproses loses its PIC and target and returns to
 * Direspon; a report waiting for approval is returned. A dry run lists them.
 */
export const REROUTE_SOURCE = 'REPORTER_DEPARTMENT_REROUTE';

export type RerouteRow = {
  voiceId: string;
  displayId: string;
  status: VoiceStatus;
  from: string | null;
  to: string | null;
  firstLevel: string | null;
  holders: string[];
  result: 'SIAP' | 'DIPINDAH' | 'ERROR';
  message?: string;
};

const ACTIVE: VoiceStatus[] = [VoiceStatus.OPEN, VoiceStatus.RESPONDED, VoiceStatus.IN_PROGRESS];

async function candidates(db: PrismaClient | Tx, categoryKey: string) {
  const category = await db.generalVoiceCategory.findUnique({
    where: { key: categoryKey },
    include: { routes: { where: { effectiveTo: null } } },
  });
  if (!category) throw new Error(`Kategori ${categoryKey} tidak ditemukan`);
  if (category.routes[0]?.mode !== GeneralVoiceCategoryRouteMode.RELATED_REPORTER_DEPARTMENT)
    throw new Error(
      `Route kategori ${categoryKey} belum "Related Dept (department reporter)". Ubah dulu di Admin › Kategori.`,
    );
  const rows = await db.voice.findMany({
    where: {
      visibility: VoiceVisibility.GENERAL,
      currentCategoryKey: categoryKey,
      status: { in: ACTIVE },
    },
    select: {
      id: true,
      reporterOrganizationUnitId: true,
      handlingOrganizationUnitId: true,
      outsideReporter: true,
    },
    orderBy: { submittedAt: 'asc' },
  });
  // Only the Voices that left the reporter's department.
  return rows
    .filter(
      (row) =>
        row.outsideReporter || row.handlingOrganizationUnitId !== row.reporterOrganizationUnitId,
    )
    .map((row) => row.id);
}

type Plan = {
  voice: Prisma.VoiceGetPayload<{ include: { conversation: { select: { id: true } } } }>;
  route: { id: string; ownerAccountId: string; organizationUnitId: string | null };
  unit: { id: string; directorate: string; division: string; department: string };
  snapshotId: string | null;
  chain: TierStep[];
};

async function plan(db: PrismaClient | Tx, id: string): Promise<Plan | string> {
  const voice = await db.voice.findUniqueOrThrow({
    where: { id },
    include: { conversation: { select: { id: true } } },
  });
  if (!voice.reporterOrganizationUnitId) return 'Departemen pelapor tidak tercatat';
  const unit = await db.organizationUnit.findUniqueOrThrow({
    where: { id: voice.reporterOrganizationUnitId },
  });
  const route = await db.routeMapping.findFirst({
    where: {
      organizationUnitId: unit.id,
      kind: { in: [RouteKind.DEPARTMENT_HEAD, RouteKind.DEFAULT_DEPARTMENT] },
      effectiveTo: null,
      owner: { status: AccountStatus.ACTIVE },
    },
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!route) return `Department Head ${unit.department} belum ada atau tidak aktif`;
  const snapshot = await db.organizationSnapshot.findFirst({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });
  const chain = await resolveTierChain(db, {
    snapshotId: snapshot?.id ?? null,
    reporterOrganizationUnitId: unit.id,
    section: voice.reporterSectionSnapshot,
    line: voice.reporterLineSnapshot,
    reporterAccountId: voice.reporterId,
    reporterPosition: voice.reporterPositionSnapshot,
    managerAccountId: route.ownerAccountId,
    handlingOrganizationUnitId: unit.id,
    outsideReporter: false,
  });
  if (!chain.length) return 'Tidak ada atasan aktif di departemen pelapor';
  return { voice, route, unit, snapshotId: snapshot?.id ?? null, chain };
}

async function names(db: PrismaClient | Tx, ids: string[]) {
  const accounts = await db.userAccount.findMany({
    where: { id: { in: ids } },
    select: { displayName: true },
  });
  return accounts.map((account) => account.displayName).sort();
}

async function row(db: PrismaClient | Tx, id: string, planned: Plan | string): Promise<RerouteRow> {
  const voice = await db.voice.findUniqueOrThrow({
    where: { id },
    select: { displayId: true, status: true, handlingDepartmentSnapshot: true },
  });
  const base = {
    voiceId: id,
    displayId: voice.displayId,
    status: voice.status,
    from: voice.handlingDepartmentSnapshot,
  };
  if (typeof planned === 'string')
    return { ...base, to: null, firstLevel: null, holders: [], result: 'ERROR', message: planned };
  return {
    ...base,
    to: planned.unit.department,
    firstLevel: planned.chain[0]!.level,
    holders: await names(db, planned.chain[0]!.accountIds),
    result: 'SIAP',
  };
}

/** Dry run: which Voices would move and to whom. Nothing is written. */
export async function planReroute(prisma: PrismaClient, categoryKey: string) {
  const rows: RerouteRow[] = [];
  for (const id of await candidates(prisma, categoryKey))
    rows.push(await row(prisma, id, await plan(prisma, id)));
  return rows;
}

async function notify(tx: Tx, recipientId: string, voiceId: string, body: string) {
  const substitute = (await activeSubstitutes(tx, [recipientId])).get(recipientId);
  for (const target of substitute ? [recipientId, substitute] : [recipientId]) {
    const notification = await tx.notification.create({
      data: {
        recipientId: target,
        voiceId,
        type: NotificationType.VOICE_SUBMITTED,
        title: 'Voice dialihkan ke Anda',
        body,
        deepLink: `/voices/${voiceId}`,
      },
    });
    await tx.outboxEvent.create({
      data: {
        topic: 'PUSH_NOTIFICATION',
        dedupeKey: `${REROUTE_SOURCE}:${voiceId}:${target}:${notification.id}`,
        payload: { notificationId: notification.id },
      },
    });
  }
}

/** Moves each Voice in its own transaction under the Voice row lock. */
export async function commitReroute(prisma: PrismaClient, categoryKey: string) {
  const rows: RerouteRow[] = [];
  for (const id of await candidates(prisma, categoryKey)) {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Voice" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const planned = await plan(tx, id);
        const shaped = await row(tx, id, planned);
        if (typeof planned === 'string') return shaped;
        const { voice, route, unit, chain, snapshotId } = planned;
        if (!ACTIVE.includes(voice.status))
          return { ...shaped, result: 'ERROR' as const, message: 'Sudah tidak aktif' };
        const first = chain[0]!;
        const now = new Date();
        // Diproses starts over: the PIC and their target go, the Voice is Direspon.
        const processing = voice.status === VoiceStatus.IN_PROGRESS;
        const status = processing ? VoiceStatus.RESPONDED : voice.status;
        const target = processing
          ? await tx.voiceHandlingTarget.findUnique({
              where: {
                voiceId_cycleNumber: { voiceId: id, cycleNumber: voice.handlingCycleNumber },
              },
            })
          : null;
        if (target) await tx.voiceHandlingTarget.delete({ where: { id: target.id } });
        const pending = await tx.closureReport.findFirst({
          where: { voiceId: id, state: ClosureReportState.PENDING },
        });
        if (pending)
          await tx.closureReport.update({
            where: { id: pending.id },
            data: {
              state: ClosureReportState.RETURNED,
              resolvedAt: now,
              returnNote: 'Voice dialihkan ke departemen pelapor.',
            },
          });
        const window = await tierWindow(
          tx,
          voice.severity,
          status === VoiceStatus.OPEN ? 'RESPOND' : 'FULL',
          now,
        );
        await tx.voice.update({
          where: { id },
          data: {
            status,
            routeOwnerId: route.ownerAccountId,
            routeMappingId: route.id,
            handlingOrganizationUnitId: unit.id,
            handlingDirectorateSnapshot: unit.directorate,
            handlingDivisionSnapshot: unit.division,
            handlingDepartmentSnapshot: unit.department,
            handlingSectionSnapshot: null,
            handlingOrganizationSource: 'ROUTE',
            handlerType: HandlerType.MANAGER,
            currentHandlerId: null,
            tierLevel: first.level,
            tierPath: chain.map((step) => step.level),
            tierHolderIds: first.accountIds,
            tierLowerHolderIds: [],
            tierObserverIds: [],
            tierParticipantIds: [],
            tierHolderResponded: false,
            tierMissedDueAt: null,
            outsideReporter: false,
            sectionHasGroupLeader: await sectionHasGroupLeader(
              tx,
              snapshotId,
              unit.id,
              voice.reporterSectionSnapshot,
            ),
            closureApproverIds: [],
            closureReportedById: null,
            ...(window ?? { tierDueAt: null, tierDueKind: null }),
            version: { increment: 1 },
          },
        });
        // The timeline and chat have no system account: the new Manager carries the note.
        const carrier = await tx.userAccount.findUniqueOrThrow({
          where: { id: route.ownerAccountId },
          select: { id: true, accountKind: true, displayName: true },
        });
        await tx.voiceEvent.create({
          data: {
            voiceId: id,
            type: VoiceEventType.ADMIN_HANDOVER_ROUTED,
            actorId: carrier.id,
            actorAccountKind: carrier.accountKind,
            actorStructuralPosition: null,
            actorCapabilities: [],
            payload: {
              source: REROUTE_SOURCE,
              system: true,
              fromDepartment: voice.handlingDepartmentSnapshot,
              toDepartment: unit.department,
              previousHandlerId: voice.currentHandlerId,
              previousHolders: voice.tierHolderIds,
              previousStatus: voice.status,
              removedTargetDueAt: target?.dueAt?.toISOString() ?? null,
              returnedReportId: pending?.id ?? null,
            },
          },
        });
        if (voice.conversation)
          await tx.message.create({
            data: {
              conversationId: voice.conversation.id,
              senderId: carrier.id,
              senderAccountKind: carrier.accountKind,
              senderCapabilities: [],
              senderNameSnapshot: carrier.displayName,
              kind: MessageKind.SYSTEM,
              text: `Voice dialihkan ke ${unit.department}`,
            },
          });
        for (const recipientId of first.accountIds)
          await notify(
            tx,
            recipientId,
            id,
            `Voice ${voice.displayId} dari tim Anda kini ditangani departemen Anda.`,
          );
        return { ...shaped, result: 'DIPINDAH' as const };
      },
      { timeout: 60_000 },
    );
    rows.push(result);
  }
  return rows;
}
