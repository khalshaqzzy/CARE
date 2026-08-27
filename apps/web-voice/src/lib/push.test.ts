import { describe, expect, it } from 'vitest';
import {
  getInstallationId,
  isPushSupported,
  isStandalone,
  permissionState,
  subscriptionPayload,
  urlBase64ToUint8Array,
} from './push';

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
  });

  it('falls back to a server-side installation id without a browser', () => {
    expect(getInstallationId()).toBe('server-side');
  });

  it('builds a subscription payload without leaking extra fields', () => {
    const payload = subscriptionPayload('https://push.example.com/x', {
      p256dh: 'a'.repeat(22),
      auth: 'b'.repeat(11),
    });
    expect(payload).toEqual({
      installationId: 'server-side',
      endpoint: 'https://push.example.com/x',
      keys: { p256dh: 'a'.repeat(22), auth: 'b'.repeat(11) },
    });
    expect(payload.keys).not.toHaveProperty('expirationTime');
  });
});
