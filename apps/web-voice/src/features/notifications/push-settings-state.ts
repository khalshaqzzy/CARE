import type { PushSetupFailureReason } from '../../lib/push-errors';

export type PushSettingsView =
  | 'ios-upgrade'
  | 'ios-install'
  | 'unsupported'
  | 'unconfigured'
  | 'denied'
  | 'permission-blocked'
  | 'toggle';

export function resolvePushSettingsView(state: {
  pushRequiresIosUpgrade: boolean;
  pushRequiresInstall: boolean;
  serviceWorkerFailed: boolean;
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | 'unsupported';
  lastFailure: PushSetupFailureReason | null;
}): PushSettingsView {
  if (state.pushRequiresIosUpgrade) return 'ios-upgrade';
  if (state.pushRequiresInstall) return 'ios-install';
  if (state.serviceWorkerFailed) return 'unsupported';
  if (!state.supported) return 'unsupported';
  if (!state.configured) return 'unconfigured';
  if (state.permission === 'denied') return 'denied';
  if (state.lastFailure === 'permission-dismissed') return 'permission-blocked';
  return 'toggle';
}
