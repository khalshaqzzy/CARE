import { getBrowserCapabilities } from './lib/browser-capabilities.js';

export type ServiceWorkerMode = 'registered' | 'core-online' | 'development';
export type ServiceWorkerResult = { mode: ServiceWorkerMode; reason?: string };

const CLEANUP_MARKER = 'care-pwa-legacy-cleanup-v1';
export const SERVICE_WORKER_FAILURE_MARKER = 'care-pwa-service-worker-failed';

function markServiceWorkerFailure(): void {
  try {
    window.sessionStorage.setItem(SERVICE_WORKER_FAILURE_MARKER, 'true');
  } catch {
    // The event still updates the active UI when sessionStorage is unavailable.
  }
  window.dispatchEvent(new Event('care-sw-degraded'));
}

async function cleanupLegacyCareWorker(): Promise<void> {
  try {
    if (window.localStorage.getItem(CLEANUP_MARKER) === 'done') return;
    window.localStorage.setItem(CLEANUP_MARKER, 'done');
    if (navigator.serviceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map(async (registration) => {
          const worker = registration.active ?? registration.waiting ?? registration.installing;
          if (worker && new URL(worker.scriptURL).pathname === '/sw.js')
            await registration.unregister();
        }),
      );
    }
    if (window.caches) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('care-') || name.startsWith('workbox-precache'))
          .map((name) => caches.delete(name)),
      );
    }
  } catch {
    // Compatibility cleanup is best-effort and must never block the online app.
  }
}

export async function registerCareServiceWorker(): Promise<ServiceWorkerResult> {
  if (import.meta.env.DEV) return { mode: 'development' };
  const capabilities = getBrowserCapabilities();
  if (!capabilities.serviceWorkerSupported) {
    void cleanupLegacyCareWorker();
    return { mode: 'core-online', reason: capabilities.reason };
  }
  try {
    const { Workbox } = await import('workbox-window');
    const workbox = new Workbox('/sw.js');
    workbox.addEventListener('waiting', () =>
      window.dispatchEvent(
        new CustomEvent('care-sw-update-ready', {
          detail: { apply: () => workbox.messageSkipWaiting() },
        }),
      ),
    );
    workbox.addEventListener('controlling', () => window.location.reload());
    await workbox.register();
    try {
      window.sessionStorage.removeItem(SERVICE_WORKER_FAILURE_MARKER);
    } catch {
      // Storage is optional for this non-blocking guidance marker.
    }
    window.dispatchEvent(new Event('care-sw-restored'));
    return { mode: 'registered' };
  } catch {
    markServiceWorkerFailure();
    return { mode: 'core-online', reason: 'service-worker-failed' };
  }
}
