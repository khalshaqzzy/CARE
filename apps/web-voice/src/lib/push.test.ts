import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  BrowserPushSubscriptionError,
  applicationServerKeyMatches,
  browserSubscriptionPayload,
  endpointHashPrefix,
  ensureBrowserSubscription,
  getInstallationId,
  isPushSupported,
  isStandalone,
  permissionState,
  pushPlatform,
  pushProviderHost,
  subscriptionPayload,
  urlBase64ToUint8Array,
  type BrowserPushSubscription,
} from './push';

const keys = { p256dh: 'a'.repeat(22), auth: 'b'.repeat(11) };

/** Browser subscription fixture with an observable unsubscribe counter. */
function fakeSubscription(endpoint: string, applicationServerKey: ArrayBuffer | null | undefined) {
  const state = { unsubscribeCalls: 0 };
  const subscription: BrowserPushSubscription = {
    endpoint,
    options: applicationServerKey === undefined ? undefined : { applicationServerKey },
    toJSON: () => ({ keys }),
    unsubscribe: async () => {
      state.unsubscribeCalls += 1;
      return true;
    },
  };
  return { subscription, state };
}

describe('Web Push helpers (node environment)', () => {
  it('decodes a base64url VAPID key into bytes', () => {
    // 'hello' in base64 = 'aGVsbG8=' -> base64url (non-padded) = 'aGVsbG8'
    const bytes = urlBase64ToUint8Array('aGVsbG8');
    expect(Array.from(bytes)).toEqual([104, 101, 108, 108, 111]);
  });

  it('tolerates base64url padding and url-safe characters', () => {
    const padded = urlBase64ToUint8Array('aGVsbG8=');
    const urlSafe = urlBase64ToUint8Array('_-8');
    expect(Array.from(padded)).toEqual([104, 101, 108, 108, 111]);
    // url-safe needs -/_ remapped back to +/ before decoding
    expect(urlSafe.length).toBeGreaterThan(0);
  });

  it('reports push as unsupported in a non-browser environment', () => {
    expect(isPushSupported()).toBe(false);
    expect(isStandalone()).toBe(false);
    expect(permissionState()).toBe('unsupported');
    expect(pushPlatform()).toBe('other');
  });

  it('falls back to a server-side installation id without a browser', () => {
    expect(getInstallationId()).toBe('server-side');
  });

  it('builds a subscription payload without leaking extra fields', () => {
    const payload = subscriptionPayload('https://push.example.com/x', keys);
    expect(payload).toEqual({
      installationId: 'server-side',
      endpoint: 'https://push.example.com/x',
      keys,
    });
    expect(payload.keys).not.toHaveProperty('expirationTime');
  });

  it('reads the provider host from an endpoint', () => {
    expect(pushProviderHost('https://fcm.googleapis.com/fcm/send/abc')).toBe('fcm.googleapis.com');
    expect(pushProviderHost('not-a-url')).toBeNull();
  });

  it('derives the endpoint hash prefix the server compares against', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
    const expected = createHash('sha256').update(endpoint).digest('hex').slice(0, 12);
    const prefix = await endpointHashPrefix(endpoint);
    expect(prefix).toBe(expected);
    expect(prefix).toHaveLength(12);
  });
});

describe('applicationServerKeyMatches', () => {
  const expected = urlBase64ToUint8Array('aGVsbG8');

  it('accepts an identical bound key and rejects a different one', () => {
    expect(applicationServerKeyMatches(expected.buffer.slice(0), expected)).toBe(true);
    const different = new Uint8Array([1, 2, 3]);
    expect(applicationServerKeyMatches(different.buffer, expected)).toBe(false);
  });

  it('rejects a bound key of a different length', () => {
    expect(applicationServerKeyMatches(new Uint8Array([104, 101]).buffer, expected)).toBe(false);
  });

  it('reads views that do not start at the buffer offset', () => {
    const padded = new Uint8Array([0, 0, ...expected]);
    expect(applicationServerKeyMatches(padded.subarray(2), expected)).toBe(true);
  });

  it('reports unknown when the platform exposes no bound key', () => {
    expect(applicationServerKeyMatches(undefined, expected)).toBeNull();
    expect(applicationServerKeyMatches(null, expected)).toBeNull();
  });
});

