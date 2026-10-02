import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MessageKind, NotificationType, Prisma, VoiceEventType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { loadConfig } from '../config';
import { formatHandlingDueAt, handlingReminderAt } from './handling-target';
import { activeSubstitutes } from '../away/away';

type Tx = Prisma.TransactionClient;
type CurrentVoice = {
  id: string;
  reporterId: string;
  routeOwnerId: string;
  currentHandlerId: string | null;
};

/**
 * At-least-once polling for handling targets: one reminder to the PIC at
 * 08:00 WIB on the target day, then one overdue notice to the PIC, the levels
 * above them and the reporter, with a system note in the chat. Each step is
 * guarded by its own timestamp inside the Voice row lock.
 */
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
      await this.sendReminders();
      await this.sendOverdueNotices();
    } finally {
      this.running = false;
    }
  }

  private async sendReminders() {
    // dueAt is 23:59:59.999 WIB on the target day, so 08:00 that day is 16h earlier + 1ms.
    const targets = await this.prisma.$queryRaw<Array<{ id: string; voiceId: string }>>`
      SELECT t.id, t."voiceId" FROM "VoiceHandlingTarget" t JOIN "Voice" v ON v.id = t."voiceId"
      WHERE t."reminderSentAt" IS NULL AND t."overdueNotifiedAt" IS NULL AND t.days > 0
        AND t."dueAt" - interval '16 hours' + interval '1 millisecond' <= now()
        AND t."dueAt" >= now()
        AND v.status = 'IN_PROGRESS' AND v."handlingCycleNumber" = t."cycleNumber"
      ORDER BY t."dueAt" ASC LIMIT 100`;
    for (const candidate of targets)
      await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockCurrentTarget(tx, candidate);
        if (!locked) return;
        const { voice, target } = locked;
        const now = new Date();
        if (target.reminderSentAt || target.days === 0 || now < handlingReminderAt(target.dueAt))
          return;
        await tx.voiceHandlingTarget.update({
          where: { id: target.id },
          data: { reminderSentAt: now },
        });
        await this.notify(
          tx,
          voice.currentHandlerId ?? voice.routeOwnerId,
          voice.id,
          NotificationType.TARGET_REMINDER,
          'Target penyelesaian hari ini',
          `Batas ${formatHandlingDueAt(target.dueAt)}.`,
          `TARGET_REMINDER:${target.id}`,
        );
      });
  }

  private async sendOverdueNotices() {
    const targets = await this.prisma.$queryRaw<Array<{ id: string; voiceId: string }>>`
      SELECT t.id, t."voiceId" FROM "VoiceHandlingTarget" t JOIN "Voice" v ON v.id = t."voiceId"
      WHERE t."overdueNotifiedAt" IS NULL AND t."dueAt" < now()
        AND v.status = 'IN_PROGRESS' AND v."handlingCycleNumber" = t."cycleNumber"
      ORDER BY t."dueAt" ASC LIMIT 100`;
    for (const candidate of targets)
      await this.prisma.$transaction(async (tx) => {
        const locked = await this.lockCurrentTarget(tx, candidate);
        if (!locked) return;
        const { voice, target } = locked;
        if (target.overdueNotifiedAt || target.dueAt >= new Date()) return;
        const now = new Date();
        await tx.voiceHandlingTarget.update({
          where: { id: target.id },
          data: { overdueNotifiedAt: now },
        });
        // The timeline and chat have no system account, so the PIC who set
        // the target carries the note, marked system-generated.
        const carrier = await tx.userAccount.findUniqueOrThrow({
          where: { id: target.setById },
          select: { id: true, accountKind: true, displayName: true },
        });
        await tx.voiceEvent.create({
          data: {
            voiceId: voice.id,
            type: VoiceEventType.TARGET_OVERDUE,
            actorId: carrier.id,
            actorAccountKind: carrier.accountKind,
            actorStructuralPosition: null,
            actorCapabilities: [],
            payload: { targetId: target.id, dueAt: target.dueAt.toISOString(), system: true },
          },
        });
        const conversation = await tx.conversation.findUnique({ where: { voiceId: voice.id } });
        if (conversation)
          await tx.message.create({
            data: {
              conversationId: conversation.id,
              senderId: carrier.id,
              senderAccountKind: carrier.accountKind,
              senderCapabilities: [],
              senderNameSnapshot: carrier.displayName,
              text: 'Target penyelesaian terlewati',
              kind: MessageKind.SYSTEM,
            },
          });
        const recipients = new Set(
          [voice.currentHandlerId, ...(await this.levelsAbove(tx, voice)), voice.reporterId].filter(
            (id): id is string => Boolean(id),
          ),
        );
        for (const recipientId of recipients)
          await this.notify(
            tx,
            recipientId,
            voice.id,
            NotificationType.TARGET_OVERDUE,
            'Target penyelesaian terlewati',
            `Target ${formatHandlingDueAt(target.dueAt)} telah terlewati. Penanganan dan percakapan tetap berjalan.`,
            `TARGET_OVERDUE:${target.id}:${recipientId}`,
          );
      });
  }

  /**
   * Everyone between the PIC and the Manager who owns the route. Until tiered
   * chains land, that is the route-owning Manager.
   */
  private async levelsAbove(_tx: Tx, voice: CurrentVoice) {
    return voice.routeOwnerId !== voice.currentHandlerId ? [voice.routeOwnerId] : [];
  }

  /** Same lock order as close/reopen/target mutations; returns null when stale. */
  private async lockCurrentTarget(tx: Tx, candidate: { id: string; voiceId: string }) {
    await tx.$queryRaw`SELECT "id" FROM "Voice" WHERE "id" = ${candidate.voiceId}::uuid FOR UPDATE`;
    const voice = await tx.voice.findUniqueOrThrow({ where: { id: candidate.voiceId } });
    const target = await tx.voiceHandlingTarget.findUniqueOrThrow({ where: { id: candidate.id } });
    if (voice.status !== 'IN_PROGRESS' || target.cycleNumber !== voice.handlingCycleNumber)
      return null;
    return { voice, target };
  }

  private async notify(
    tx: Tx,
    recipientId: string,
    voiceId: string,
    type: NotificationType,
    title: string,
    body: string,
    dedupeKey: string,
  ) {
    // An away recipient's substitute gets the same notice.
    const substitute = (await activeSubstitutes(tx, [recipientId])).get(recipientId);
    for (const target of substitute ? [recipientId, substitute] : [recipientId]) {
      const notification = await tx.notification.create({
        data: { recipientId: target, voiceId, type, title, body, deepLink: `/voices/${voiceId}` },
      });
      await tx.outboxEvent.create({
        data: {
          topic: 'PUSH_NOTIFICATION',
          dedupeKey: target === recipientId ? dedupeKey : `${dedupeKey}:substitute`,
          payload: { notificationId: notification.id },
        },
      });
    }
  }
}
