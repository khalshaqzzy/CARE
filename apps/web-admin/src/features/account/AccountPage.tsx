import { useAuth } from '@care/frontend-core';
import { Alert, Avatar, Button, Card, Input, PageHeader, Stack } from '@care/ui';
import { useState, type FormEvent } from 'react';

export function AccountPage() {
  const { session, transport, refresh, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [pending, setPending] = useState(false);
  if (!session) return null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setError('Konfirmasi tidak sama');
      return;
    }
    setPending(true);
    setError('');
    setOk('');
    try {
      await transport.changePassword(current, next);
      await refresh();
      setOk('Password berhasil diganti');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengganti password');
    } finally {
      setPending(false);
    }
  }
  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Akun"
        title="Akun Saya"
        description="Kelola akun CARE Admin tunggal yang dikelola CLI."
      />
      <Card>
        <Stack gap="sm">
          <div className="admin-identity">
            <Avatar name={session.account.displayName || session.account.username} size="lg" />
            <div>
              <strong>{session.account.displayName || session.account.username}</strong>
              <p className="admin-meta--xs">Single credential dikelola via CLI</p>
            </div>
          </div>
          <div className="admin-kv">
            <div className="admin-kv__row">
              <span className="admin-kv__label">Username</span>
              <span className="admin-kv__value">{session.account.username}</span>
            </div>
            <div className="admin-kv__row">
              <span className="admin-kv__label">Display</span>
              <span className="admin-kv__value">{session.account.displayName}</span>
            </div>
            <div className="admin-kv__row">
              <span className="admin-kv__label">Status</span>
              <span
                className="admin-kv__value"
                data-tone={session.account.status === 'ACTIVE' ? 'success' : 'warning'}
              >
                {session.account.status}
              </span>
            </div>
          </div>
          <Alert tone="info" title="Single credential">
            CARE Admin v1 hanya satu credential CLI-managed. Tidak ada pembuatan/reset/nonaktifkan
            via UI untuk Admin.
          </Alert>
        </Stack>
      </Card>
      <Card>
        <Stack gap="md">
          <h3>Ganti password saya</h3>
          {error ? (
            <Alert tone="danger" title="Gagal">
              {error}
            </Alert>
          ) : null}
          {ok ? (
            <Alert tone="success" title="Berhasil">
              {ok}
            </Alert>
          ) : null}
          <form onSubmit={submit} className="auth-form">
            <Input
              label="Password saat ini"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
            <Input
              label="Password baru"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={12}
              required
            />
            <Input
              label="Konfirmasi"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <Button type="submit" loading={pending}>
              Simpan password
            </Button>
          </form>
          <Button variant="ghost" onClick={() => void logout()}>
            Keluar
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
