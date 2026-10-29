export type InstallLanguage = 'id' | 'en';

/**
 * Browser menus follow the phone language, so the install guide does too:
 * Indonesian phones get Indonesian (older Android reports it as `in`),
 * everything else English.
 */
export function installLanguage(
  languages: readonly string[] | undefined,
  fallback = '',
): InstallLanguage {
  const first = (languages?.[0] ?? fallback).toLowerCase();
  return /^(id|in)(-|_|$)/.test(first) ? 'id' : 'en';
}

/** `**text**` marks the browser's own menu labels, shown in bold. */
const id = {
  titles: {
    install: 'Pasang CARE di Android',
    'ios-safari': 'Pasang CARE di iPhone',
    'ios-other': 'Buka di Safari',
    'open-chrome': 'Buka di Chrome',
    installed: 'CARE sudah terpasang',
  },
  installCta: 'Instal CARE',
  or: 'atau',
  openCare: 'Buka CARE',
  openChrome: 'Buka di Chrome',
  copyLink: 'Salin link',
  linkCopied: 'Link disalin',
  iosOtherHint: 'Salin link ini, lalu tempel di Safari.',
  installedHint: 'Ikon CARE sudah ada di layar utama HP.',
  chromeSteps: [
    'Tap **⋮** di pojok kanan atas atau bawah',
    'Pilih **Instal aplikasi** atau **Tambahkan ke layar utama**',
  ] as [string, string],
  iosSteps: [
    'Tap **⋯** di kanan bawah',
    'Tap **Bagikan**',
    'Pilih **Tambahkan ke Layar Utama**',
    'Buka **CARE** dari layar utama',
  ] as [string, string, string, string],
  iosMock: {
    share: 'Bagikan',
    bookmark: 'Tambahkan Penanda',
    more: 'Lihat Lainnya',
    home: 'Tambahkan ke Layar Utama',
  },
};

export type InstallCopy = typeof id;

const en: InstallCopy = {
  titles: {
    install: 'Install CARE on Android',
    'ios-safari': 'Install CARE on iPhone',
    'ios-other': 'Open in Safari',
    'open-chrome': 'Open in Chrome',
    installed: 'CARE is installed',
  },
  installCta: 'Install CARE',
  or: 'or',
  openCare: 'Open CARE',
  openChrome: 'Open in Chrome',
  copyLink: 'Copy link',
  linkCopied: 'Link copied',
  iosOtherHint: 'Copy this link, then paste it in Safari.',
  installedHint: 'The CARE icon is now on your home screen.',
  chromeSteps: [
    'Tap **⋮** in the top or bottom right corner',
    'Choose **Install app** or **Add to Home screen**',
  ],
  iosSteps: [
    'Tap **⋯** at the bottom right',
    'Tap **Share**',
    'Choose **Add to Home Screen**',
    'Open **CARE** from your home screen',
  ],
  iosMock: {
    share: 'Share',
    bookmark: 'Add Bookmark',
    more: 'View More',
    home: 'Add to Home Screen',
  },
};

export const INSTALL_COPY: Record<InstallLanguage, InstallCopy> = { id, en };
