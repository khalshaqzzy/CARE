import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.fn();
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => sendNotification(...args),
  },
}));

import type { VoiceVisibility } from '@prisma/client';
import { resetConfigForTests } from '../../src/config';
import {
  NotificationsService,
  pushFailureIsTransient,
} from '../../src/notifications/notifications.service';
import { isAllowedPushEndpoint } from '../../src/notifications/push-endpoint';

type SubscriptionRow = {
  id: string;
  accountId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  active: boolean;
  failureCount: number;
};

function serviceWithSubscriptions(rows: SubscriptionRow[]) {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const prisma = {
    pushSubscription: {
      findMany: async () => rows,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push(args);
        return args;
      },
    },
  };
  const service = new NotificationsService(prisma as never);
  const deliver = (notification: {
    recipientId: string;
    title: string;
    body: string;
    deepLink: string | null;
    voice: { visibility: VoiceVisibility } | null;
  }) =>
    (service as unknown as { push: (value: typeof notification) => Promise<void> }).push(
      notification,
    );
  return { service, updates, deliver };
}

const notification = {
  recipientId: 'account-1',
  title: 'Voice diperbarui',
  body: 'Status berubah',
  deepLink: '/voices/1',
  voice: null,
};

function configure() {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    VAPID_SUBJECT: 'mailto:operator@example.invalid',
    VAPID_PUBLIC_KEY: 'a'.repeat(24),
    VAPID_PRIVATE_KEY: 'b'.repeat(24),
    PUSH_ENDPOINT_HOSTS: 'fcm.googleapis.com,*.notify.windows.com',
  });
  resetConfigForTests();
}

describe('push endpoint allowlist', () => {
  it('accepts exact hosts and wildcard suffixes only within the suffix', () => {
    const allowed = ['fcm.googleapis.com', '*.notify.windows.com'];
    expect(isAllowedPushEndpoint('fcm.googleapis.com', allowed)).toBe(true);
    expect(isAllowedPushEndpoint('FCM.GoogleAPIs.com', allowed)).toBe(true);
    expect(isAllowedPushEndpoint('wns2-par02p.notify.windows.com', allowed)).toBe(true);
    expect(isAllowedPushEndpoint('notify.windows.com', allowed)).toBe(false);
    expect(isAllowedPushEndpoint('evil-notify.windows.com.attacker.example', allowed)).toBe(false);
    expect(isAllowedPushEndpoint('fcm.googleapis.com.attacker.example', allowed)).toBe(false);
    expect(isAllowedPushEndpoint('', allowed)).toBe(false);
    expect(isAllowedPushEndpoint('fcm.googleapis.com', [])).toBe(false);
  });
});

describe('push delivery failure classification', () => {
  it('retries only transient provider problems', () => {
    expect(pushFailureIsTransient(undefined)).toBe(true);
    expect(pushFailureIsTransient(429)).toBe(true);
    expect(pushFailureIsTransient(500)).toBe(true);
    expect(pushFailureIsTransient(503)).toBe(true);
    expect(pushFailureIsTransient(400)).toBe(false);
    expect(pushFailureIsTransient(401)).toBe(false);
    expect(pushFailureIsTransient(403)).toBe(false);
    expect(pushFailureIsTransient(404)).toBe(false);
    expect(pushFailureIsTransient(410)).toBe(false);
  });
});

describe('push delivery per device', () => {
  beforeEach(() => {
    configure();
    sendNotification.mockReset();
  });

  const row = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
    id: 'sub-1',
    accountId: 'account-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/one',
    p256dh: 'p'.repeat(22),
    auth: 'a'.repeat(11),
    active: true,
    failureCount: 0,
    ...overrides,
  });

  it('sends the redacted payload and records the success', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { updates, deliver } = serviceWithSubscriptions([row()]);
    await expect(deliver(notification)).resolves.toBeUndefined();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string)).toEqual({
      title: 'Voice diperbarui',
      body: 'Status berubah',
      deepLink: '/voices/1',
    });
    expect(updates[0]?.data).toMatchObject({ failureCount: 0 });
  });

  it('redacts Private Voice copy in the payload', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const { deliver } = serviceWithSubscriptions([row()]);
    await deliver({ ...notification, voice: { visibility: 'PRIVATE' as VoiceVisibility } });
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.title).toBe('CARE');
    expect(payload.body).toBe('Ada pembaruan Private Voice');
  });

  it('retires a device the provider reports as gone', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }));
    const { updates, deliver } = serviceWithSubscriptions([row()]);
    await expect(deliver(notification)).resolves.toBeUndefined();
    expect(updates[0]?.data).toMatchObject({ active: false });
  });

  it('does not let one device failure fail delivery for the others', async () => {
    sendNotification
      .mockRejectedValueOnce(Object.assign(new Error('bad request'), { statusCode: 400 }))
      .mockResolvedValueOnce({ statusCode: 201 });
    const { updates, deliver } = serviceWithSubscriptions([
      row(),
      row({ id: 'sub-2', endpoint: 'https://fcm.googleapis.com/fcm/send/two' }),
    ]);
    await expect(deliver(notification)).resolves.toBeUndefined();
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(updates[0]?.data).toMatchObject({ failureCount: { increment: 1 } });
    expect(updates[1]?.data).toMatchObject({ failureCount: 0 });
  });

  it('retires a device that keeps failing across deliveries', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('nope'), { statusCode: 401 }));
    const { updates, deliver } = serviceWithSubscriptions([row({ failureCount: 9 })]);
    await expect(deliver(notification)).resolves.toBeUndefined();
    expect(updates[0]?.data).toMatchObject({ active: false, failureCount: { increment: 1 } });
  });

  it('asks the outbox to retry after a transient provider failure', async () => {
    sendNotification.mockRejectedValue(
      Object.assign(new Error('unavailable'), { statusCode: 503 }),
    );
    const { deliver } = serviceWithSubscriptions([row()]);
    await expect(deliver(notification)).rejects.toThrow('PushDeliveryTransient');
  });

  it('keeps a device active after a single non-transient rejection', async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error('forbidden'), { statusCode: 403 }));
    const { updates, deliver } = serviceWithSubscriptions([row()]);
    await expect(deliver(notification)).resolves.toBeUndefined();
    expect(updates[0]?.data).toMatchObject({ active: true, failureCount: { increment: 1 } });
  });

  it('skips delivery when VAPID is not configured', async () => {
    process.env.VAPID_PUBLIC_KEY = '';
    process.env.VAPID_PRIVATE_KEY = '';
    resetConfigForTests();
    const { deliver } = serviceWithSubscriptions([row()]);
    await expect(deliver(notification)).resolves.toBeUndefined();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
