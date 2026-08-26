import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  Drawer,
  Input,
  Loader,
  PageHeader,
  Select,
  Stack,
  Textarea,
} from '@care/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Account = {
  id: string;
  username: string;
  displayName: string;
  accountKind: string;
  status: string;
  employee?: {
    noReg: string;
    memberships: Array<{
      structuralPosition: string;
      organizationUnit: { division: string; department: string };
    }>;
  } | null;
};

export function AccountsPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const kind = searchParams.get('kind') ?? '';
  const status = searchParams.get('status') ?? '';
  const cursor = searchParams.get('cursor') ?? undefined;
  const [detail, setDetail] = useState<Account | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<'reset' | 'deactivate' | 'activate' | null>(
    null,
  );

  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'accounts',
      search,
      kind,
      status,
      cursor ?? 'first',
    ),
    queryFn: async () => {
      const qs = new URLSearchParams({
        limit: '20',
        ...(search ? { search } : {}),
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const res = await fetch(`/api/v1/admin/accounts?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Gagal memuat accounts');
      const j = await res.json();
      // handle both paginated and array
      if (Array.isArray(j)) return { items: j as Account[], nextCursor: null as string | null };
      return j as { items: Account[]; nextCursor: string | null };
    },
    enabled: !!session,
  });

  async function getCsrf() {
    const r = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const j = (await r.json()) as { token: string };
    return j.token;
  }

  const reset = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/v1/admin/accounts/${id}/reset-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': await getCsrf(), 'Idempotency-Key': crypto.randomUUID() },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Reset gagal');
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmAction(null);
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts'),
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, st }: { id: string; st: 'ACTIVE' | 'INACTIVE' }) => {
      const res = await fetch(`/api/v1/admin/accounts/${id}/status`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrf(),
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ status: st, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Gagal ubah status');
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmAction(null);
      setReason('');
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts'),
      });
    },
  });

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Akun"
        title="Accounts"
        description="Kelola workforce dan Union. CARE Admin hanya read-only di sini."
      />
      <Card>
        <Stack gap="sm">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Input
              label="Search"
              value={search}
              onChange={(e) =>
                setSearchParams({
                  ...(e.target.value ? { search: e.target.value } : {}),
                  ...(kind ? { kind } : {}),
                  ...(status ? { status } : {}),
                })
              }
              placeholder="Username / nama / noReg"
            />
            <Select
              label="Kind"
              value={kind || 'ALL'}
              onValueChange={(v) =>
                setSearchParams({
                  ...(search ? { search } : {}),
                  ...(v !== 'ALL' ? { kind: v } : {}),
                  ...(status ? { status } : {}),
                })
              }
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'WORKFORCE', label: 'Workforce' },
                { value: 'UNION', label: 'Union' },
                { value: 'CARE_ADMIN', label: 'Admin' },
              ]}
            />
            <Select
              label="Status"
              value={status || 'ALL'}
              onValueChange={(v) =>
                setSearchParams({
                  ...(search ? { search } : {}),
                  ...(kind ? { kind } : {}),
                  ...(v !== 'ALL' ? { status: v } : {}),
                })
              }
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'ACTIVE', label: 'ACTIVE' },
                { value: 'LEGACY_HANDLER', label: 'LEGACY' },
                { value: 'INACTIVE', label: 'INACTIVE' },
              ]}
            />
          </div>
          {q.isLoading ? (
            <Loader label="Memuat akun" />
          ) : q.error ? (
            <Alert tone="danger" title="Gagal">
              {String((q.error as Error).message)}
            </Alert>
          ) : (
            <>
              <DataTable
                columns={[
                  { key: 'username', header: 'Username', cell: (r: Account) => r.username },
                  { key: 'displayName', header: 'Nama', cell: (r: Account) => r.displayName },
                  {
                    key: 'kind',
                    header: 'Kind',
                    cell: (r: Account) => (
                      <Badge tone={r.accountKind === 'CARE_ADMIN' ? 'info' : 'neutral'}>
                        {r.accountKind}
                      </Badge>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    cell: (r: Account) => (
                      <Badge
                        tone={
                          r.status === 'ACTIVE'
                            ? 'success'
                            : r.status === 'LEGACY_HANDLER'
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {r.status}
                      </Badge>
                    ),
                  },
                  {
                    key: 'action',
                    header: 'Aksi',
                    cell: (r: Account) => (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDetail(r);
                          setDrawerOpen(true);
                        }}
                      >
                        Detail
                      </Button>
                    ),
                  },
                ]}
                rows={(q.data?.items ?? []) as never}
                rowKey={(r: Account) => r.id}
                empty={<span>Tidak ada akun</span>}
              />
              {q.data?.nextCursor ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setSearchParams({
                      ...(search ? { search } : {}),
                      ...(kind ? { kind } : {}),
                      ...(status ? { status } : {}),
                      cursor: q.data.nextCursor!,
                    })
                  }
                >
                  Muat lebih
                </Button>
              ) : null}
            </>
          )}
        </Stack>
      </Card>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={detail?.displayName ?? 'Detail akun'}
        description={detail?.username ?? ''}
      >
        {detail ? (
          <Stack gap="md">
            <div style={{ fontSize: '0.875rem' }}>
              <div>
                Kind: {detail.accountKind} • Status: {detail.status}
              </div>
              {detail.employee ? (
                <div>
                  NoReg {detail.employee.noReg} •{' '}
                  {detail.employee.memberships[0]?.structuralPosition ?? '-'} •{' '}
                  {detail.employee.memberships[0]?.organizationUnit.division ?? '-'} /{' '}
                  {detail.employee.memberships[0]?.organizationUnit.department ?? '-'}
                </div>
              ) : (
                <div>Tidak ada employee snapshot</div>
              )}
              {detail.accountKind === 'CARE_ADMIN' ? (
                <Alert tone="info" title="Read-only">
                  Akun CARE Admin tidak dapat direset/dinonaktifkan via UI ini.
                </Alert>
              ) : null}
            </div>
            {detail.accountKind !== 'CARE_ADMIN' ? (
              <Stack gap="sm">
                <Button variant="secondary" onClick={() => setConfirmAction('reset')}>
                  Reset password (sementara = noReg/username)
                </Button>
                <Button variant="secondary" onClick={() => setConfirmAction('deactivate')}>
                  Nonaktifkan
                </Button>
                <Button variant="secondary" onClick={() => setConfirmAction('activate')}>
                  Aktifkan
                </Button>
              </Stack>
            ) : null}
          </Stack>
        ) : null}
      </Drawer>

      <Dialog
        open={confirmAction === 'reset'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title="Reset password"
        description="Password sementara akan menjadi noReg (workforce) atau username (Union). Semua sesi dan push dicabut, wajib ganti password."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              Batal
            </Button>
            <Button loading={reset.isPending} onClick={() => detail && reset.mutate(detail.id)}>
              Ya, reset
            </Button>
          </>
        }
      >
        {reset.error ? (
          <Alert tone="danger" title="Gagal">
            {String((reset.error as Error).message)}
          </Alert>
        ) : null}
        {reset.isSuccess ? (
          <Alert tone="success" title="Berhasil">
            Password telah direset.
          </Alert>
        ) : null}
      </Dialog>

      <Dialog
        open={confirmAction === 'deactivate' || confirmAction === 'activate'}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={confirmAction === 'deactivate' ? 'Nonaktifkan akun' : 'Aktifkan akun'}
        description="Wajib isi alasan. Aktivasi hanya jika masih ada di snapshot aktif; Union aktif tidak dapat dinonaktifkan sebelum diganti."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmAction(null)}>
              Batal
            </Button>
            <Button
              loading={setStatus.isPending}
              onClick={() =>
                detail &&
                setStatus.mutate({
                  id: detail.id,
                  st: confirmAction === 'deactivate' ? 'INACTIVE' : 'ACTIVE',
                })
              }
            >
              Simpan
            </Button>
          </>
        }
      >
        <Stack gap="sm">
          <Textarea
            label="Alasan"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan perubahan status"
          />
          {setStatus.error ? (
            <Alert tone="danger" title="Gagal">
              {String((setStatus.error as Error).message)}
            </Alert>
          ) : null}
        </Stack>
      </Dialog>
    </Stack>
  );
}
