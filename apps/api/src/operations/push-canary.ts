import { PrismaClient } from '@prisma/client';
import webpush from 'web-push';
import { loadConfig } from '../config';

export async function deliverPushCanary(prisma = new PrismaClient()): Promise<void> {
  const config = loadConfig();
  const endpointHash = config.PUSH_CANARY_ENDPOINT_HASH;
  if (!endpointHash) throw new Error('Push canary endpoint hash is not configured');
  if (!config.VAPID_SUBJECT || !config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY)
    throw new Error('Web Push is not fully configured');

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { endpointHash, environment: config.NODE_ENV, active: true },
      take: 2,
    });
    if (subscriptions.length !== 1) throw new Error('Expected exactly one active push canary');
    const subscription = subscriptions[0]!;
    const startedAt = new Date();
    webpush.setVapidDetails(
      config.VAPID_SUBJECT,
      config.VAPID_PUBLIC_KEY,
      config.VAPID_PRIVATE_KEY,
    );
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify({ title: 'CARE', body: 'Staging deployment check', deepLink: '/' }),
      );
    } catch (error: any) {
      if ([404, 410].includes(error?.statusCode))
        await prisma.pushSubscription.update({
          where: { id: subscription.id },
          data: { active: false, failureCount: { increment: 1 } },
        });
      throw new Error('Push provider rejected the canary delivery');
    }
    const updated = await prisma.pushSubscription.update({
      where: { id: subscription.id },
      data: { lastSuccessAt: new Date(), failureCount: 0 },
    });
    if (!updated.lastSuccessAt || updated.lastSuccessAt < startedAt)
      throw new Error('Push canary success timestamp was not advanced');
    process.stdout.write('Real Web Push canary was accepted by the push provider\n');
  } finally {
    await prisma.$disconnect();
  }
}
