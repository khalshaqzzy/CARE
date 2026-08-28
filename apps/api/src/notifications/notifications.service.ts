import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus, VoiceVisibility } from '@prisma/client';
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import { parse } from '../common/validation';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';

const subscriptionSchema = z.object({
  installationId: z.string().min(1).max(100),
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(10).max(500) }),
});

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  onModuleInit() {
    const config = loadConfig();
    if (config.OUTBOX_ENABLED) this.timer = setInterval(() => void this.drain(), 2_000).unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async list(actor: AuthActor, cursor?: string, limit = 30) {
    const take = Math.min(Math.max(limit, 1), 100);
    const cursorId = cursor ? decodeCursor(cursor) : undefined;
    const items = await this.prisma.notification.findMany({
      where: { recipientId: actor.accountId },
      take: take + 1,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      items: items.slice(0, take),
      nextCursor: items.length > take && items[take - 1] ? encodeCursor(items[take - 1].id) : null,
    };
  }
  async unread(actor: AuthActor) {
    return {
      count: await this.prisma.notification.count({
        where: { recipientId: actor.accountId, readAt: null },
      }),
    };
  }
  async read(actor: AuthActor, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId: actor.accountId },
      data: { readAt: new Date() },
    });
    if (!result.count) throw forbiddenAsNotFound();
    return { success: true };
  }
  async readAll(actor: AuthActor) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: actor.accountId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
  publicKey() {
    return {
      publicKey: loadConfig().VAPID_PUBLIC_KEY || null,
      configured: Boolean(loadConfig().VAPID_PUBLIC_KEY && loadConfig().VAPID_PRIVATE_KEY),
    };
  }
  async subscribe(actor: AuthActor, input: unknown) {
    const data = parse(subscriptionSchema, input);
    const url = new URL(data.endpoint);
    if (url.protocol !== 'https:' || !loadConfig().PUSH_ENDPOINT_HOSTS.includes(url.hostname))
      throw badRequest('PUSH_ENDPOINT_NOT_ALLOWED', 'Push endpoint host is not allowed');
    url.hash = '';
    const endpoint = url.toString();
    const endpointHash = createHash('sha256').update(endpoint).digest('hex');
    const item = await this.prisma.pushSubscription.upsert({
      where: {
        accountId_installationId_environment: {
          accountId: actor.accountId,
          installationId: data.installationId,
          environment: loadConfig().NODE_ENV,
        },
      },
      update: {
        sessionId: actor.sessionId,
        endpoint,
        endpointHash,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        active: true,
        failureCount: 0,
      },
      create: {
        accountId: actor.accountId,
        sessionId: actor.sessionId,
        installationId: data.installationId,
        endpoint,
        endpointHash,
        p256dh: data.keys.p256dh,
        auth: data.keys.auth,
        environment: loadConfig().NODE_ENV,
      },
    });
    return { id: item.id, active: item.active };
  }
  async unsubscribe(actor: AuthActor, installationId: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { accountId: actor.accountId, installationId },
      data: { active: false },
    });
    return { success: true };
  }
  async status(actor: AuthActor) {
    const items = await this.prisma.pushSubscription.findMany({
      where: { accountId: actor.accountId, active: true },
      select: { id: true, installationId: true, environment: true, lastSuccessAt: true },
    });
    return { configured: this.publicKey().configured, subscriptions: items };
  }
  private async drain() {
    const rows = await this.prisma.$transaction(async (tx) => {
      const found = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM "OutboxEvent" WHERE status = 'PENDING' AND "availableAt" <= now() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 20`;
      if (found.length)
        await tx.outboxEvent.updateMany({
          where: { id: { in: found.map((r) => r.id) } },
          data: {
            status: OutboxStatus.PROCESSING,
            lockedAt: new Date(),
            attempts: { increment: 1 },
          },
        });
      return found;
    });
    for (const row of rows) await this.deliver(row.id);
  }
  private async deliver(id: string) {
    const event = await this.prisma.outboxEvent.findUnique({ where: { id } });
    if (!event) return;
    try {
      if (event.topic === 'PUSH_NOTIFICATION') {
        const notificationId = (event.payload as { notificationId: string }).notificationId;
        const notification = await this.prisma.notification.findUnique({
          where: { id: notificationId },
          include: { voice: true },
        });
        if (notification) await this.push(notification);
      }
      await this.prisma.outboxEvent.update({
        where: { id },
        data: { status: OutboxStatus.DELIVERED, deliveredAt: new Date(), lastError: null },
      });
    } catch (error) {
      const current = await this.prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
      const dead = current.attempts >= 5;
      await this.prisma.outboxEvent.update({
        where: { id },
        data: {
          status: dead ? OutboxStatus.DEAD_LETTER : OutboxStatus.PENDING,
          availableAt: new Date(Date.now() + Math.min(60_000, 2 ** current.attempts * 1_000)),
          lastError: error instanceof Error ? error.name.slice(0, 200) : 'DeliveryError',
        },
      });
    }
  }
  private async push(notification: {
    recipientId: string;
    title: string;
    body: string;
    deepLink: string | null;
    voice: { visibility: VoiceVisibility } | null;
  }) {
    const config = loadConfig();
    if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY || !config.VAPID_SUBJECT) return;
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY,
    );
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { accountId: notification.recipientId, active: true, environment: config.NODE_ENV },
    });
    const privatePayload = notification.voice?.visibility === VoiceVisibility.PRIVATE;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: privatePayload ? 'CARE' : notification.title,
            body: privatePayload ? 'Ada pembaruan Private Voice' : notification.body,
            deepLink: notification.deepLink,
          }),
        );
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        });
      } catch (error: any) {
        const permanent = [404, 410].includes(error?.statusCode);
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { active: permanent ? false : subscription.active, failureCount: { increment: 1 } },
        });
        if (!permanent) throw error;
      }
    }
  }
}
