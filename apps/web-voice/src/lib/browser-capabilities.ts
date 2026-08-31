export type BrowserCapabilityTier = 'unsupported' | 'core-online' | 'pwa' | 'push';
export type BrowserCapabilityReason =
  | 'supported'
  | 'ios-too-old'
  | 'missing-core-api'
  | 'service-worker-unavailable'
  | 'push-unavailable'
  | 'push-requires-ios-upgrade'
  | 'push-requires-install';

export type IosVersion = { major: number; minor: number; patch: number };

export type BrowserCapabilityProbe = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standalone: boolean;
  coreApis: boolean;
  serviceWorker: boolean;
  cacheStorage: boolean;
  requestResponse: boolean;
  promiseAllSettled: boolean;
  pushManager: boolean;
  notification: boolean;
};

export type BrowserCapabilities = {
  tier: BrowserCapabilityTier;
  reason: BrowserCapabilityReason;
  ios: boolean;
  iosVersion: IosVersion | null;
  standalone: boolean;
  coreSupported: boolean;
  serviceWorkerSupported: boolean;
  pushSupported: boolean;
  pushRequiresIosUpgrade: boolean;
  pushRequiresInstall: boolean;
  enhancedSelectSupported: boolean;
};

const IOS_MINIMUM: IosVersion = { major: 11, minor: 3, patch: 0 };
const IOS_PUSH_MINIMUM: IosVersion = { major: 16, minor: 4, patch: 0 };

function compareVersion(left: IosVersion, right: IosVersion): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

export function parseIosVersion(
  userAgent: string,
  platform = '',
  maxTouchPoints = 0,
): IosVersion | null {
  const mobileMatch = userAgent.match(
    /(?:CPU (?:iPhone )?OS|iPhone OS) (\d+)[_.](\d+)(?:[_.](\d+))?/i,
  );
  const desktopIpad = platform === 'MacIntel' && maxTouchPoints > 1;
  const desktopMatch = desktopIpad ? userAgent.match(/Version\/(\d+)\.(\d+)(?:\.(\d+))?/i) : null;
  const match = mobileMatch ?? desktopMatch;
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3] ?? 0),
  };
}

export function isIosUserAgent(userAgent: string, platform = '', maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
}

export function readBrowserCapabilityProbe(): BrowserCapabilityProbe {
  if (typeof window === 'undefined') {
    return {
      userAgent: '',
      platform: '',
      maxTouchPoints: 0,
      standalone: false,
      coreApis: false,
      serviceWorker: false,
      cacheStorage: false,
      requestResponse: false,
      promiseAllSettled: false,
      pushManager: false,
      notification: false,
    };
  }
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const standalone =
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    navigatorWithStandalone.standalone === true;
  let storageAvailable = false;
  try {
    storageAvailable = 'localStorage' in window && Boolean(window.localStorage);
  } catch {
    storageAvailable = false;
  }
  return {
    userAgent: navigator.userAgent ?? '',
    platform: navigator.platform ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
    coreApis: Boolean(
      window.Promise &&
      'fetch' in window &&
      window.URL &&
      window.URLSearchParams &&
      window.FormData &&
      window.File &&
      'querySelector' in document &&
      storageAvailable,
    ),
    serviceWorker: Boolean(navigator.serviceWorker),
    cacheStorage: Boolean(window.caches),
    requestResponse: Boolean(window.Request && window.Response),
    promiseAllSettled: typeof Promise.allSettled === 'function',
    pushManager: Boolean(window.PushManager),
    notification: Boolean(window.Notification),
  };
}

export function resolveBrowserCapabilities(
  probe: BrowserCapabilityProbe,
  enhancedSelectSupported = typeof window !== 'undefined' &&
    Boolean(window.PointerEvent && window.ResizeObserver),
): BrowserCapabilities {
  const ios = isIosUserAgent(probe.userAgent, probe.platform, probe.maxTouchPoints);
  const iosVersion = parseIosVersion(probe.userAgent, probe.platform, probe.maxTouchPoints);
  const iosTooOld = Boolean(ios && iosVersion && compareVersion(iosVersion, IOS_MINIMUM) < 0);
  const coreSupported = probe.coreApis && !iosTooOld;
  const serviceWorkerSupported = Boolean(
    coreSupported &&
    probe.serviceWorker &&
    probe.cacheStorage &&
    probe.requestResponse &&
    probe.promiseAllSettled,
  );
  const pushRequiresIosUpgrade = Boolean(
    ios && (!iosVersion || compareVersion(iosVersion, IOS_PUSH_MINIMUM) < 0),
  );
  const pushRequiresInstall = Boolean(
    ios && !pushRequiresIosUpgrade && serviceWorkerSupported && !probe.standalone,
  );
  const pushSupported = Boolean(
    serviceWorkerSupported &&
    probe.pushManager &&
    probe.notification &&
    !pushRequiresIosUpgrade &&
    (!ios || probe.standalone),
  );

  let tier: BrowserCapabilityTier = 'unsupported';
  let reason: BrowserCapabilityReason = iosTooOld ? 'ios-too-old' : 'missing-core-api';
  if (coreSupported) {
    tier = 'core-online';
    reason = 'service-worker-unavailable';
  }
  if (serviceWorkerSupported) {
    tier = 'pwa';
    reason = pushRequiresIosUpgrade
      ? 'push-requires-ios-upgrade'
      : pushRequiresInstall
        ? 'push-requires-install'
        : 'push-unavailable';
  }
  if (pushSupported) {
    tier = 'push';
    reason = 'supported';
  }

  return {
    tier,
    reason,
    ios,
    iosVersion,
    standalone: probe.standalone,
    coreSupported,
    serviceWorkerSupported,
    pushSupported,
    pushRequiresIosUpgrade,
    pushRequiresInstall,
    enhancedSelectSupported,
  };
}

export function getBrowserCapabilities(): BrowserCapabilities {
  return resolveBrowserCapabilities(readBrowserCapabilityProbe());
}

export function supportsEnhancedSelect(): boolean {
  return getBrowserCapabilities().enhancedSelectSupported;
}
