import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { mockWorkforceApi } from './helpers/mock-api';

const VAPID_KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

function vapidKeyBytes(): number[] {
  const normalized = VAPID_KEY.replace(/-/g, '+').replace(/_/g, '/');
  return Array.from(Buffer.from(normalized, 'base64'));
}

function endpointHashPrefix(endpoint: string): string {
  return createHash('sha256').update(endpoint).digest('hex').slice(0, 12);
}

type PushStubOptions = {
  /** Key the browser subscription is already bound to; omit for no subscription. */
  boundKey?: 'vapid' | 'rotated';
  existingEndpoint?: string;
  /** Endpoint returned by `subscribe()`; defaults to a fresh FCM endpoint. */
  subscribedEndpoint?: string;
  subscribeError?: { name: string; message: string };
  installationId?: string;
};

type PushStubState = { subscribeCount: number; unsubscribed: boolean; permissionCalls: number };

async function stubPushApi(
  page: import('@playwright/test').Page,
  permission = 'granted',
  options: PushStubOptions = {},
) {
  await page.context().addInitScript(
    ({ perm, stub }: { perm: string; stub: PushStubOptions & { keyBytes: number[] } }) => {
      const state: PushStubState = { subscribeCount: 0, unsubscribed: false, permissionCalls: 0 };
      (window as unknown as { __carePushStub?: PushStubState }).__carePushStub = state;
      if (stub.installationId) localStorage.setItem('care-push-installation', stub.installationId);
      (window as unknown as { __carePushPermission?: string }).__carePushPermission = perm;
      if ('Notification' in window) {
        Object.defineProperty(window.Notification, 'permission', {
          configurable: true,
          get: () =>
            (window as unknown as { __carePushPermission?: string }).__carePushPermission ??
            'granted',
        });
        (
          window.Notification as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission = () => {
          state.permissionCalls += 1;
          return Promise.resolve(
            (window as unknown as { __carePushPermission?: string }).__carePushPermission ??
              'granted',
          );
        };
      }
      if (navigator.serviceWorker) {
        const keys = { p256dh: 'a'.repeat(22), auth: 'b'.repeat(11) };
        const subscription = (endpoint: string, boundKey?: number[]) => ({
          endpoint,
          options: boundKey ? { applicationServerKey: new Uint8Array(boundKey).buffer } : undefined,
          toJSON: () => ({ keys }),
          unsubscribe: async () => {
            state.unsubscribed = true;
            return true;
          },
        });
        const subscriptionKey =
          stub.boundKey === 'rotated'
            ? [1, 2, 3]
            : stub.boundKey === 'vapid'
              ? stub.keyBytes
              : undefined;
        const fakeRegistration = {
          pushManager: {
            subscribe: async () => {
              state.subscribeCount += 1;
              if (stub.subscribeError)
                throw Object.assign(new Error(stub.subscribeError.message), {
                  name: stub.subscribeError.name,
                });
              return subscription(
                stub.subscribedEndpoint ?? 'https://fcm.googleapis.com/fcm/send/refreshed',
                stub.keyBytes,
              );
            },
            getSubscription: async () =>
              stub.existingEndpoint ? subscription(stub.existingEndpoint, subscriptionKey) : null,
          },
        };
        Object.defineProperty(navigator.serviceWorker, 'ready', {
          configurable: true,
          get: () => Promise.resolve(fakeRegistration),
        });
      }
    },
    { perm: permission, stub: { ...options, keyBytes: vapidKeyBytes() } },
  );
}

const stubCalls = (page: import('@playwright/test').Page): Promise<PushStubState> =>
  page.evaluate(
    () =>
      (window as unknown as { __carePushStub?: PushStubState }).__carePushStub ?? {
        subscribeCount: 0,
        unsubscribed: false,
        permissionCalls: 0,
      },
  );

async function captureSubscriptions(page: import('@playwright/test').Page, posted: unknown[]) {
  await page.context().route('**/api/v1/notifications/push/subscriptions', async (route) => {
    if (route.request().method() === 'POST') {
      posted.push(route.request().postDataJSON());
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'sub-1', active: true }),
      });
    }
    return route.continue();
  });
}

