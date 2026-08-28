import { admitsAccount, SessionGate, useAuth } from '@care/frontend-core';
import {
  Alert,
  AppShell,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Loader,
  Sidebar,
  Stack,
} from '@care/ui';
import {
  Activity,
  Archive,
  Building2,
  CircleGauge,
  FileSearch,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { OverviewPage } from './features/overview/OverviewPage';
import { ImportsPage } from './features/imports/ImportsPage';
import { RemediationPage } from './features/remediation/RemediationPage';
import { UnionPage } from './features/union/UnionPage';
import { AccountsPage } from './features/accounts/AccountsPage';
import { VoiceExplorerPage } from './features/voices/VoiceExplorerPage';
import { AuditPage } from './features/audit/AuditPage';
import { SystemStatusPage } from './features/system/SystemStatusPage';
import { AccountPage } from './features/account/AccountPage';

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
          >
            <AdminShell />
          </SessionGate>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="imports" element={<ImportsPage />} />
        <Route path="remediation" element={<RemediationPage />} />
        <Route path="union" element={<UnionPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="voices" element={<VoiceExplorerPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="system" element={<SystemStatusPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
function RouteLoader() {
  return (
    <main className="route-loader">
      <Loader label="Memeriksa sesi Admin" />
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
      <section>
        <div className="admin-auth__brandrow">
          <span className="admin-auth__mark" aria-hidden="true">
            <Building2 size={20} />
          </span>
          <div className="admin-brand">
            CARE <span>Admin</span>
          </div>
        </div>
        <p className="care-eyebrow">Operasional dan governance</p>
        <h1>Kelola fondasi CARE dari satu workspace.</h1>
        <p>
          Import organisasi, remediation, akun, route, audit, dan status sistem menggunakan akses
          Admin yang terisolasi.
        </p>
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
  union: '/union',
  accounts: '/accounts',
  voices: '/voices',
  audit: '/audit',
  system: '/system',
};

function AdminShell() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  if (!session) return null;
  const path = location.pathname;
  const current = path.startsWith('/imports')
    ? 'imports'
    : path.startsWith('/remediation')
      ? 'remediation'
      : path.startsWith('/union')
        ? 'union'
        : path.startsWith('/accounts')
          ? 'accounts'
          : path.startsWith('/voices')
            ? 'voices'
            : path.startsWith('/audit')
              ? 'audit'
              : path.startsWith('/system')
                ? 'system'
                : path.startsWith('/account')
                  ? 'account'
                  : 'overview';
  const items = [
    {
      id: 'overview',
      label: 'Overview',
      icon: <CircleGauge size={19} />,
    },
    {
      id: 'imports',
      label: 'Import & Master Data',
      icon: <Archive size={19} />,
    },
    {
      id: 'remediation',
      label: 'Remediation & Route',
      icon: <RouteIcon size={19} />,
    },
    {
      id: 'union',
      label: 'Union Accounts',
      icon: <ShieldCheck size={19} />,
    },
    {
      id: 'accounts',
      label: 'Accounts',
      icon: <UsersRound size={19} />,
    },
    {
      id: 'voices',
      label: 'Voice Explorer',
      icon: <FileSearch size={19} />,
    },
    {
      id: 'audit',
      label: 'Audit',
      icon: <Activity size={19} />,
    },
    {
      id: 'system',
      label: 'System Status',
      icon: <Settings size={19} />,
    },
  ];
  return (
    <AppShell
      density="compact"
      sidebar={
        <Sidebar
          items={items}
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
      }
      topbar={
        <div className="admin-topbar">
          <div className="admin-topbar__context">
            <strong>Operational workspace</strong>
            <Badge tone="success">Session active</Badge>
          </div>
          <div className="admin-topbar__user">
            <span>{session.account.displayName}</span>
            <Avatar name={session.account.displayName} size="sm" />
          </div>
        </div>
      }
    >
      <Outlet />
    </AppShell>
  );
}
