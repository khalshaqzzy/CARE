import { describe, expect, it } from 'vitest';
import {
  parseIosVersion,
  resolveBrowserCapabilities,
  type BrowserCapabilityProbe,
} from './browser-capabilities';

const probe = (overrides: Partial<BrowserCapabilityProbe> = {}): BrowserCapabilityProbe => ({
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 11_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  platform: 'iPhone',
  maxTouchPoints: 1,
  standalone: false,
  coreApis: true,
  serviceWorker: true,
  cacheStorage: true,
  requestResponse: true,
  promiseAllSettled: false,
  pushManager: false,
  notification: false,
  ...overrides,
});

describe('browser capability tiers', () => {
  it('parses mobile and desktop-style iPadOS versions', () => {
    expect(parseIosVersion(probe().userAgent, 'iPhone', 1)).toEqual({
      major: 11,
      minor: 3,
      patch: 0,
    });
    expect(
      parseIosVersion(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/16.4 Mobile/15E148 Safari/604.1',
        'MacIntel',
        5,
      ),
    ).toEqual({ major: 16, minor: 4, patch: 0 });
  });

  it('rejects iOS below 11.3 and missing core APIs', () => {
    const old = resolveBrowserCapabilities(
      probe({ userAgent: probe().userAgent.replace('OS 11_3', 'OS 11_2') }),
      false,
    );
    expect(old).toMatchObject({ tier: 'unsupported', reason: 'ios-too-old' });
    expect(resolveBrowserCapabilities(probe({ coreApis: false }), false)).toMatchObject({
      tier: 'unsupported',
      reason: 'missing-core-api',
    });
  });

  it('keeps iOS 11.3 fully online when the Workbox runtime probe fails', () => {
    expect(resolveBrowserCapabilities(probe(), false)).toMatchObject({
      tier: 'core-online',
      coreSupported: true,
      serviceWorkerSupported: false,
      pushRequiresIosUpgrade: true,
    });
  });

  it('enables PWA before push and requires a Home Screen install on iOS 16.4', () => {
    const ios164 = probe({
      userAgent: probe().userAgent.replace('OS 11_3', 'OS 16_4'),
      promiseAllSettled: true,
      pushManager: true,
      notification: true,
    });
    expect(resolveBrowserCapabilities(ios164, true)).toMatchObject({
      tier: 'pwa',
      pushRequiresInstall: true,
      pushSupported: false,
    });
    expect(resolveBrowserCapabilities({ ...ios164, standalone: true }, true)).toMatchObject({
      tier: 'push',
      reason: 'supported',
      pushSupported: true,
    });
  });

  it('allows standards-based desktop push without a standalone requirement', () => {
    expect(
      resolveBrowserCapabilities(
        probe({
          userAgent: 'Mozilla/5.0 Chrome/140 Safari/537.36',
          platform: 'Linux x86_64',
          promiseAllSettled: true,
          pushManager: true,
          notification: true,
        }),
        true,
      ),
    ).toMatchObject({ tier: 'push', ios: false, pushRequiresInstall: false });
  });

  it('keeps Android supported without imposing the iOS Home Screen rule', () => {
    const android = probe({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      promiseAllSettled: true,
      pushManager: true,
      notification: true,
    });
    expect(resolveBrowserCapabilities(android, true)).toMatchObject({
      tier: 'push',
      ios: false,
      standalone: false,
      pushRequiresInstall: false,
      pushSupported: true,
    });
  });
});