// Pre-activating the production worker mirrors the deployed Home Screen state
// and removes the first-registration `controlling` reload from the middle of
// each journey, so the opt-in gesture cannot be aborted mid-flight.
test.beforeEach(async ({ page }) => {
  await page.goto('/offline.html');
  await page.evaluate(() => navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration('/');
        return (
          registration?.active?.state ??
          registration?.installing?.state ??
          registration?.waiting?.state ??
          null
        );
      }),
    )
    .toBe('activated');
});

test('shows an unconfigured state when the server has no VAPID key', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, { push: { configured: false, publicKey: null } });
  await page.goto('/notifications');
  await expect(page.getByText('Notifikasi push belum dikonfigurasi')).toBeVisible();
});

test('subscribes with an explicit gesture and posts the push subscription', async ({ page }) => {
  await stubPushApi(page, 'granted');
  await page.setViewportSize({ width: 360, height: 800 });
  const posted: unknown[] = [];
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  // Register the capture route on the context after the broad mock so it wins
  // priority, and so it still intercepts requests re-issued by the active
  // service worker's NetworkOnly handler.
  await captureSubscriptions(page, posted);
  await page.goto('/notifications');
  await expect(page.getByText(/Aktifkan notifikasi push/)).toBeVisible();
  await page.getByText('Aktifkan notifikasi push').click();
  await expect.poll(() => posted.length).toBe(1);
  const body = posted[0] as { endpoint: string; keys: { p256dh: string; auth: string } };
  expect(body.endpoint).toContain('fcm.googleapis.com');
  expect(body.keys.p256dh.length).toBeGreaterThanOrEqual(20);
  expect(body.keys.auth.length).toBeGreaterThanOrEqual(10);
  // The permission prompt is raised from the tap itself, before any await that
  // could consume the gesture on Chrome/Android.
  expect((await stubCalls(page)).permissionCalls).toBe(1);
});

test('shows an active device list when a subscription already exists', async ({ page }) => {
  await stubPushApi(page, 'granted');
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: {
        configured: true,
        subscriptions: [
          {
            id: 'sub-1',
            installationId: 'inst-1',
            environment: 'test',
            lastSuccessAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      },
    },
  });
  await page.goto('/notifications');
  await expect(page.getByText('Notifikasi push aktif')).toBeVisible();
  await expect(page.getByText('inst-1')).toBeVisible();
  await expect(page.getByText('Terakhir terkirim')).toBeVisible();
});

test('shows denial guidance and no subscribe affordance when permission is denied', async ({
  page,
}) => {
  await stubPushApi(page, 'denied');
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  await page.goto('/notifications');
  await expect(page.getByText('Izin notifikasi diblokir')).toBeVisible();
  await expect(page.getByText('Aktifkan notifikasi push')).toHaveCount(0);
});

test('reports a suppressed or dismissed permission prompt as retryable', async ({ page }) => {
  await stubPushApi(page, 'default');
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  await page.goto('/notifications');
  await page.getByText('Aktifkan notifikasi push').click();
  // Chrome/Android resolves 'default' when the prompt is suppressed; the user
  // must not be told the permission was denied.
  await expect(page.getByText('Izin notifikasi belum diberikan')).toBeVisible();
  await expect(page.getByText('Izin notifikasi diblokir')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Coba lagi' })).toBeVisible();
});

test('explains a device push service failure instead of a generic error', async ({ page }) => {
  await stubPushApi(page, 'granted', {
    subscribeError: { name: 'AbortError', message: 'Registration failed - push service error' },
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  await page.goto('/notifications');
  await page.getByText('Aktifkan notifikasi push').click();
  await expect(page.getByText('Pendaftaran push gagal di perangkat ini')).toBeVisible();
});

test('explains a server-side enrollment failure', async ({ page }) => {
  await stubPushApi(page, 'granted');
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  await page.context().route('**/api/v1/notifications/push/subscriptions', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'An internal error occurred' }),
    });
  });
  await page.goto('/notifications');
  await page.getByText('Aktifkan notifikasi push').click();
  await expect(page.getByText('Server gagal menyimpan langganan')).toBeVisible();
});

