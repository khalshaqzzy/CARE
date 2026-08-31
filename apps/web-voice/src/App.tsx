import { admitsAccount, SessionGate, useAuth } from '@care/frontend-core';
import {
  Alert,
  AppShell,
  Avatar,
  BottomNav,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  Loader,
  PasswordInput,
  Sidebar,
  Stack,
} from '@care/ui';
import { useIsMutating } from '@tanstack/react-query';
import {
  ArrowRight,
  Bell,
  Bot,
  ChevronRight,
  ClipboardList,
  Home,
  Inbox,
  Lock,
  LockKeyhole,
  MoreHorizontal,
  Plus,
  ScrollText,
  Shield,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { registerCareServiceWorker } from './register-sw.js';
import { getBrowserCapabilities } from './lib/browser-capabilities';
import { AccountPage } from './features/account/AccountPage';
import { CreateVoicePage } from './features/create/CreateVoicePage';
import { DraftPreviewPage } from './features/create/DraftPreviewPage';
import { GeneralBrowsePage } from './features/general/GeneralBrowsePage';
import { HistoryPage } from './features/history/HistoryPage';
import { HomePage } from './features/home/HomePage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { VoiceDetailPage } from './features/voice/VoiceDetailPage';
import { WorkItemsPage } from './features/work/WorkItemsPage';
import { desktopQuery, useMediaQuery } from './lib/use-media-query';
import { navigationForCapabilities } from './lib/navigation';

export function App() {
  const [onlineOnly] = useState(() => !getBrowserCapabilities().serviceWorkerSupported);
  useEffect(() => {
    void registerCareServiceWorker();
  }, []);
  return (
    <>
      {onlineOnly ? (
        <div className="pwa-mode-notice">
          <Alert tone="info" title="CARE berjalan dalam mode online">
            Fitur utama tetap tersedia. Offline cache dan notifikasi push tidak didukung perangkat
            ini; Pusat notifikasi di dalam CARE tetap dapat digunakan.
          </Alert>
        </div>
      ) : null}
      <ServiceWorkerUpdatePrompt />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/change-password" element={<ChangePasswordPage />} />
        <Route
          path="*"
          element={
            <SessionGate
              app="voice"
              loading={<RouteLoader />}
              unauthenticated={<Navigate to="/login" replace />}
              passwordChange={<Navigate to="/change-password" replace />}
              wrongApp={<WrongApp />}
            >
              <WorkforceShell />
            </SessionGate>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="voices/new" element={<CreateVoicePage />} />
          <Route path="drafts/:id/edit" element={<CreateVoicePage />} />
          <Route path="drafts/:id/preview" element={<DraftPreviewPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="work-items" element={<WorkItemsPage />} />
          <Route path="general" element={<GeneralRoute />} />
          <Route path="voices/:id" element={<VoiceDetailPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

function ServiceWorkerUpdatePrompt() {
  const mutationCount = useIsMutating();
  const [apply, setApply] = useState<null | (() => void)>(null);
  const [formActive, setFormActive] = useState(false);
  useEffect(() => {
    const update = () => setFormActive(Boolean(document.activeElement?.closest('form')));
    const ready = (event: Event) =>
      setApply(() => (event as CustomEvent<{ apply: () => void }>).detail.apply);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    window.addEventListener('care-sw-update-ready', ready);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      window.removeEventListener('care-sw-update-ready', ready);
    };
  }, []);
  if (!apply || mutationCount > 0 || formActive) return null;
  return (
    <div className="sw-update-prompt">
      <Alert
        tone="info"
        title="Pembaruan CARE tersedia"
        actions={
          <Button size="sm" onClick={apply}>
            Muat versi baru
          </Button>
        }
      >
        Simpan pekerjaan Anda, lalu muat versi terbaru.
      </Alert>
    </div>
  );
}

function RouteLoader() {
  return (
    <main className="route-loader">
      <Loader label="Memeriksa sesi" />
    </main>
  );
}

function LoginPage() {
  const { login, logout, session } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (session && admitsAccount(session, 'voice'))
      void navigate(session.passwordChangeRequired ? '/change-password' : '/', { replace: true });
  }, [navigate, session]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await login(username, password);
      if (!admitsAccount(result, 'voice')) {
        await logout();
        setError('Akun CARE Admin hanya dapat digunakan pada aplikasi Admin.');
        return;
      }
      void navigate(result.passwordChangeRequired ? '/change-password' : '/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login gagal.');
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <div className="auth-brand__lockup">
          <div className="brand-mark">C</div>
          <strong>CARE</strong>
        </div>
        <h1>
          <span>Sampaikan suara.</span> <span>Pantau tindak lanjutnya.</span>
        </h1>
        <p>Kanal internal untuk laporan General dan Private yang aman serta dapat ditelusuri.</p>
      </section>
      <Card variant="raised" className="auth-card">
        <Stack gap="lg">
          <div>
            <h2>Selamat datang kembali</h2>
            <p>Masuk untuk melanjutkan ke CARE Enterprise Member Voice.</p>
          </div>
          {error ? (
            <Alert tone="danger" title="Tidak dapat masuk">
              {error}
            </Alert>
          ) : null}
          <form onSubmit={submit} className="auth-form">
            <Input
              label="Username"
              autoComplete="username"
              leading={<UserRound size={18} />}
              placeholder="Username"
              helperText="Gunakan nomor registrasi atau username Union Anda."
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              leading={<Lock size={18} />}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" className="auth-submit" loading={pending}>
              Masuk
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>
        </Stack>
      </Card>
    </main>
  );
}

function ChangePasswordPage() {
  const { session, transport, refresh } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  if (!session) return <Navigate to="/login" replace />;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirm) {
      setError('Konfirmasi password tidak sama.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await transport.changePassword(currentPassword, newPassword);
      await refresh();
      void navigate('/', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password tidak dapat diubah.');
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-brand auth-brand--security">
        <span className="auth-brand__badge" aria-hidden="true">
          <LockKeyhole size={22} />
        </span>
        <h1>Keamanan akun</h1>
        <p>Ganti password sementara untuk menjaga keamanan akun Anda.</p>
        <Shield className="auth-brand__watermark" aria-hidden="true" />
      </section>
      <Card variant="raised" className="auth-card">
        <Stack gap="lg">
          <div>
            <h2>Ganti password sementara</h2>
            <p>
              Gunakan 6–128 karakter dan jangan samakan dengan username atau password sebelumnya.
            </p>
          </div>
          {error ? (
            <Alert tone="danger" title="Periksa password">
              {error}
            </Alert>
          ) : null}
          <form onSubmit={submit} className="auth-form">
            <PasswordInput
              label="Password saat ini"
              autoComplete="current-password"
              leading={<Lock size={18} />}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <PasswordInput
              label="Password baru"
              autoComplete="new-password"
              leading={<Lock size={18} />}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              maxLength={128}
              required
            />
            <PasswordInput
              label="Konfirmasi password baru"
              autoComplete="new-password"
              leading={<Lock size={18} />}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
            <Button type="submit" className="auth-submit" loading={pending}>
              Simpan password
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </form>
        </Stack>
      </Card>
    </main>
  );
}

function WrongApp() {
  const { logout } = useAuth();
  useEffect(() => {
    void logout();
  }, [logout]);
  return (
    <main className="centered-page">
      <EmptyState
        title="Gunakan CARE Admin"
        description="Akun Admin tidak tersedia di aplikasi workforce. Sesi pada host ini telah diakhiri."
      />
    </main>
  );
}

/** Dock/route map so every mobile bottom-nav tap resolves to a real route. */
const NAV_ROUTES: Record<string, string> = {
  home: '/',
  create: '/voices/new',
  history: '/history',
  'work-items': '/work-items',
  private: '/work-items',
  general: '/general',
  notifications: '/notifications',
  account: '/account',
};

function capabilityFor(session: ReturnType<typeof useAuth>['session']): {
  isMember: boolean;
  isResponder: boolean;
  isLeadership: boolean;
  isUnion: boolean;
  hasSectionHead: boolean;
} {
  const caps = session?.capabilities ?? [];
  return {
    isMember: caps.includes('MEMBER'),
    isResponder: caps.some((c) => ['MANAGER', 'SECTION_HEAD'].includes(c)),
    isLeadership: caps.some((c) => ['DIVISION_LEADERSHIP', 'DIRECTOR'].includes(c)),
    isUnion: caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER'].includes(c)),
    hasSectionHead: caps.includes('SECTION_HEAD'),
  };
}

function GeneralRoute() {
  const { session } = useAuth();
  const isUnion = session?.capabilities.some((capability) =>
    ['UNION_HEAD', 'UNION_OFFICER'].includes(capability),
  );
  return isUnion ? <GeneralBrowsePage /> : <Navigate to="/work-items" replace />;
}

function resolveCurrent(pathname: string, isUnion: boolean): string {
  const p = pathname;
  if (p === '/') return 'home';
  if (p.startsWith('/voices/new') || p.startsWith('/drafts/')) return 'create';
  if (p.startsWith('/history')) return 'history';
  // Union reads the same operational inbox as "Private Voice".
  if (p.startsWith('/work-items')) return isUnion ? 'private' : 'work-items';
  if (p.startsWith('/general')) return 'general';
  if (p.startsWith('/voices/')) return 'voices';
  if (p.startsWith('/notifications')) return 'notifications';
  if (p.startsWith('/account')) return 'account';
  return 'home';
}

function WorkforceShell() {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery(desktopQuery);
  const [moreOpen, setMoreOpen] = useState(false);
  if (!session) return null;
  const caps = capabilityFor(session);
  const current = resolveCurrent(location.pathname, caps.isUnion);
  const iconFor = (id: string) => {
    const Icon =
      {
        home: caps.isUnion ? ShieldCheck : Home,
        private: Lock,
        general: ScrollText,
        'work-items': Inbox,
        create: Plus,
        history: ClipboardList,
        notifications: Bell,
        account: UserRound,
        more: MoreHorizontal,
      }[id] ?? Home;
    return <Icon size={20} />;
  };
  const withIcons = (desktop: boolean) =>
    navigationForCapabilities(session.capabilities, desktop).map((item) => ({
      ...item,
      icon: iconFor(item.id),
    }));
  const desktopNav = withIcons(true);
  const bottomNav = withIcons(false);

  // The reference home leads with the hero identity, so the chrome topbar yields on mobile.
  const showTopbar = !(!isDesktop && current === 'home');

  return (
    <AppShell
      density="roomy"
      {...(showTopbar
        ? {
            topbar: (
              <div className="workforce-topbar">
                <div className="brand-lockup">
                  <span>C</span>
                  <strong>CARE</strong>
                </div>
                <div>
                  <Avatar name={session.account.displayName} />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void logout().then(() => navigate('/login'))}
                  >
                    Keluar
                  </Button>
                </div>
              </div>
            ),
          }
        : {})}
      {...(isDesktop
        ? {
            sidebar: (
              <Sidebar
                items={desktopNav}
                current={current}
                onNavigate={(id) => void navigate(NAV_ROUTES[id] ?? '/')}
                header={
                  <div className="workforce-sidebar-brand">
                    <Bot size={22} />
                    <span>
                      <strong>CARE</strong>
                      <small>Member Voice</small>
                    </span>
                  </div>
                }
                footer={
                  <Stack gap="sm">
                    <Button variant="ghost" size="sm" onClick={() => void navigate('/account')}>
                      Akun Saya
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void logout().then(() => navigate('/login'))}
                    >
                      Keluar
                    </Button>
                  </Stack>
                }
              />
            ),
          }
        : {
            bottomNav: (
              <BottomNav
                items={bottomNav}
                current={
                  moreOpen || ['notifications', 'account'].includes(current) ? 'more' : current
                }
                onNavigate={(id) => {
                  if (id === 'more') setMoreOpen(true);
                  else void navigate(NAV_ROUTES[id] ?? '/');
                }}
              />
            ),
          })}
    >
      <Outlet />
      {!isDesktop && !caps.isUnion ? (
        <Dialog
          open={moreOpen}
          onOpenChange={setMoreOpen}
          title="Lainnya"
          description="Notifikasi dan pengaturan akun CARE."
          mobileSheet
        >
          <div className="more-menu">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                void navigate('/notifications');
              }}
            >
              <Bell size={20} />
              <span>
                <strong>Notifikasi</strong>
                <small>Lihat pembaruan Voice terbaru</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                void navigate('/account');
              }}
            >
              <UserRound size={20} />
              <span>
                <strong>Akun</strong>
                <small>Profil, akses, dan keamanan</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        </Dialog>
      ) : null}
    </AppShell>
  );
}
