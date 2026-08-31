export type PushSettingsView =
  'ios-upgrade' | 'ios-install' | 'unsupported' | 'unconfigured' | 'denied' | 'toggle';

export function resolvePushSettingsView(state: {
  pushRequiresIosUpgrade: boolean;
  pushRequiresInstall: boolean;
  serviceWorkerFailed: boolean;
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission | 'unsupported';
}): PushSettingsView {
  if (state.pushRequiresIosUpgrade) return 'ios-upgrade';
  if (state.pushRequiresInstall) return 'ios-install';
  if (state.serviceWorkerFailed) return 'unsupported';
  if (!state.supported) return 'unsupported';
  if (!state.configured) return 'unconfigured';
  if (state.permission === 'denied') return 'denied';
  return 'toggle';
}
