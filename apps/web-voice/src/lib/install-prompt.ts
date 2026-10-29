import { isIosUserAgent } from './browser-capabilities.js';

/** Chromium's deferred install prompt; not in the DOM lib types. */
export type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * Chromium fires `beforeinstallprompt` once, early in page load, so it is
 * captured before the app mounts and replayed to the install page.
 */
export function captureInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    notify();
  });
}

type RelatedAppsNavigator = Navigator & {
  getInstalledRelatedApps?: () => Promise<unknown[]>;
};

/**
 * Chromium on Android reports an installed copy through the manifest's
 * `related_applications`; elsewhere the API is missing and nothing changes.
 */
export async function detectInstalledApp() {
  const lookup = (navigator as RelatedAppsNavigator).getInstalledRelatedApps;
  if (!lookup) return;
  try {
    const apps = await lookup.call(navigator);
    if (apps.length > 0 && !installed) {
      installed = true;
      notify();
    }
  } catch {
    // Unsupported contexts reject; the install view stays as it is.
  }
}

export function installPromptState() {
  return { canPrompt: deferred !== null, installed };
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Shows the native install dialog; resolves true when the user accepts. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null;
  await event.prompt();
  const choice = await event.userChoice;
  notify();
  return choice.outcome === 'accepted';
}

export type InstallPlatform =
  'ios-safari' | 'ios-other' | 'android' | 'android-in-app' | 'android-other' | 'desktop';

/** In-app browsers (Instagram, Facebook, LINE, TikTok, generic WebView) cannot install. */
const IN_APP =
  /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp|Telegram|musical_ly|BytedanceWebview|Snapchat|GSA\//i;

/**
 * Phone-maker and lite browsers never offer Chromium's install prompt, even
 * when their user agent mentions Chrome; they are sent to Chrome instead.
 */
const NO_INSTALL_PROMPT =
  /MiuiBrowser|XiaoMi\/|HeyTapBrowser|OppoBrowser|VivoBrowser|UCBrowser|HuaweiBrowser|HONORBrowser|Quark\/|Opera Mini|OPR\/.*Mini|baiduboxapp|Firefox\//i;

export function detectInstallPlatform(
  userAgent: string,
  platform = '',
  maxTouchPoints = 0,
): InstallPlatform {
  if (isIosUserAgent(userAgent, platform, maxTouchPoints)) {
    const otherBrowser =
      /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//i.test(userAgent) || IN_APP.test(userAgent);
    return otherBrowser || !/Safari/i.test(userAgent) ? 'ios-other' : 'ios-safari';
  }
  if (/Android/i.test(userAgent)) {
    if (IN_APP.test(userAgent)) return 'android-in-app';
    return /Chrome\//.test(userAgent) && !NO_INSTALL_PROMPT.test(userAgent)
      ? 'android'
      : 'android-other';
  }
  return 'desktop';
}

/** Android intent that reopens a URL in Chrome from an in-app browser. */
export function chromeIntentUrl(url: string) {
  const target = new URL(url);
  return `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;package=com.android.chrome;end`;
}

/**
 * Android intent for an in-scope URL with no package, so Android can hand it
 * to the installed CARE app (Chrome's WebAPK registers the scope). With no app,
 * Chrome follows the fallback and the page stays in the browser.
 */
export function installedAppIntentUrl(url: string) {
  const target = new URL(url);
  const fallback = encodeURIComponent(target.href);
  return `intent://${target.host}${target.pathname}${target.search}#Intent;scheme=https;S.browser_fallback_url=${fallback};end`;
}
