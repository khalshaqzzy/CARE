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
  PageHeader,
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
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

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
      />
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
        <div className="admin-brand">
          CARE <span>Admin</span>
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

function AdminShell() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  if (!session) return null;
  const items = [
    { id: 'overview', label: 'Overview', icon: <CircleGauge size={19} /> },
    { id: 'imports', label: 'Import & Master Data', icon: <Archive size={19} />, disabled: true },
    {
      id: 'remediation',
      label: 'Remediation & Route',
      icon: <RouteIcon size={19} />,
      disabled: true,
    },
    { id: 'union', label: 'Union Accounts', icon: <ShieldCheck size={19} />, disabled: true },
    { id: 'accounts', label: 'Accounts', icon: <UsersRound size={19} />, disabled: true },
    { id: 'voices', label: 'Voice Explorer', icon: <FileSearch size={19} />, disabled: true },
    { id: 'audit', label: 'Audit', icon: <Activity size={19} />, disabled: true },
    { id: 'system', label: 'System Status', icon: <Settings size={19} />, disabled: true },
  ];
  return (
    <AppShell
      density="compact"
      sidebar={
        <Sidebar
          items={items}
          current="overview"
          header={
            <div className="admin-sidebar-brand">
              <Building2 size={22} />
              <span>
                <strong>CARE</strong>
                <small>Admin</small>
              </span>
            </div>
          }
          footer={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void logout().then(() => navigate('/login'))}
            >
              Keluar
            </Button>
          }
        />
      }
      topbar={
        <div className="admin-topbar">
          <div>
            <strong>Operational workspace</strong>
            <Badge tone="success">Session active</Badge>
          </div>
          <div>
            <span>{session.account.displayName}</span>
            <Avatar name={session.account.displayName} size="sm" />
          </div>
        </div>
      }
    >
      <Stack gap="lg">
        <PageHeader
          eyebrow="Frontend foundation"
          title="Overview operasional"
          description="Shell Admin desktop-only, contract client, dan access boundary telah siap. Halaman operasi organisasi dimulai pada Phase 8."
        />
        <Alert tone="info" title="Admin selalu network-only">
          Tidak ada service worker, offline cache, atau persistent protected data pada aplikasi ini.
        </Alert>
        <EmptyState
          title="Data operasional belum dipasang"
          description="Phase 7 hanya menetapkan fondasi dan komponen shared. Import, remediation, Voice Explorer, audit, dan status sistem akan memakai shell ini pada Phase 8."
        />
      </Stack>
    </AppShell>
  );
}
