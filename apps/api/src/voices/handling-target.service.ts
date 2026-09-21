import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { loadConfig } from '../config';
import { formatHandlingDueAt } from './handling-target';

/** At-least-once polling with one transactional notification set per target. */
@Injectable()
export class HandlingTargetService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new Logger(HandlingTargetService.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  onModuleInit() {
    if (loadConfig().OUTBOX_ENABLED)
      this.timer = setInterval(() => {
        void this.tick().catch(() => this.logger.error('Handling target notification tick failed'));
      }, 30_000).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const targets = await this.prisma.$queryRaw<Array<{ id: string; voiceId: string }>>`
        SELECT t.id, t."voiceId" FROM "VoiceHandlingTarget" t JOIN "Voice" v ON v.id = t."voiceId"
        WHERE t."overdueNotifiedAt" IS NULL AND t."dueAt" < now()
          AND v.status = 'IN_PROGRESS' AND v."handlingCycleNumber" = t."cycleNumber"
        ORDER BY t."dueAt" ASC LIMIT 100`;
      for (const candidate of targets)
        await this.prisma.$transaction(async (tx) => {
          // Same lock order as close/reopen/target mutations.
          await tx.$queryRaw`SELECT "id" FROM "Voice" WHERE "id" = ${candidate.voiceId}::uuid FOR UPDATE`;
          const voice = await tx.voice.findUniqueOrThrow({ where: { id: candidate.voiceId } });
          const target = await tx.voiceHandlingTarget.findUniqueOrThrow({
            where: { id: candidate.id },
          });
          if (
            voice.status !== 'IN_PROGRESS' ||
            target.cycleNumber !== voice.handlingCycleNumber ||
            target.overdueNotifiedAt ||
            target.dueAt >= new Date()
          )
            return;
          const now = new Date();
          await tx.voiceHandlingTarget.update({
            where: { id: target.id },
            data: { overdueNotifiedAt: now },
          });
          for (const recipientId of new Set([voice.reporterId, voice.routeOwnerId])) {
            const notification = await tx.notification.create({
              data: {
                recipientId,
                voiceId: voice.id,
                type: 'TARGET_OVERDUE',
                title: 'Target penyelesaian terlewati',
                body: `Target ${formatHandlingDueAt(target.dueAt)} telah terlewati. Penanganan dan percakapan tetap berjalan.`,
                deepLink: `/voices/${voice.id}`,
              },
            });
            await tx.outboxEvent.create({
              data: {
                topic: 'PUSH_NOTIFICATION',
                dedupeKey: `TARGET_OVERDUE:${target.id}:${recipientId}`,
                payload: { notificationId: notification.id },
              },
            });
          }
        });
    } finally {
      this.running = false;
    }
  }
}
