import { expect, test } from '@playwright/test';
import { mockWorkforceApi } from './helpers/mock-api';

const VAPID_KEY =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

async function stubPushApi(page: import('@playwright/test').Page, permission = 'granted') {
  await page.context().addInitScript(
    ({ perm }) => {
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
        ).requestPermission = () =>
          Promise.resolve(
            (window as unknown as { __carePushPermission?: string }).__carePushPermission ??
              'granted',
          );
      }
      if (navigator.serviceWorker) {
        const fakeRegistration = {
          pushManager: {
            subscribe: async () => ({
              endpoint: 'https://fcm.googleapis.com/fcm/send/demo',
              toJSON: () => ({ keys: { p256dh: 'a'.repeat(22), auth: 'b'.repeat(11) } }),
            }),
            getSubscription: async () => null,
          },
        };
        Object.defineProperty(navigator.serviceWorker, 'ready', {
          configurable: true,
          get: () => Promise.resolve(fakeRegistration),
        });
      }
    },
    { perm: permission },
  );
}

test.describe('workforce Web Push opt-in', () => {
  // Pre-activating the production worker mirrors the deployed Home Screen
  // state and removes the first-registration `controlling` reload from the
  // middle of each journey, so the opt-in gesture cannot be aborted mid-flight.
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
    await page.goto('/notifications');
    await expect(page.getByText(/Aktifkan notifikasi push/)).toBeVisible();
    await page.getByText('Aktifkan notifikasi push').click();
    await expect.poll(() => posted.length).toBe(1);
    const body = posted[0] as { endpoint: string; keys: { p256dh: string; auth: string } };
    expect(body.endpoint).toContain('fcm.googleapis.com');
    expect(body.keys.p256dh.length).toBeGreaterThanOrEqual(20);
    expect(body.keys.auth.length).toBeGreaterThanOrEqual(10);
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
    await expect(page.getByText('Izin notifikasi ditolak')).toBeVisible();
    await expect(page.getByText('Aktifkan notifikasi push')).toHaveCount(0);
  });
});
