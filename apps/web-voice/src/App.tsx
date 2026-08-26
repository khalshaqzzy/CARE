import { admitsAccount, SessionGate, useAuth } from '@care/frontend-core';
import {
  Alert,
  AppShell,
  Avatar,
  BottomNav,
  Button,
  Card,
  EmptyState,
  Input,
  Loader,
  PageHeader,
  Stack,
} from '@care/ui';
import { useIsMutating } from '@tanstack/react-query';
import { Bell, ClipboardList, Home, Plus, UserRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { registerCareServiceWorker } from './register-sw.js';

export function App() {
  useEffect(() => registerCareServiceWorker(), []);
  return (
    <>
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
        />
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
        <div className="brand-mark">C</div>
        <p>CARE Enterprise Member Voice</p>
        <h1>Sampaikan suara. Pantau tindak lanjutnya.</h1>
        <p>Kanal internal untuk laporan General dan Private yang aman serta dapat ditelusuri.</p>
      </section>
      <Card variant="raised" className="auth-card">
        <Stack gap="lg">
          <div>
            <p className="care-eyebrow">Masuk ke CARE</p>
            <h2>Selamat datang kembali</h2>
            <p>Gunakan nomor registrasi atau username Union Anda.</p>
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
              Masuk
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
    <main className="centered-page">
      <Card variant="raised" className="password-card">
        <Stack gap="lg">
          <div>
            <p className="care-eyebrow">Keamanan akun</p>
            <h1>Ganti password sementara</h1>
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
              label="Konfirmasi password baru"
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
    <main className="centered-page">
      <EmptyState
        title="Gunakan CARE Admin"
        description="Akun Admin tidak tersedia di aplikasi workforce. Sesi pada host ini telah diakhiri."
      />
    </main>
  );
}

function WorkforceShell() {
  const { session, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (!session) return null;
  const nav = [
    { id: 'home', label: 'Beranda', icon: <Home size={20} /> },
    { id: 'create', label: 'Buat', icon: <Plus size={20} />, disabled: true },
    { id: 'history', label: 'Riwayat', icon: <ClipboardList size={20} />, disabled: true },
    { id: 'notifications', label: 'Notifikasi', icon: <Bell size={20} />, disabled: true },
    { id: 'account', label: 'Akun', icon: <UserRound size={20} /> },
  ];
  return (
    <AppShell
      density="roomy"
      topbar={
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
      }
      bottomNav={<BottomNav items={nav} current="home" />}
    >
      <Stack gap="lg">
        <PageHeader
          eyebrow="Frontend foundation"
          title={`Selamat datang, ${session.account.displayName}`}
          description="Fondasi session, capability, PWA, dan design system telah aktif. Perjalanan Voice akan ditambahkan pada Phase berikutnya."
        />
        <Alert tone="info" title="Akses mengikuti capability backend">
          {session.capabilities.join(' · ')}
        </Alert>
        <EmptyState
          title="Belum ada perjalanan pada route ini"
          description={`Halaman ${location.pathname} belum menjadi bagian Phase 7. Design system tersedia di /design tanpa masuk navigasi produk.`}
        />
      </Stack>
    </AppShell>
  );
}
