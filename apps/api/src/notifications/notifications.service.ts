import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxStatus, Prisma, VoiceVisibility } from '@prisma/client';
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { z } from 'zod';
import type { AuthActor } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { badRequest, forbiddenAsNotFound } from '../common/errors';
import { parse } from '../common/validation';
import { loadConfig } from '../config';
import { PrismaService } from '../prisma.service';
import { isAllowedPushEndpoint } from './push-endpoint';

const subscriptionSchema = z.object({
  installationId: z.string().min(1).max(100),
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(10).max(500) }),
});

/**
 * A device that keeps rejecting delivery is retired instead of retried forever.
 * Permanent provider responses (404/410) retire it immediately; other repeated
 * failures accumulate to this bound so a stale Android/FCM token stops being
 * counted as an active device (and stops degrading readiness).
 */
const PUSH_FAILURE_LIMIT = 10;

export function pushFailureIsTransient(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status === 429 || status >= 500;
}

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
    const config = loadConfig();
    if (
      url.protocol !== 'https:' ||
      !isAllowedPushEndpoint(url.hostname, config.PUSH_ENDPOINT_HOSTS)
    )
      throw badRequest('PUSH_ENDPOINT_NOT_ALLOWED', 'Push endpoint host is not allowed');
    url.hash = '';
    const endpoint = url.toString();
    const endpointHash = createHash('sha256').update(endpoint).digest('hex');
    const environment = config.NODE_ENV;
    const item = await this.reconcileEndpointCollision(() =>
      this.prisma.$transaction(async (tx) => {
        const assign = {
          sessionId: actor.sessionId,
          endpoint,
          endpointHash,
          p256dh: data.keys.p256dh,
          auth: data.keys.auth,
          active: true,
          failureCount: 0,
        };
        // One browser profile owns one push endpoint. The endpoint can be
        // presented by another account on the same device (shared browser) or
        // by a reinstalled app whose installation id changed; move the row
        // instead of violating the unique (endpointHash, environment) key and
        // returning a 500 to the opt-in flow.
        const owner = await tx.pushSubscription.findUnique({
          where: { endpointHash_environment: { endpointHash, environment } },
          select: { id: true, accountId: true, installationId: true },
        });
        if (owner) {
          const sameOwner =
            owner.accountId === actor.accountId && owner.installationId === data.installationId;
          if (!sameOwner) {
            await tx.pushSubscription.deleteMany({
              where: {
                accountId: actor.accountId,
                installationId: data.installationId,
                environment,
                id: { not: owner.id },
              },
            });
            return tx.pushSubscription.update({
              where: { id: owner.id },
              data: {
                ...assign,
                accountId: actor.accountId,
                installationId: data.installationId,
              },
            });
          }
        }
        return tx.pushSubscription.upsert({
          where: {
            accountId_installationId_environment: {
              accountId: actor.accountId,
              installationId: data.installationId,
              environment,
            },
          },
          update: assign,
          create: {
            ...assign,
            accountId: actor.accountId,
            installationId: data.installationId,
            environment,
          },
        });
      }),
    );
    return { id: item.id, active: item.active };
  }

  /**
   * Retry once when a concurrent subscribe wins the race for the same endpoint.
   * The second attempt observes the winner's row and moves it, so the opt-in
   * flow never surfaces a unique-constraint failure.
   */
  private async reconcileEndpointCollision<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        return operation();
      throw error;
    }
  }

  async unsubscribe(actor: AuthActor, installationId: string) {
    await this.prisma.pushSubscription.updateMany({
      where: { accountId: actor.accountId, installationId, environment: loadConfig().NODE_ENV },
      data: { active: false },
    });
    return { success: true };
  }
  async status(actor: AuthActor) {
    const items = await this.prisma.pushSubscription.findMany({
      where: { accountId: actor.accountId, active: true },
      select: {
        id: true,
        installationId: true,
        environment: true,
        lastSuccessAt: true,
        endpointHash: true,
      },
    });
    return {
      configured: this.publicKey().configured,
      subscriptions: items.map(({ endpointHash, ...item }) => ({
        ...item,
        // Lets the client detect a rotated browser subscription without the
        // endpoint itself (which is a delivery capability) leaving the device.
        endpointHashPrefix: endpointHash.slice(0, 12),
      })),
    };
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
    const payload = JSON.stringify({
      title: privatePayload ? 'CARE' : notification.title,
      body: privatePayload ? 'Ada pembaruan Private Voice' : notification.body,
      deepLink: notification.deepLink,
    });
    let transientFailure = false;
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
        );
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastSuccessAt: new Date(), failureCount: 0 },
        });
      } catch (error: any) {
        const status: number | undefined = error?.statusCode;
        const permanent = status === 404 || status === 410;
        const failureCount = subscription.failureCount + 1;
        const exhausted = failureCount >= PUSH_FAILURE_LIMIT;
        await this.prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: {
            active: permanent || exhausted ? false : subscription.active,
            failureCount: { increment: 1 },
          },
        });
        // One failing device must not decide for the others: only a genuinely
        // transient provider/network problem schedules an outbox retry. The
        // client collapses duplicate banners for the same deep link, so the
        // at-least-once retry cannot spam a device that already accepted it.
        if (!permanent && !exhausted && pushFailureIsTransient(status)) transientFailure = true;
      }
    }
    if (transientFailure) throw new Error('PushDeliveryTransient');
  }
}
