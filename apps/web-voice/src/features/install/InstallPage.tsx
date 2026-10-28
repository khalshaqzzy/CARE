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
  detectInstalledApp,
  installPromptState,
  promptInstall,
  subscribeInstallPrompt,
} from '../../lib/install-prompt';
import { INSTALL_COPY, installLanguage, type InstallCopy } from './install-copy';

type View = 'install' | 'ios-safari' | 'ios-other' | 'open-chrome' | 'installed';

function useInstallState() {
  const [state, setState] = useState(installPromptState);
  useEffect(() => subscribeInstallPrompt(() => setState(installPromptState())), []);
  return state;
}

function useInstallView(): View {
  const state = useInstallState();
  if (state.installed) return 'installed';
  if (state.canPrompt) return 'install';
  const platform = detectInstallPlatform(
    navigator.userAgent,
    navigator.platform,
    navigator.maxTouchPoints,
  );
  if (platform === 'ios-safari' || platform === 'ios-other') return platform;
  if (platform === 'android-in-app' || platform === 'android-other') return 'open-chrome';
  return 'install';
}

/** Renders `**label**` segments in bold; they name the browser's own menu items. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text
        .split('**')
        .map((part, index) => (index % 2 ? <strong key={index}>{part}</strong> : part))}
    </>
  );
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

/** iPhone Safari steps with small mockups of Safari's own menus. */
function IosSafariGuide({ t }: { t: InstallCopy }) {
  const [tapMore, tapShare, addHome] = t.iosSteps;
  return (
    <>
      <ol className="install-shots">
        <li className="install-shot">
          <p>
            <span className="install-step__index">1</span>
            <span>
              <Rich text={tapMore} />
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
              <Rich text={tapShare} />
            </span>
          </p>
          <div className="install-mock install-mock--menu" aria-hidden="true">
            <span className="install-mock__row install-mock__hit">
              <Share size={16} /> {t.iosMock.share}
            </span>
            <span className="install-mock__row">
              <Bookmark size={16} /> {t.iosMock.bookmark}
            </span>
          </div>
        </li>
        <li className="install-shot">
          <p>
            <span className="install-step__index">3</span>
            <span>
              <Rich text={addHome} />
            </span>
          </p>
          <div className="install-mock install-mock--sheet" aria-hidden="true">
            <span className="install-mock__more">
              <ChevronDown size={16} /> {t.iosMock.more}
            </span>
            <span className="install-mock__row install-mock__hit">
              <SquarePlus size={16} /> {t.iosMock.home}
            </span>
          </div>
        </li>
      </ol>
      <SafariArrow />
    </>
  );
}

/** Chrome's ⋮ menu sits top or bottom right depending on the phone and bar setting. */
function ChromeMenuSteps({ t, nudge }: { t: InstallCopy; nudge: number }) {
  const [openMenu, pickInstall] = t.chromeSteps;
  return (
    <ol key={nudge} className={nudge ? 'install-steps install-steps--nudge' : 'install-steps'}>
      <Step index={1} icon={<EllipsisVertical size={18} />}>
        <Rich text={openMenu} />
      </Step>
      <Step index={2} icon={<SquarePlus size={18} />}>
        <Rich text={pickInstall} />
      </Step>
    </ol>
  );
}

/**
 * Chromium install: the button opens Chrome's own dialog once Chrome offers
 * it (after its engagement checks), and the menu steps below always work.
 * A tap before Chrome is ready points at the steps instead.
 */
function ChromeInstall({ t }: { t: InstallCopy }) {
  const { canPrompt } = useInstallState();
  const [pending, setPending] = useState(false);
  const [nudge, setNudge] = useState(0);
  return (
    <>
      <Button
        className="install-cta"
        loading={pending}
        onClick={() => {
          if (!canPrompt) {
            setNudge((count) => count + 1);
            return;
          }
          setPending(true);
          void promptInstall().finally(() => setPending(false));
        }}
      >
        <Download size={18} aria-hidden="true" /> {t.installCta}
      </Button>
      <p className="install-or">{t.or}</p>
      <ChromeMenuSteps t={t} nudge={nudge} />
    </>
  );
}

function InstallAction({ view, t }: { view: View; t: InstallCopy }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/install`;
  switch (view) {
    case 'install':
      return <ChromeInstall t={t} />;
    case 'installed':
      return (
        <Button className="install-cta" onClick={() => void navigate('/')}>
          {t.openCare}
        </Button>
      );
    case 'ios-safari':
      return <IosSafariGuide t={t} />;
    case 'open-chrome':
      return (
        <a
          className="care-button care-button--primary care-button--md install-cta"
          href={chromeIntentUrl(url)}
        >
          <ExternalLink size={18} aria-hidden="true" /> {t.openChrome}
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
          {copied ? t.linkCopied : t.copyLink}
        </Button>
      );
  }
}

/**
 * Public install link (`/install`). Browsers do not allow a page to install
 * itself, so this page offers the native prompt where Chromium provides one
 * and short manual steps elsewhere, in the phone's language. Opened from the
 * installed app, it goes home.
 */
export function InstallPage() {
  const navigate = useNavigate();
  const view = useInstallView();
  const [language] = useState(() => installLanguage(navigator.languages, navigator.language));
  const t = INSTALL_COPY[language];
  const standalone = getBrowserCapabilities().standalone;
  useEffect(() => {
    if (standalone) void navigate('/', { replace: true });
  }, [navigate, standalone]);
  useEffect(() => {
    void detectInstalledApp();
  }, []);

  return (
    <main
      lang={language}
      className={view === 'ios-safari' ? 'install-page install-page--ios' : 'install-page'}
    >
      <img className="install-icon" src="/icon-192.png" alt="" width={96} height={96} />
      <p className="install-name">
        <strong>CARE</strong>
        <span>Member Voice</span>
      </p>
      <h1>{t.titles[view]}</h1>
      {view === 'ios-other' ? <p className="install-hint">{t.iosOtherHint}</p> : null}
      <InstallAction view={view} t={t} />
    </main>
  );
}
