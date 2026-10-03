import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  MessageKind,
  NotificationType,
  Prisma,
  TierLevel,
  VoiceEventType,
  VoiceStatus,
} from '@prisma/client';
import { activeSubstitutes } from '../away/away';
import { loadConfig } from '../config';
import { tierWindow } from '../escalation/tier-window';
import { PrismaService } from '../prisma.service';
import { chainForVoice, TIER_ORDER } from './tier-chain';

type Tx = Prisma.TransactionClient;

const TIER_LABELS: Record<TierLevel, string> = {
  GROUP_LEADER: 'Group Leader',
  SECTION_HEAD: 'Section Head',
  MANAGER: 'Manager',
  DIVISION: 'Deputy/Division Head',
};

/**
 * Stage 3 (ADR-0059): when a tier holder's window passes, the Voice moves up
 * the chain on its own.
 * - Nobody answered: the next level takes over, the Voice stays Terbuka and
 *   the former holders keep a read-only view.
 * - It reached the holder already answered (manual Naikkan, handover) and was
 *   not processed: the next level takes over again, it stays Direspons, the
 *   chat gets a note and the former holders stay in the chat.
 * - The holder answered (or assigned) but nobody processed it: the next level
 *   joins the chat beside them with Ingatkan / Tugaskan / Proses.
 * Every step runs under the Voice row lock shared with human actions and
 * re-checks the window, so concurrent workers and late actions are safe.
 */
@Injectable()
export class TierEscalationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(TierEscalationService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (loadConfig().OUTBOX_ENABLED)
      this.timer = setInterval(() => {
        void this.tick().catch(() => this.logger.error('Tier escalation tick failed'));
      }, 60_000).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return 0;
    this.running = true;
    let moved = 0;
    try {
      const due = await this.prisma.voice.findMany({
        where: {
          tierDueAt: { lt: now },
          tierLevel: { not: null },
          status: { in: [VoiceStatus.OPEN, VoiceStatus.RESPONDED] },
        },
        orderBy: { tierDueAt: 'asc' },
        take: 50,
        select: { id: true },
      });
      for (const { id } of due)
        if (await this.prisma.$transaction((tx) => this.escalate(tx, id, now))) moved += 1;
    } finally {
      this.running = false;
    }
    return moved;
  }

  private async escalate(tx: Tx, id: string, now: Date) {
    await tx.$queryRaw`SELECT "id" FROM "Voice" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const voice = await tx.voice.findUniqueOrThrow({
      where: { id },
      include: { conversation: { select: { id: true } } },
    });
    if (
      !voice.tierLevel ||
      !voice.tierDueAt ||
      voice.tierDueAt >= now ||
      (voice.status !== VoiceStatus.OPEN && voice.status !== VoiceStatus.RESPONDED)
    )
      return false;
    const from = voice.tierLevel;
    const step = (await chainForVoice(tx, voice)).find(
      (item) => TIER_ORDER.indexOf(item.level) > TIER_ORDER.indexOf(from),
    );
    if (!step) {
      // Top of the chain: nobody left to escalate to; stop the clock.
      await tx.voice.update({ where: { id }, data: { tierDueAt: null, tierDueKind: null } });
      return false;
    }
    const unique = (ids: string[]) => [...new Set(ids)];
    const previous = voice.tierHolderIds;
    const unanswered = voice.status === VoiceStatus.OPEN;
    // Received answered (manual Naikkan / handover) and not processed.
    const handedUp = !unanswered && !voice.tierHolderResponded && !voice.currentHandlerId;
    const window = await tierWindow(
      tx,
      voice.severity,
      unanswered ? 'RESPOND' : handedUp ? 'FULL' : 'PROCESS',
      now,
    );
    await tx.voice.update({
      where: { id },
      data: {
        tierLevel: step.level,
        version: { increment: 1 },
        tierDueAt: window?.tierDueAt ?? null,
        tierDueKind: window?.tierDueKind ?? null,
        ...(unanswered
          ? {
              tierHolderIds: step.accountIds,
              tierLowerHolderIds: [],
              tierObserverIds: unique([...voice.tierObserverIds, ...previous]),
              tierHolderResponded: false,
            }
          : handedUp
            ? {
                tierHolderIds: step.accountIds,
                tierLowerHolderIds: [],
                tierParticipantIds: unique([...voice.tierParticipantIds, ...previous]).filter(
                  (accountId) => !step.accountIds.includes(accountId),
                ),
                tierHolderResponded: false,
              }
            : {
                tierHolderIds: unique([...previous, ...step.accountIds]),
                tierLowerHolderIds: unique([...voice.tierLowerHolderIds, ...previous]),
                tierHolderResponded: true,
              }),
      },
    });
    // No system account: the former holder carries the event, marked as system.
    const carrierId = previous[0] ?? voice.routeOwnerId;
    const carrier = await tx.userAccount.findUniqueOrThrow({
      where: { id: carrierId },
      select: { id: true, accountKind: true, displayName: true },
    });
    await tx.voiceEvent.create({
      data: {
        voiceId: id,
        type: VoiceEventType.ESCALATED,
        actorId: carrier.id,
        actorAccountKind: carrier.accountKind,
        actorStructuralPosition: null,
        actorCapabilities: [],
        payload: {
          from,
          to: step.level,
          holders: step.accountIds,
          automatic: true,
          mode: unanswered ? 'UNANSWERED' : handedUp ? 'HANDED_UP' : 'JOINED',
          system: true,
        },
      },
    });
    if (!unanswered && voice.conversation)
      await tx.message.create({
        data: {
          conversationId: voice.conversation.id,
          senderId: carrier.id,
          senderAccountKind: carrier.accountKind,
          senderCapabilities: [],
          senderNameSnapshot: carrier.displayName,
          kind: MessageKind.SYSTEM,
          text: handedUp
            ? `Diteruskan ke ${TIER_LABELS[step.level]}`
            : `${TIER_LABELS[step.level]} bergabung ke percakapan`,
        },
      });
    const title = 'Voice dinaikkan kepada Anda';
    const body = unanswered
      ? 'Belum direspons dalam batas waktu.'
      : 'Belum diproses dalam batas waktu.';
    for (const recipientId of step.accountIds)
      await this.notify(tx, recipientId, id, NotificationType.ESCALATED, title, body);
    for (const recipientId of previous)
      await this.notify(
        tx,
        recipientId,
        id,
        NotificationType.ESCALATED,
        'Voice naik ke atasan',
        `Batas waktu terlewati; diteruskan ke ${TIER_LABELS[step.level]}.`,
      );
    await this.notify(
      tx,
      voice.reporterId,
      id,
      NotificationType.STATUS_CHANGED,
      'Voice Anda diteruskan ke atasan',
      `Diteruskan ke ${TIER_LABELS[step.level]}.`,
    );
    return true;
  }

  private async notify(
    tx: Tx,
    recipientId: string,
    voiceId: string,
    type: NotificationType,
    title: string,
    body: string,
  ) {
    const substitute = (await activeSubstitutes(tx, [recipientId])).get(recipientId);
    for (const target of substitute ? [recipientId, substitute] : [recipientId]) {
      const notification = await tx.notification.create({
        data: { recipientId: target, voiceId, type, title, body, deepLink: `/voices/${voiceId}` },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'PUSH_NOTIFICATION',
          dedupeKey: `${type}:${voiceId}:${target}:${notification.id}`,
          payload: { notificationId: notification.id },
        },
      });
    }
  }
}
