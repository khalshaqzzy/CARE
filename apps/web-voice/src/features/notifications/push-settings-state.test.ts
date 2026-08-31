import { describe, expect, it } from 'vitest';
import { resolvePushSettingsView } from './push-settings-state';

const view = (overrides: Partial<Parameters<typeof resolvePushSettingsView>[0]> = {}) =>
  resolvePushSettingsView({
    pushRequiresIosUpgrade: false,
    pushRequiresInstall: false,
    serviceWorkerFailed: false,
    supported: true,
    configured: true,
    permission: 'default',
    ...overrides,
  });

describe('push settings guidance', () => {
  it.each([
    ['iOS 11.3', { pushRequiresIosUpgrade: true }, 'ios-upgrade'],
    ['iOS 16.3', { pushRequiresIosUpgrade: true }, 'ios-upgrade'],
    ['iOS 16.4 Safari tab', { pushRequiresInstall: true }, 'ios-install'],
    ['iOS 16.4 Home Screen', {}, 'toggle'],
    ['permission denied', { permission: 'denied' }, 'denied'],
    ['VAPID unconfigured', { configured: false }, 'unconfigured'],
    ['service worker registration failed', { serviceWorkerFailed: true }, 'unsupported'],
  ] as const)('selects %s guidance', (_name, state, expected) => {
    expect(view(state)).toBe(expected);
  });

  it('prioritizes platform guidance before configuration or permission state', () => {
    expect(view({ pushRequiresIosUpgrade: true, configured: false, permission: 'denied' })).toBe(
      'ios-upgrade',
    );
  });
});
