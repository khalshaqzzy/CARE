import { admitsAccount, SessionGate, useAuth } from '@care/frontend-core';
import {
  Alert,
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Loader,
  Sidebar,
  Stack,
} from '@care/ui';
import {
  Activity,
  Archive,
  ArchiveRestore,
  Building2,
  CircleGauge,
  FileSearch,
  LogOut,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactElement } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { OverviewPage } from './features/overview/OverviewPage';
import { ImportsPage } from './features/imports/ImportsPage';
import { RemediationPage } from './features/remediation/RemediationPage';
import { UnionPage } from './features/union/UnionPage';
import { AccountsPage } from './features/accounts/AccountsPage';
import { VoiceExplorerPage } from './features/voices/VoiceExplorerPage';
import { VoiceDetailPage } from './features/voices/VoiceDetailPage';
import { VoiceMigrationPage } from './features/voices/VoiceMigrationPage';
import { AdminHandoverDecisionPage } from './features/handovers/AdminHandoverPage';
import { AuditPage } from './features/audit/AuditPage';
import { SystemStatusPage } from './features/system/SystemStatusPage';
import { AccountPage } from './features/account/AccountPage';
import { DivisionAdminsPage } from './features/division/DivisionAdminsPage';
import { SystemSettingsPage } from './features/settings/SystemSettingsPage';
import { VoiceHubPage } from './features/voices/VoiceHubPage';
import { useHandoverCount } from './use-handover-count';
import { useDivisionOverview } from './features/division/DivisionPages';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/change-password" element={<ChangePasswordPage />} />
      <Route
        path="*"
        element={
          <SessionGate
            app="admin"
            loading={<RouteLoader />}
            unauthenticated={<Navigate to="/login" replace />}
            passwordChange={<Navigate to="/change-password" replace />}
            wrongApp={<WrongApp />}
            unavailable={<SessionUnavailable />}
          >
            <AdminShell />
          </SessionGate>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="remediation" element={<RemediationPage />} />
        <Route path="settings" element={<SystemSettingsPage />} />
        {/* Former pages, now tabs of Pengaturan Sistem and Voice Explorer. */}
        <Route path="escalation" element={<Navigate to="/settings" replace />} />
        <Route
          path="quick-replies"
          element={<Navigate to="/settings?tab=quick-replies" replace />}
        />
        <Route path="guides" element={<Navigate to="/settings?tab=guides" replace />} />
        <Route path="union" element={<UnionPage />} />
        <Route path="division-admins" element={<DivisionAdminsPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="voices" element={<VoicesPage />} />
        <Route path="voices/:id" element={<VoiceDetailPage />} />
        <Route path="voice-migrations" element={<VoiceMigrationPage />} />
        <Route
          path="category-corrections"
          element={<Navigate to="/voices?tab=corrections" replace />}
        />
        <Route path="handovers" element={<Navigate to="/voices?tab=handovers" replace />} />
        <Route path="handovers/:id" element={<AdminHandoverDecisionPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="system" element={<SystemStatusPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
const DIVISION_ADMIN_PATHS = ['/', '/voices', '/accounts', '/account'];

/** A Division Admin only has its division home, its Voices and its own account. */
function DivisionAdminGuard({ children }: { children: ReactElement }) {
  const { session } = useAuth();
  const location = useLocation();
  if (
    session?.capabilities.includes('DIVISION_ADMIN') &&
    !DIVISION_ADMIN_PATHS.includes(location.pathname) &&
    !location.pathname.startsWith('/voices/')
  )
    return <Navigate to="/" replace />;
  return children;
}

/** CARE Admin gets the Voice workspace with tabs; a Division Admin its division's Voices. */
function VoicesPage() {
  const { session } = useAuth();
  const pendingHandovers = useHandoverCount();
  return session?.capabilities.includes('DIVISION_ADMIN') ? (
    <VoiceExplorerPage />
  ) : (
    <VoiceHubPage pendingHandovers={pendingHandovers} />
  );
}

function HomePage() {
  const { session } = useAuth();
  // A Division Admin starts on its division's Voices.
  if (session?.capabilities.includes('DIVISION_ADMIN')) return <Navigate to="/voices" replace />;
  return <OverviewPage />;
}

function RouteLoader() {
  return (
    <main className="route-loader">
      <Loader label="Memeriksa sesi Admin" />
    </main>
  );
}

// A failed session check keeps the user signed in; it never sends them to login.
function SessionUnavailable() {
  const { refresh } = useAuth();
  return (
    <main className="route-loader">
      <ErrorState
        title="CARE Admin belum terhubung"
        description="Periksa koneksi Anda, lalu coba lagi."
        onRetry={() => void refresh()}
      />
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
    if (session && admitsAccount(session, 'admin'))
      void navigate(session.passwordChangeRequired ? '/change-password' : '/', { replace: true });
  }, [navigate, session]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await login(username, password);
      if (!admitsAccount(result, 'admin')) {
        await logout();
        setError('Akun workforce atau Union hanya dapat digunakan pada aplikasi CARE workforce.');
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
    <main className="admin-auth">
      <section className="admin-auth__panel">
        <div className="admin-auth__brandrow">
          <span className="admin-auth__mark" aria-hidden="true">
            <Building2 size={20} />
          </span>
          <div className="admin-brand">
            CARE <span>Admin</span>
          </div>
        </div>
        <p className="care-eyebrow admin-auth__eyebrow">Operasional dan governance</p>
        <h1>Kelola fondasi CARE dari satu workspace.</h1>
        <p>
          Import organisasi, remediation, akun, route, audit, dan status sistem menggunakan akses
          Admin yang terisolasi.
        </p>
        <ul className="admin-auth__ticks">
          <li>
            <ShieldCheck size={16} aria-hidden="true" /> Akses Admin terisolasi & diaudit
          </li>
          <li>
            <RouteIcon size={16} aria-hidden="true" /> Routing deterministik per organisasi
          </li>
          <li>
            <Activity size={16} aria-hidden="true" /> Kesehatan sistem & jejak audit live
          </li>
        </ul>
      </section>
      <Card variant="raised" className="admin-auth-card">
        <Stack gap="lg">
          <div>
            <h2>Masuk ke CARE Admin</h2>
            <p>Gunakan akun Admin bootstrap atau akun Admin aktif.</p>
          </div>
          {error ? (
            <Alert tone="danger" title="Tidak dapat masuk">
              {error}
            </Alert>
          ) : null}
          <form onSubmit={submit} className="auth-form">
            <Input
              label="Username Admin"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button type="submit" loading={pending}>
              Masuk ke Admin
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
    <main className="route-loader">
      <Card variant="raised" className="admin-password">
        <Stack gap="lg">
          <div>
            <p className="care-eyebrow">Keamanan Admin</p>
            <h1>Ganti password sementara</h1>
            <p>
              Admin bootstrap menggunakan minimum 12 karakter; kebijakan backend tetap
              authoritative.
            </p>
          </div>
          {error ? (
            <Alert tone="danger" title="Periksa password">
              {error}
            </Alert>
          ) : null}
          <form onSubmit={submit} className="auth-form">
            <Input
              label="Password saat ini"
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <Input
              label="Password baru"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={6}
              maxLength={128}
              required
            />
            <Input
              label="Konfirmasi password"
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              required
            />
            <Button type="submit" loading={pending}>
              Simpan password
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
    <main className="route-loader">
      <EmptyState
        title="Akun tidak tersedia di Admin"
        description="Sesi telah diakhiri. Gunakan aplikasi CARE workforce untuk akun workforce atau Union."
      />
    </main>
  );
}

const ADMIN_NAV_ROUTES: Record<string, string> = {
  overview: '/',
  imports: '/imports',
  remediation: '/remediation',
  settings: '/settings',
  union: '/union',
  'division-admins': '/division-admins',
  accounts: '/accounts',
  voices: '/voices',
  'voice-migrations': '/voice-migrations',
  audit: '/audit',
  system: '/system',
};

/** Menu item for a path; pages folded into another page's tabs keep their parent highlighted. */
function navItemFor(path: string) {
  const prefixes: [string, string][] = [
    ['/voice-migrations', 'voice-migrations'],
    ['/voices', 'voices'],
    ['/handovers', 'voices'],
    ['/category-corrections', 'voices'],
    ['/division-admins', 'division-admins'],
    ['/imports', 'imports'],
    ['/remediation', 'remediation'],
    ['/settings', 'settings'],
    ['/union', 'union'],
    ['/accounts', 'accounts'],
    ['/audit', 'audit'],
    ['/system', 'system'],
    ['/account', 'account'],
  ];
  return prefixes.find(([prefix]) => path.startsWith(prefix))?.[1] ?? 'overview';
}

function AdminShell() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const division = useDivisionOverview();
  const handoverCount = useHandoverCount();
  if (!session) return null;
  const divisionAdmin = session.capabilities.includes('DIVISION_ADMIN');
  const path = location.pathname;
  const current = navItemFor(path);
  const divisionItems = [
    { id: 'voices', label: 'Voice divisi', icon: <FileSearch size={19} /> },
    { id: 'accounts', label: 'Akun divisi', icon: <UsersRound size={19} /> },
  ];
  const adminItems = [
    { group: 'Ringkasan', id: 'overview', label: 'Overview', icon: <CircleGauge size={19} /> },
    {
      group: 'Voice',
      id: 'voices',
      label: 'Voice Explorer',
      icon: <FileSearch size={19} />,
      ...(handoverCount ? { badge: handoverCount } : {}),
    },
    {
      group: 'Voice',
      id: 'voice-migrations',
      label: 'Voice Migrasi',
      icon: <ArchiveRestore size={19} />,
    },
    { group: 'Akun & Akses', id: 'accounts', label: 'Akun', icon: <UsersRound size={19} /> },
    { group: 'Akun & Akses', id: 'union', label: 'Akun Komite', icon: <ShieldCheck size={19} /> },
    {
      group: 'Akun & Akses',
      id: 'division-admins',
      label: 'Admin Divisi',
      icon: <UserCog size={19} />,
    },
    { group: 'Konfigurasi', id: 'imports', label: 'Data Organisasi', icon: <Archive size={19} /> },
    {
      group: 'Konfigurasi',
      id: 'remediation',
      label: 'Route & Kategori',
      icon: <RouteIcon size={19} />,
    },
    {
      group: 'Konfigurasi',
      id: 'settings',
      label: 'Pengaturan Sistem',
      icon: <SlidersHorizontal size={19} />,
    },
    { group: 'Sistem', id: 'audit', label: 'Audit', icon: <Activity size={19} /> },
    { group: 'Sistem', id: 'system', label: 'Status Sistem', icon: <Settings size={19} /> },
  ];
  return (
    <AppShell
      density="compact"
      sidebar={
        <Sidebar
          items={divisionAdmin ? divisionItems : adminItems}
          current={current}
          onNavigate={(id) => void navigate(ADMIN_NAV_ROUTES[id] ?? '/')}
          header={
            <div className="admin-sidebar-brand">
              <span className="admin-sidebar-brand__mark" aria-hidden="true">
                <Building2 size={16} />
              </span>
              <span className="admin-sidebar-brand__text">
                <strong>CARE</strong>
                <small>Admin</small>
              </span>
            </div>
          }
          footer={
            <Stack gap="sm">
              <Button
                variant="ghost"
                size="sm"
                aria-current={current === 'account' ? 'page' : undefined}
                onClick={() => void navigate('/account')}
              >
                <UserRound size={16} /> Akun Saya
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void logout().then(() => navigate('/login'))}
              >
                <LogOut size={16} /> Keluar
              </Button>
            </Stack>
          }
        />
      }
      topbar={
        <div className="admin-topbar">
          <div className="admin-topbar__context">
            <strong>
              {divisionAdmin
                ? `Admin Divisi · ${division.data?.division ?? ''}`
                : 'Workspace operasional'}
            </strong>
            <span className="admin-topbar__divider" aria-hidden="true" />
            <Badge tone="success">
              <span className="admin-live-dot" aria-hidden="true" />
              Sesi aktif
            </Badge>
          </div>
          <div className="admin-topbar__user">
            <span className="admin-nums">{session.account.displayName}</span>
            <Avatar name={session.account.displayName} size="sm" />
          </div>
        </div>
      }
    >
      <DivisionAdminGuard>
        <Outlet />
      </DivisionAdminGuard>
    </AppShell>
  );
}
