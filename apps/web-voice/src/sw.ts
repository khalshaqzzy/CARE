/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<never> };

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Non-sensitive own-summary cache for the workforce member dashboard. Only the
// aggregate counts + generatedAt are cached; `recent` and `draft` are stripped
// so Private Voice titles/content never land in offline storage. Everything
// else stays network-only. This route must be registered before the generic
// `/api/` NetworkOnly catch-all below so it is matched first.
const DASHBOARD_CACHE = 'care-user-dashboard';
registerRoute(
  ({ url }) => url.pathname === '/api/v1/dashboard/member',
  async ({ request }) => {
    const cache = await caches.open(DASHBOARD_CACHE);
    try {
      const response = await fetch(request.clone());
      if (response.ok) await cacheDashboardAggregate(cache, request, response);
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      return Response.error();
    }
  },
);

registerRoute(({ url }) => url.pathname.startsWith('/api/'), new NetworkOnly());
registerRoute(
  ({ url }) => /\/(?:media|voices|drafts|notifications)(?:\/|$)/.test(url.pathname),
  new NetworkOnly(),
);
registerRoute(({ request }) => request.mode === 'navigate', new NetworkOnly());

async function cacheDashboardAggregate(cache: Cache, request: Request, response: Response) {
  const payload = (await response.clone().json()) as {
    total?: number;
    counts?: Record<string, number>;
    generatedAt?: string;
  };
  const aggregate = {
    total: payload.total ?? 0,
    counts: payload.counts ?? {},
    recent: [],
    draft: null,
    generatedAt: payload.generatedAt ?? null,
  };
  await cache.put(
    request,
    new Response(JSON.stringify(aggregate), {
      headers: { 'content-type': 'application/json' },
    }),
  );
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting();
  if (event.data?.type === 'CLEAR_USER_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => name.startsWith('care-user-'))
              .map((name) => caches.delete(name)),
          ),
        ),
    );
  }
});

self.addEventListener('push', (event) => {
  const payload = event.data?.json() as { title?: string; body?: string; url?: string } | undefined;
  event.waitUntil(
    self.registration.showNotification(payload?.title ?? 'Pembaruan CARE', {
      body: payload?.body ?? 'Buka CARE untuk melihat pembaruan terbaru.',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload?.url ?? '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(String(event.notification.data?.url ?? '/'), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const target = clients.find((client) => client.url.startsWith(self.location.origin));
      if (target) {
        await target.focus();
        target.postMessage({ type: 'NOTIFICATION_NAVIGATE', url });
        return;
      }
      await self.clients.openWindow(url);
    }),
  );
});

setCatchHandler(async ({ request }) => {
  if (request.destination === 'document')
    return (await matchPrecache('/offline.html')) ?? Response.error();
  return Response.error();
});