test('reuses an existing browser subscription bound to the current key', async ({ page }) => {
  await stubPushApi(page, 'granted', {
    boundKey: 'vapid',
    existingEndpoint: 'https://fcm.googleapis.com/fcm/send/already-subscribed',
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const posted: unknown[] = [];
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  await captureSubscriptions(page, posted);
  await page.goto('/notifications');
  await page.getByText('Aktifkan notifikasi push').click();
  await expect.poll(() => posted.length).toBe(1);
  expect((posted[0] as { endpoint: string }).endpoint).toContain('already-subscribed');
  // Resubscribing an already-subscribed worker is what Chrome/Android rejects
  // with InvalidStateError, so the existing subscription must be reused.
  expect(await stubCalls(page)).toMatchObject({ subscribeCount: 0, unsubscribed: false });
});

test('replaces a subscription bound to a rotated VAPID key', async ({ page }) => {
  await stubPushApi(page, 'granted', {
    boundKey: 'rotated',
    existingEndpoint: 'https://fcm.googleapis.com/fcm/send/stale-key',
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const posted: unknown[] = [];
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: { configured: true, subscriptions: [] },
    },
  });
  await captureSubscriptions(page, posted);
  await page.goto('/notifications');
  await page.getByText('Aktifkan notifikasi push').click();
  await expect.poll(() => posted.length).toBe(1);
  expect((posted[0] as { endpoint: string }).endpoint).toContain('refreshed');
  expect(await stubCalls(page)).toMatchObject({ subscribeCount: 1, unsubscribed: true });
});

test('re-registers a rotated browser endpoint without user action', async ({ page }) => {
  const rotated = 'https://fcm.googleapis.com/fcm/send/rotated-by-fcm';
  await stubPushApi(page, 'granted', {
    installationId: 'inst-android',
    existingEndpoint: rotated,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  const posted: unknown[] = [];
  await mockWorkforceApi(page, {
    push: {
      configured: true,
      publicKey: VAPID_KEY,
      status: {
        configured: true,
        subscriptions: [
          {
            id: 'sub-1',
            installationId: 'inst-android',
            environment: 'test',
            endpointHashPrefix: endpointHashPrefix('https://fcm.googleapis.com/fcm/send/old-token'),
          },
        ],
      },
    },
  });
  await captureSubscriptions(page, posted);
  await page.goto('/notifications');
  await expect.poll(() => posted.length).toBe(1);
  const body = posted[0] as { installationId: string; endpoint: string };
  expect(body.endpoint).toBe(rotated);
  expect(body.installationId).toBe('inst-android');
});

test('opens the notified Voice when the notification is tapped', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockWorkforceApi(page, {});
  await page.goto('/notifications');
  // Wait until the app is mounted before simulating the message the service
  // worker posts when an existing window is focused by a notification tap.
  await expect(page.getByText('Notifikasi push', { exact: true })).toBeVisible();
  await page.evaluate(() =>
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'NOTIFICATION_NAVIGATE', url: '/voices/voice-1' },
      }),
    ),
  );
  await expect(page).toHaveURL(/\/voices\/voice-1$/);
  // The Voice detail surface replaced the notification center.
  await expect(page.getByRole('button', { name: 'Kembali' })).toBeVisible();
  await expect(page.getByText('Notifikasi push', { exact: true })).toHaveCount(0);
});
