import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClosureReviewState, NotificationType, Prisma, VoiceEventType } from '@prisma/client';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';

const TICK_INTERVAL_MS = 30_000;

/**
 * Resolves closure review windows: a cycle left unrated past its deadline is
 * auto-accepted by the system. Display paths treat an expired pending cycle as
 * accepted even before this worker fires, so a delayed tick only delays the
 * timeline event and notifications, never the reporter-facing state.
 */
@Injectable()
export class ClosureReviewService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (loadConfig().OUTBOX_ENABLED)
      this.timer = setInterval(() => void this.tick(), TICK_INTERVAL_MS).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    const expired = await this.prisma.closureCycle.findMany({
      where: {
        reviewState: ClosureReviewState.PENDING,
        reviewDeadline: { lte: new Date() },
        reopenedAt: null,
        rating: null,
        voice: { status: 'CLOSED' },
      },
      select: { id: true, voiceId: true, cycleNumber: true, actorId: true, reviewDeadline: true },
      orderBy: { reviewDeadline: 'asc' },
      take: 50,
    });
    for (const cycle of expired) await this.autoAccept(cycle);
  }
  private async autoAccept(cycle: {
    id: string;
    voiceId: string;
    cycleNumber: number;
    actorId: string;
    reviewDeadline: Date | null;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const resolved = await tx.closureCycle.updateMany({
        where: {
          id: cycle.id,
          reviewState: ClosureReviewState.PENDING,
          reopenedAt: null,
          rating: null,
        },
        data: {
          reviewState: ClosureReviewState.ACCEPTED,
          reviewResolvedAt: cycle.reviewDeadline ?? new Date(),
        },
      });
      if (!resolved.count) return;
      const voice = await tx.voice.findUniqueOrThrow({
        where: { id: cycle.voiceId },
        select: { reporterId: true },
      });
      // The timeline has no system actor, so the event carries the closing
      // PIC's snapshot from the CLOSED event of this cycle and marks itself
      // system-generated in the payload; the UI renders it without an actor.
      const closedEvent = await tx.voiceEvent.findFirst({
        where: {
          voiceId: cycle.voiceId,
          type: VoiceEventType.CLOSED,
          payload: { path: ['closureId'], equals: cycle.id },
        },
        orderBy: { occurredAt: 'desc' },
        select: {
          actorId: true,
          actorAccountKind: true,
          actorStructuralPosition: true,
          actorCapabilities: true,
        },
      });
      const actor = closedEvent
        ? closedEvent
        : {
            actorId: cycle.actorId,
            actorAccountKind: (
              await tx.userAccount.findUniqueOrThrow({
                where: { id: cycle.actorId },
                select: { accountKind: true },
              })
            ).accountKind,
            actorStructuralPosition: null,
            actorCapabilities: [] as string[],
          };
      await tx.voiceEvent.create({
        data: {
          voiceId: cycle.voiceId,
          type: VoiceEventType.AUTO_ACCEPTED,
          actorId: actor.actorId,
          actorAccountKind: actor.actorAccountKind,
          actorStructuralPosition: actor.actorStructuralPosition,
          actorCapabilities: actor.actorCapabilities as Prisma.InputJsonValue,
          payload: { closureId: cycle.id, cycleNumber: cycle.cycleNumber, system: true },
        },
      });
      for (const recipientId of [...new Set([voice.reporterId, cycle.actorId])]) {
        const notification = await tx.notification.create({
          data: {
            recipientId,
            voiceId: cycle.voiceId,
            type: NotificationType.CLOSURE_AUTO_ACCEPTED,
            title: 'Voice diterima otomatis',
            body: 'Tidak ada penilaian dalam 2 hari; penyelesaian diterima otomatis.',
            deepLink: `/voices/${cycle.voiceId}`,
          },
        });
        await tx.outboxEvent.create({
          data: {
            topic: 'PUSH_NOTIFICATION',
            dedupeKey: `${NotificationType.CLOSURE_AUTO_ACCEPTED}:${cycle.voiceId}:${recipientId}:${notification.id}`,
            payload: { notificationId: notification.id },
          },
        });
      }
    });
  }
}
