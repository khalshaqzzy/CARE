import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, DataTable, Dialog, Input, Stack, Textarea } from '@care/ui';
import { useMemo, useState } from 'react';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type DivisionAdminList } from '../../admin-api';

type Row = DivisionAdminList[number];

function lastLogin(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Belum pernah';
}

/** CARE Admin: one Division Admin account per division. */
export function DivisionAdminsPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const key = careQueryKey(session?.sessionId ?? 'anon', 'division-admins');
  const [target, setTarget] = useState<Row | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('');
  const [operationKey, setOperationKey] = useState('');
  const [created, setCreated] = useState<string | null>(null);

  const q = useQuery({ queryKey: key, queryFn: api.divisionAdmins, enabled: !!session });
  const save = useMutation({
    mutationFn: () =>
      api.setDivisionAdmin(
        {
          directorate: target!.directorate,
          division: target!.division,
          username,
          displayName,
          reason,
          expectedCurrentAccountId: target!.account?.id ?? null,
        },
        operationKey,
      ),
    onSuccess: () => {
      setCreated(username.toLocaleLowerCase('en-US'));
      setTarget(null);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const begin = (row: Row) => {
    setTarget(row);
    setUsername('');
    setDisplayName(`Admin ${row.division}`);
    setReason('');
    setOperationKey(crypto.randomUUID());
    setCreated(null);
    save.reset();
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Akun"
        title="Admin Divisi"
        description="Satu akun per divisi. Hanya melihat dan mengunduh Voice divisinya."
      />
      {created ? (
        <Alert tone="success" title="Akun dibuat">
          Username <strong>{created}</strong>, password sementara sama dengan username.
        </Alert>
      ) : null}
      {q.isLoading ? (
        <AdminSkeleton lines={4} label="Memuat admin divisi" />
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card" aria-label="Admin divisi">
          <DataTable
            caption="Admin per divisi"
            columns={[
              {
                key: 'division',
                header: 'Divisi',
                cell: (r: Row) => <strong>{r.division}</strong>,
              },
              { key: 'directorate', header: 'Direktorat', cell: (r: Row) => r.directorate },
              {
                key: 'account',
                header: 'Admin',
                cell: (r: Row) =>
                  r.account ? (
                    <span>
                      {r.account.displayName}{' '}
                      <span className="admin-id admin-nums">{r.account.username}</span>
                    </span>
                  ) : (
                    <span className="admin-meta--xs">Belum ada</span>
                  ),
              },
              {
                key: 'login',
                header: 'Login terakhir',
                cell: (r: Row) =>
                  r.account ? (
                    r.account.lastLoginAt ? (
                      lastLogin(r.account.lastLoginAt)
                    ) : (
                      <span className="admin-meta--xs">Belum pernah</span>
                    )
                  ) : (
                    '–'
                  ),
              },
              {
                key: 'action',
                header: '',
                cell: (r: Row) => (
                  <Button
                    size="sm"
                    variant={r.account ? 'ghost' : 'secondary'}
                    onClick={() => begin(r)}
                  >
                    {r.account ? 'Ganti' : 'Buat akun'}
                  </Button>
                ),
              },
            ]}
            rows={(q.data ?? []) as never}
            rowKey={(r: Row) => `${r.directorate}|${r.division}`}
            empty={
              <AdminEmpty title="Belum ada divisi" description="Impor data organisasi dulu." />
            }
          />
        </section>
      )}
      <Dialog
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
        title={target ? `Admin ${target.division}` : 'Admin divisi'}
        description={
          target?.account
            ? `Akun ${target.account.username} akan dinonaktifkan.`
            : 'Password sementara sama dengan username.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Batal
            </Button>
            <Button
              loading={save.isPending}
              disabled={!username.trim() || !displayName.trim() || !reason.trim()}
              onClick={() => save.mutate()}
            >
              Simpan
            </Button>
          </>
        }
      >
        <Stack gap="sm">
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="admin.divisi"
          />
          <Input
            label="Nama"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Textarea label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />
          {save.error ? (
            <Alert tone="danger" title="Gagal">
              {String((save.error as Error).message)}
            </Alert>
          ) : null}
        </Stack>
      </Dialog>
    </Stack>
  );
}
