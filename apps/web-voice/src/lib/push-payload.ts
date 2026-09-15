/**
 * Pure parsing/building for Web Push payloads, shared by the service worker and
 * its tests.
 *
 * The backend sends `{ title, body, deepLink }` with an already-redacted Private
 * payload; `url` is accepted as a legacy alias. A malformed or empty payload
 * must still produce a visible notification — Chrome requires one for every
 * push while the subscription is `userVisibleOnly` — so parsing never throws.
 */

export type PushNotificationPayload = {
  title: string;
  body: string;
  /** Same-origin path opened when the notification is tapped. */
  deepLink: string;
};

export type CareNotificationOptions = NotificationOptions & {
  /** Re-alert when a notification with the same `tag` replaces an earlier one. */
  renotify?: boolean;
};
export type CareNotification = { title: string; options: CareNotificationOptions };

const DEFAULT_TITLE = 'Pembaruan CARE';
const DEFAULT_BODY = 'Buka CARE untuk melihat pembaruan terbaru.';
const DEFAULT_DEEP_LINK = '/notifications';

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Only same-origin paths are accepted as deep links. The server never emits an
 * external URL, and rejecting `//host` / absolute URLs keeps a compromised or
 * future payload from opening a third-party page from a notification tap.
 */
export function safeDeepLink(value: unknown): string | null {
  const candidate = nonEmptyString(value);
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return candidate;
}

export function parsePushPayload(input: unknown): PushNotificationPayload {
  const data =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    title: nonEmptyString(data.title) ?? DEFAULT_TITLE,
    body: nonEmptyString(data.body) ?? DEFAULT_BODY,
    deepLink: safeDeepLink(data.deepLink) ?? safeDeepLink(data.url) ?? DEFAULT_DEEP_LINK,
  };
}

/** Parse raw push bytes; any non-JSON/garbage payload falls back to defaults. */
export function parsePushPayloadText(text: string | null | undefined): PushNotificationPayload {
  if (!text) return parsePushPayload(undefined);
  try {
    return parsePushPayload(JSON.parse(text));
  } catch {
    return parsePushPayload(undefined);
  }
}

export function buildNotification(payload: PushNotificationPayload): CareNotification {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // One Voice keeps one notification slot: a later update for the same
      // deep link replaces the earlier banner (with renotify) instead of
      // stacking duplicates when the outbox retries a delivery.
      tag: `care:${payload.deepLink}`,
      renotify: true,
      data: { url: payload.deepLink },
    },
  };
}
