import { Button } from '@care/ui';
import {
  Check,
  Copy,
  Download,
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
      return (
        <ol className="install-steps">
          <Step index={1} icon={<Share size={18} />}>
            Tap <strong>Bagikan</strong>
          </Step>
          <Step index={2} icon={<SquarePlus size={18} />}>
            Pilih <strong>Tambah ke Layar Utama</strong>
          </Step>
        </ol>
      );
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
    <main className="install-page">
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