describe('ensureBrowserSubscription', () => {
  const key = urlBase64ToUint8Array('aGVsbG8');

  it('creates a subscription when the browser has none', async () => {
    const created = fakeSubscription('https://fcm.googleapis.com/fcm/send/new', key.buffer);
    const manager = {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => created.subscription),
    };
    await expect(ensureBrowserSubscription(manager, key)).resolves.toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/new',
      keys,
    });
  });

  it('reuses an existing subscription bound to the same key instead of resubscribing', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', key.buffer);
    const subscribe = vi.fn();
    const manager = { getSubscription: vi.fn(async () => existing.subscription), subscribe };
    await expect(ensureBrowserSubscription(manager, key)).resolves.toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/old',
      keys,
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(existing.state.unsubscribeCalls).toBe(0);
  });

  it('reuses an existing subscription when the platform hides the bound key', async () => {
    const existing = fakeSubscription('https://fcm.googleapis.com/fcm/send/ios', undefined);
    const subscribe = vi.fn();
    const manager = { getSubscription: vi.fn(async () => existing.subscription), subscribe };
    await expect(ensureBrowserSubscription(manager, key)).resolves.toMatchObject({
      endpoint: 'https://fcm.googleapis.com/fcm/send/ios',
    });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('replaces a subscription bound to a rotated VAPID key', async () => {
    const existing = fakeSubscription(
      'https://fcm.googleapis.com/fcm/send/stale',
      new Uint8Array([9, 9, 9]).buffer,
    );
    const created = fakeSubscription('https://fcm.googleapis.com/fcm/send/fresh', key.buffer);
    const manager = {
      getSubscription: vi.fn(async () => existing.subscription),
      subscribe: vi.fn(async () => created.subscription),
    };
    await expect(ensureBrowserSubscription(manager, key)).resolves.toMatchObject({
      endpoint: 'https://fcm.googleapis.com/fcm/send/fresh',
    });
    expect(existing.state.unsubscribeCalls).toBe(1);
  });

  it('reconciles an InvalidStateError race with another tab', async () => {
    const raced = fakeSubscription(
      'https://fcm.googleapis.com/fcm/send/raced',
      new Uint8Array([9, 9, 9]).buffer,
    );
    const created = fakeSubscription('https://fcm.googleapis.com/fcm/send/final', key.buffer);
    const invalidState = Object.assign(new Error('Registration failed'), {
      name: 'InvalidStateError',
    });
    const getSubscription = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(raced.subscription);
    const subscribe = vi
      .fn()
      .mockRejectedValueOnce(invalidState)
      .mockResolvedValueOnce(created.subscription);
    await expect(ensureBrowserSubscription({ getSubscription, subscribe }, key)).resolves.toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/final',
      keys,
    });
    expect(raced.state.unsubscribeCalls).toBe(1);
  });

  it('propagates a push service failure that is not a race', async () => {
    const abort = Object.assign(new Error('Registration failed - push service error'), {
      name: 'AbortError',
    });
    const manager = {
      getSubscription: vi.fn(async () => null),
      subscribe: vi.fn(async () => {
        throw abort;
      }),
    };
    await expect(ensureBrowserSubscription(manager, key)).rejects.toBe(abort);
  });

  it('fails clearly when the browser returns no keys', async () => {
    const broken = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/broken',
      toJSON: () => ({}),
      unsubscribe: vi.fn(async () => true),
    } as unknown as BrowserPushSubscription;
    const manager = { getSubscription: vi.fn(async () => broken), subscribe: vi.fn() };
    await expect(ensureBrowserSubscription(manager, key)).rejects.toBeInstanceOf(
      BrowserPushSubscriptionError,
    );
  });
});

describe('browserSubscriptionPayload', () => {
  it('posts only the endpoint and keys of an existing subscription', () => {
    const existing = fakeSubscription(
      'https://fcm.googleapis.com/fcm/send/kept',
      new Uint8Array(3).buffer,
    );
    expect(browserSubscriptionPayload(existing.subscription)).toEqual({
      installationId: 'server-side',
      endpoint: 'https://fcm.googleapis.com/fcm/send/kept',
      keys,
    });
  });
});
