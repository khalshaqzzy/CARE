import { Button } from '@care/ui';
import {
  ArrowDownRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  Share,
  SquarePlus,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBrowserCapabilities } from '../../lib/browser-capabilities';
import {
  chromeIntentUrl,
  detectInstallPlatform,
  installPromptState,
  promptInstall,
  subscribeInstallPrompt,
} from '../../lib/install-prompt';

type View =
  'prompt' | 'ios-safari' | 'ios-other' | 'android-manual' | 'android-in-app' | 'installed';

const TITLES: Record<View, string> = {
  prompt: 'Pasang CARE di HP',
  'android-manual': 'Pasang CARE di HP',
  'ios-safari': 'Pasang CARE di iPhone',
  'ios-other': 'Buka di Safari',
  'android-in-app': 'Buka di Chrome',
  installed: 'CARE sudah terpasang',
};

function useInstallView(): View {
  const [state, setState] = useState(installPromptState);
  useEffect(() => subscribeInstallPrompt(() => setState(installPromptState())), []);
  if (state.installed) return 'installed';
  if (state.canPrompt) return 'prompt';
  const platform = detectInstallPlatform(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
  if (platform === 'ios-safari' || platform === 'ios-other' || platform === 'android-in-app')
    return platform;
  return 'android-manual';
}

function Step({ index, icon, children }: { index: number; icon: ReactNode; children: ReactNode }) {
  return (
    <li className="install-step">
      <span className="install-step__index">{index}</span>
      <span>{children}</span>
      <span className="install-step__icon" aria-hidden="true">
        {icon}
      </span>
    </li>
  );
}

/** Points at Safari's own ⋯ button, which sits below the page in the bottom bar. */
function SafariArrow() {
  return (
    <div className="install-arrow" aria-hidden="true">
      <span className="install-arrow__label">
        Tap <Ellipsis size={16} />
      </span>
      <ArrowDownRight className="install-arrow__icon" size={40} strokeWidth={2.75} />
    </div>
  );
}

/**
 * iPhone Safari steps with small mockups of Safari's own menus. Labels carry
 * both the Indonesian and English names, since Safari follows the phone language.
 */
function IosSafariGuide() {
  return (
    <>
      <ol className="install-shots">
        <li className="install-shot">
          <p>
            <span className="install-step__index">1</span>
            <span>
              Tap <strong>⋯</strong> di kanan bawah
            </span>
          </p>
          <div className="install-mock install-mock--bar" aria-hidden="true">
            <ChevronLeft size={18} />
            <span className="install-mock__url">satucare.com</span>
            <span className="install-mock__hit">
              <Ellipsis size={18} />
            </span>
          </div>
        </li>
        <li className="install-shot">
          <p>
            <span className="install-step__index">2</span>
            <span>
              Tap <strong>Bagikan</strong> / <strong>Share</strong>
            </span>
          </p>
          <div className="install-mock install-mock--menu" aria-hidden="true">
            <span className="install-mock__row install-mock__hit">
              <Share size={16} /> Bagikan / Share
            </span>
            <span className="install-mock__row">
              <Bookmark size={16} /> Add to Bookmarks
            </span>
          </div>
        </li>
        <li className="install-shot">
          <p>
            <span className="install-step__index">3</span>
            <span>
              Pilih <strong>Tambahkan ke Layar Utama</strong> / <strong>Add to Home Screen</strong>
            </span>
          </p>
          <div className="install-mock install-mock--sheet" aria-hidden="true">
            <span className="install-mock__more">
              <ChevronDown size={16} /> Lihat Lainnya / View More
            </span>
            <span className="install-mock__row install-mock__hit">
              <SquarePlus size={16} /> Add to Home Screen
            </span>
          </div>
        </li>
      </ol>
      <SafariArrow />
    </>
  );
}

function InstallAction({ view }: { view: View }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const url = `${window.location.origin}/install`;
  switch (view) {
    case 'prompt':
      return (
        <Button
          className="install-cta"
          loading={pending}
          onClick={() => {
            setPending(true);
            void promptInstall().finally(() => setPending(false));
          }}
        >
          <Download size={18} aria-hidden="true" /> Instal CARE
        </Button>
      );
    case 'installed':
      return (
        <Button className="install-cta" onClick={() => void navigate('/')}>
          Buka CARE
        </Button>
      );
    case 'ios-safari':
      return <IosSafariGuide />;
    case 'android-manual':
      return (
        <ol className="install-steps">
          <Step index={1} icon={<EllipsisVertical size={18} />}>
            Tap <strong>menu</strong> browser
          </Step>
          <Step index={2} icon={<SquarePlus size={18} />}>
            Pilih <strong>Instal aplikasi</strong>
          </Step>
        </ol>
      );
    case 'android-in-app':
      return (
        <a
          className="care-button care-button--primary care-button--md install-cta"
          href={chromeIntentUrl(url)}
        >
          <ExternalLink size={18} aria-hidden="true" /> Buka di Chrome
        </a>
      );
    case 'ios-other':
      return (
        <Button
          className="install-cta"
          variant="secondary"
          onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
        >
          {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
          {copied ? 'Link disalin' : 'Salin link'}
        </Button>
      );
  }
}

/**
 * Public install link (`/install`). Browsers do not allow a page to install
 * itself, so this page offers the native prompt where Chromium provides one
 * and short manual steps elsewhere. Opened from the installed app, it goes home.
 */
export function InstallPage() {
  const navigate = useNavigate();
  const view = useInstallView();
  const standalone = getBrowserCapabilities().standalone;
  useEffect(() => {
    if (standalone) void navigate('/', { replace: true });
  }, [navigate, standalone]);

  return (
    <main className={view === 'ios-safari' ? 'install-page install-page--ios' : 'install-page'}>
      <img className="install-icon" src="/icon-192.png" alt="" width={96} height={96} />
      <p className="install-name">
        <strong>CARE</strong>
        <span>Member Voice</span>
      </p>
      <h1>{TITLES[view]}</h1>
      {view === 'ios-other' ? (
        <p className="install-hint">Salin link ini, lalu tempel di Safari.</p>
      ) : null}
      <InstallAction view={view} />
    </main>
  );
}
