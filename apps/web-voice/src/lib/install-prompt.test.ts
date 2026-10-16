import { describe, expect, it } from 'vitest';
import { chromeIntentUrl, detectInstallPlatform } from './install-prompt';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const ANDROID_WEBVIEW =
  'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36';

describe('detectInstallPlatform', () => {
  it('separates iPhone Safari from other iPhone browsers', () => {
    expect(detectInstallPlatform(IPHONE_SAFARI, 'iPhone', 5)).toBe('ios-safari');
    expect(detectInstallPlatform(IPHONE_CHROME, 'iPhone', 5)).toBe('ios-other');
    expect(detectInstallPlatform(IPHONE_INSTAGRAM, 'iPhone', 5)).toBe('ios-other');
  });

  it('treats desktop-mode iPad Safari as iOS', () => {
    const ipad =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
    expect(detectInstallPlatform(ipad, 'MacIntel', 5)).toBe('ios-safari');
  });

  it('separates Android browsers from in-app WebViews', () => {
    expect(detectInstallPlatform(ANDROID_CHROME, 'Linux armv8l', 5)).toBe('android');
    expect(detectInstallPlatform(ANDROID_WEBVIEW, 'Linux armv8l', 5)).toBe('android-in-app');
  });

  it('falls back to desktop', () => {
    expect(
      detectInstallPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Win32',
        0,
      ),
    ).toBe('desktop');
  });
});

describe('chromeIntentUrl', () => {
  it('reopens the same https URL in Chrome', () => {
    expect(chromeIntentUrl('https://satucare.com/install')).toBe(
      'intent://satucare.com/install#Intent;scheme=https;package=com.android.chrome;end',
    );
  });
});
