import { Workbox } from 'workbox-window';

export function registerCareServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const workbox = new Workbox('/sw.js');
  workbox.addEventListener('waiting', () =>
    window.dispatchEvent(
      new CustomEvent('care-sw-update-ready', {
        detail: { apply: () => workbox.messageSkipWaiting() },
      }),
    ),
  );
  workbox.addEventListener('controlling', () => window.location.reload());
  void workbox.register();
}
