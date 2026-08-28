/**
 * Pure Web Push helpers for the CARE workforce PWA.
 *
 * These helpers wrap browser Web Push primitives so the subscription flow can
 * be unit-tested without a real push service, and so the same logic is shared
 * between the opt-in card and any future notification entry point.
 *
 * Privacy contract: only the subscription `endpoint` + `keys` are sent to the
 * backend. Never derive or render a push payload locally that could carry a
 * Private Voice title, detail, or reporter identity.
 */

const INSTALLATION_KEY = 'care-push-installation';
const MAX_INSTALLATION_ID_LENGTH = 100;

export type PushSubscriptionKeys = { p256dh: string; auth: string };
export type PushSubscriptionState = {
  /** Stable per-device identifier used by the backend to de-duplicate. */
  installationId: string;
  /** Web Push subscription endpoint (https). */
  endpoint: string;
  keys: PushSubscriptionKeys;
};

/**
 * Decode a base64url-encoded VAPID public key into the `Uint8Array` form the
 * browser requires for `PushManager.subscribe({ applicationServerKey })`.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(normalized);
  const result = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    result[index] = decoded.charCodeAt(index);
  }
  return result;
}

/** True when the browser can actually subscribe to Web Push. */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(window.Notification)
  );
}

/** True when the PWA is running from the home screen (required for iOS push). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** True on iOS/iPadOS Safari (where Web Push requires install to the home screen). */
export function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(window.navigator?.userAgent ?? '');
}

/**
 * Return a stable installation id for this device. The backend keys a
 * subscription by `accountId + installationId + environment`, so reusing the
 * same id across installs of the same device is intentional (it lets multiple
 * accounts on one device each subscribe without colliding).
 */
export function getInstallationId(): string {
  if (typeof window === 'undefined') return 'server-side';
  const existing = window.localStorage.getItem(INSTALLATION_KEY);
  if (existing && existing.length <= MAX_INSTALLATION_ID_LENGTH) return existing;
  const next =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `care-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  window.localStorage.setItem(INSTALLATION_KEY, next);
  return next;
}

/** Prepare a subscription payload ready to POST to the backend. */
export function subscriptionPayload(
  endpoint: string,
  keys: PushSubscriptionKeys,
): { installationId: string; endpoint: string; keys: PushSubscriptionKeys } {
  return { installationId: getInstallationId(), endpoint, keys };
}

/** Best-effort read of the browser permission for the current environment. */
export function permissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return window.Notification?.permission ?? 'unsupported';
}
