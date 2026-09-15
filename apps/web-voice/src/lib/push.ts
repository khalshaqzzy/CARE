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

import { getBrowserCapabilities } from './browser-capabilities.js';

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
  return getBrowserCapabilities().pushSupported;
}

/** True when the PWA is running from the home screen (required for iOS push). */
export function isStandalone(): boolean {
  return getBrowserCapabilities().standalone;
}

/** True on iOS/iPadOS Safari (where Web Push requires install to the home screen). */
export function isIos(): boolean {
  return getBrowserCapabilities().ios;
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
  keys: BrowserPushKeys,
): { installationId: string; endpoint: string; keys: BrowserPushKeys } {
  return { installationId: getInstallationId(), endpoint, keys };
}

/** Prepare a payload from an existing browser subscription, without resubscribing. */
export function browserSubscriptionPayload(subscription: BrowserPushSubscription): {
  installationId: string;
  endpoint: string;
  keys: BrowserPushKeys;
} {
  return subscriptionPayload(subscription.endpoint, readKeys(subscription));
}

/** Best-effort read of the browser permission for the current environment. */
export function permissionState(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return window.Notification?.permission ?? 'unsupported';
}

export type PushPlatform = 'ios' | 'android' | 'other';

/**
 * Coarse platform hint for setup guidance copy. Android is detected from the
 * user agent because the opt-in path differs (Chrome/Android needs the prompt
 * inside the tap's activation, and its notification permission also lives in
 * Android system settings for the browser app itself).
 */
export function pushPlatform(): PushPlatform {
  if (typeof navigator === 'undefined') return 'other';
  if (isIos()) return 'ios';
  return /android/i.test(navigator.userAgent ?? '') ? 'android' : 'other';
}

/** Host of the browser's push service endpoint, e.g. `fcm.googleapis.com`. */
export function pushProviderHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).hostname || null;
  } catch {
    return null;
  }
}

/**
 * First 12 hex characters of the SHA-256 of an endpoint URL, matching the
 * server's `endpointHashPrefix`. Used to detect a silently rotated browser
 * subscription without exposing the endpoint itself. `null` when the platform
 * cannot hash (no WebCrypto).
 */
export async function endpointHashPrefix(endpoint: string): Promise<string | null> {
  // `globalThis` itself may be absent on pre-12.1 WebKit, so probe it safely.
  const subtle = typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : undefined;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12);
  } catch {
    return null;
  }
}

/** Minimal structural view of a browser push subscription used by the opt-in. */
export type BrowserPushSubscription = {
  endpoint: string;
  options?: { applicationServerKey?: ArrayBuffer | ArrayBufferView | null } | null;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
};

export type BrowserPushSubscriptionManager = {
  getSubscription(): Promise<BrowserPushSubscription | null>;
  subscribe(options: {
    userVisibleOnly: boolean;
    applicationServerKey: Uint8Array<ArrayBuffer>;
  }): Promise<BrowserPushSubscription>;
};

export type BrowserPushKeys = { p256dh: string; auth: string };

export class BrowserPushSubscriptionError extends Error {
  constructor(
    message: string,
    public readonly browserErrorName: string,
  ) {
    super(message);
    this.name = 'BrowserPushSubscriptionError';
  }
}

/**
 * Compare a subscription's bound VAPID key with the expected one. Returns
 * `null` when the platform does not expose `options.applicationServerKey`
 * (then the caller must keep the existing subscription; rotating VAPID keys
 * always requires a device re-enrollment there).
 */
export function applicationServerKeyMatches(
  bound: ArrayBuffer | ArrayBufferView | null | undefined,
  expected: Uint8Array,
): boolean | null {
  if (!bound) return null;
  const bytes =
    bound instanceof ArrayBuffer
      ? new Uint8Array(bound)
      : new Uint8Array(bound.buffer, bound.byteOffset, bound.byteLength);
  if (bytes.length !== expected.length) return false;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] !== expected[index]) return false;
  }
  return true;
}

function readKeys(subscription: BrowserPushSubscription): BrowserPushKeys {
  const json = subscription.toJSON() as { keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const p256dh = json?.keys?.p256dh;
  const auth = json?.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string')
    throw new BrowserPushSubscriptionError('Subscription keys are missing', 'MissingKeysError');
  return { p256dh, auth };
}

/**
 * Reuse the browser's existing push subscription when it is still bound to the
 * expected VAPID key, otherwise replace it. Reusing avoids the
 * `InvalidStateError`/`AbortError` that Chrome (notably on Android) reports
 * when `subscribe()` is called for an already-subscribed service worker, and
 * replacing heals a subscription that was created with a rotated VAPID key.
 */
export async function ensureBrowserSubscription(
  manager: BrowserPushSubscriptionManager,
  applicationServerKey: Uint8Array<ArrayBuffer>,
): Promise<{ endpoint: string; keys: BrowserPushKeys }> {
  const subscribeOptions = { userVisibleOnly: true, applicationServerKey } as const;
  const existing = await manager.getSubscription().catch(() => null);
  if (existing) {
    if (
      applicationServerKeyMatches(existing.options?.applicationServerKey, applicationServerKey) !==
      false
    )
      return { endpoint: existing.endpoint, keys: readKeys(existing) };
    await existing.unsubscribe().catch(() => false);
  }
  try {
    const created = await manager.subscribe(subscribeOptions);
    return { endpoint: created.endpoint, keys: readKeys(created) };
  } catch (error) {
    // A concurrent subscribe (another tab, or the WebAPK) can win the race and
    // make this call fail with `InvalidStateError`; reconcile once.
    const name = error instanceof Error ? error.name : '';
    if (name !== 'InvalidStateError') throw error;
    const raced = await manager.getSubscription().catch(() => null);
    if (!raced) throw error;
    await raced.unsubscribe().catch(() => false);
    const created = await manager.subscribe(subscribeOptions);
    return { endpoint: created.endpoint, keys: readKeys(created) };
  }
}
