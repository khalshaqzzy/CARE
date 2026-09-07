import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  DataTable,
  Dialog,
  Drawer,
  Input,
  Pagination,
  Select,
  Stack,
  Textarea,
} from '@care/ui';
import { CheckCircle2, ChevronRight, CircleAlert, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminFilterBar } from '../../components/AdminFilterBar';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type Account } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

function orgContext(account: Account): string {
  const membership = account.employee?.memberships?.[0];
  if (!membership) return '—';
  const unit = membership.organizationUnit;
  return `${unit.division} — ${unit.department}`;
}

function kindTone(kind: string): 'info' | 'neutral' {
  return kind === 'CARE_ADMIN' ? 'info' : 'neutral';
}

export function AccountsPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const kind = searchParams.get('kind') ?? '';
  const status = searchParams.get('status') ?? '';
  const pagination = cursorPagination(searchParams, setSearchParams);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<'reset' | 'deactivate' | 'activate' | null>(
    null,
  );
  const [operationKey, setOperationKey] = useState<string | null>(null);

  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'accounts',
      search,
      kind,
      status,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.accounts({
        limit: 20,
        search: search || undefined,
        kind: kind || undefined,
        status: status || undefined,
        cursor: pagination.cursor,
      }),
    enabled: !!session,
  });

  const detailQuery = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'accounts',
      'detail',
      selectedId ?? 'none',
    ),
    queryFn: () => api.account(selectedId!),
    enabled: !!session && !!selectedId,
  });
  const detail = detailQuery.data ?? null;

  const reset = useMutation({
    mutationFn: ({ id, key }: { id: string; key: string }) => api.resetPassword(id, key),
    onSuccess: () => {
      setConfirmAction(null);
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts'),
      });
    },
  });

  const setStatus = useMutation({
    mutationFn: ({
      id,
      st,
      version,
      key,
    }: {
      id: string;
      st: 'ACTIVE' | 'INACTIVE';
      version: number;
      key: string;
    }) => api.setAccountStatus(id, { status: st, reason, expectedVersion: version }, key),
    onSuccess: () => {
      setConfirmAction(null);
      setReason('');
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts'),
      });
    },
  });

  const updateParam = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete('cursor');
    params.delete('cursorHistory');
    if (value) params.set(name, value);
    else params.delete(name);
    setSearchParams(params);
  };
  const filtersActive = Boolean(search || kind || status);

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Akun"
        title="Accounts"
        description="Kelola workflow dan Union. CARE Admin hanya read-only di sini."
        badge={
          <span className="admin-pill" data-tone="neutral">
            <Lock size={12} aria-hidden="true" /> Hanya baca
          </span>
        }
      />

      <AdminFilterBar
        controls={
          <>
            <Input
              label="Cari akun"
              value={search}
              onChange={(e) => updateParam('search', e.target.value)}
              placeholder="Username / nama / noReg"
            />
            <Select
              label="Jenis akun"
              value={kind || 'ALL'}
              onValueChange={(v) => updateParam('kind', v === 'ALL' ? '' : v)}
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
              onValueChange={(v) => updateParam('status', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'ACTIVE', label: 'Aktif' },
                { value: 'LEGACY_HANDLER', label: 'Legacy' },
                { value: 'INACTIVE', label: 'Nonaktif' },
              ]}
            />
          </>
        }
        {...(q.data
          ? {
              resultCount: `Menampilkan 1–${q.data.items.length} dari ${q.data.items.length}${q.data.nextCursor ? '+' : ''} akun`,
            }
          : {})}
        {...(filtersActive ? { onReset: () => setSearchParams({}) } : {})}
      />

      {q.isLoading ? (
        <section className="admin-table-card" aria-label="Memuat akun">
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={4} label="Memuat akun" />
          </div>
        </section>
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card admin-card--lift" aria-label="Daftar akun">
          <DataTable
            caption="Daftar akun workforce dan Union"
            columns={[
              {
                key: 'username',
                header: 'Username / Nama',
                cell: (r: Account) => <span className="admin-id admin-nums">{r.username}</span>,
              },
              { key: 'displayName', header: 'Nama', cell: (r: Account) => r.displayName },
              {
                key: 'kind',
                header: 'Jenis akun',
                cell: (r: Account) => <Badge tone={kindTone(r.accountKind)}>{r.accountKind}</Badge>,
              },
              {
                key: 'org',
                header: 'Konteks organisasi',
                cell: (r: Account) => orgContext(r),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (r: Account) => (
                  <span
                    className="admin-pill"
                    data-tone={r.status === 'ACTIVE' ? 'success' : 'warning'}
                  >
                    {r.status === 'ACTIVE' ? (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    ) : (
                      <CircleAlert size={12} aria-hidden="true" />
                    )}{' '}
                    {r.status === 'ACTIVE'
                      ? 'AKTIF'
                      : r.status === 'INACTIVE'
                        ? 'NONAKTIF'
                        : r.status}
                  </span>
                ),
              },
              {
                key: 'route',
                header: 'Dependensi rute',
                cell: (r: Account) => (
                  <span className="admin-meta--xs">
                    {r.employee?.memberships?.[0]?.structuralPosition ?? '—'}
                  </span>
                ),
              },
              {
                key: 'action',
                header: '',
                cell: (r: Account) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Detail ${r.username}`}
                    onClick={() => {
                      setSelectedId(r.id);
                      setDrawerOpen(true);
                    }}
                  >
                    <ChevronRight size={16} />
                  </Button>
                ),
              },
            ]}
            rows={(q.data?.items ?? []) as never}
            rowKey={(r: Account) => r.id}
            empty={
              <AdminEmpty title="Tidak ada akun" description="Belum ada akun pada filter aktif." />
            }
          />
          <div className="admin-table-foot">
            <span>{q.data?.nextCursor ? 'Ada halaman berikutnya' : 'Akhir daftar'}</span>
            <Pagination
              page={pagination.page}
              pageCount={pagination.page + (q.data?.nextCursor ? 1 : 0)}
              onPageChange={(page) => {
                if (page < pagination.page) pagination.previous();
                else if (q.data?.nextCursor) pagination.next(q.data.nextCursor);
              }}
            />
          </div>
        </section>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={detail?.displayName ?? 'Detail akun'}
        description={detail?.username ?? ''}
      >
        {detail ? (
          <Stack gap="md">
            <div className="admin-identity">
              <span className="admin-kpi__icon" data-tone="brand" aria-hidden="true">
                <Avatar name={detail.displayName || detail.username} size="md" />
              </span>
              <div>
                <strong>{detail.displayName || detail.username}</strong>
                <p className="admin-meta--xs">
                  Kind: {detail.accountKind} • Status: {detail.status}
                </p>
              </div>
            </div>
            {detail.employee ? (
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">NoReg</span>
                  <span className="admin-kv__value">{detail.employee.noReg}</span>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">Posisi</span>
                  <span className="admin-kv__value">
                    {detail.employee.memberships[0]?.structuralPosition ?? '-'}
                  </span>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">Unit</span>
                  <span className="admin-kv__value">
                    {detail.employee.memberships[0]?.organizationUnit.division ?? '-'} /{' '}
                    {detail.employee.memberships[0]?.organizationUnit.department ?? '-'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="admin-meta--xs">Tidak ada employee snapshot</p>
            )}
            {detail.accountKind === 'CARE_ADMIN' ? (
              <Alert tone="info" title="Read-only">
                Akun CARE Admin tidak dapat direset/dinonaktifkan via UI ini.
              </Alert>
            ) : null}
            {detail.accountKind !== 'CARE_ADMIN' ? (
              <Stack gap="sm">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setOperationKey(crypto.randomUUID());
                    setConfirmAction('reset');
                  }}
                >
                  Reset password (sementara = noReg/username)
                </Button>
                {detail.status === 'ACTIVE' || detail.status === 'LEGACY_HANDLER' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOperationKey(crypto.randomUUID());
                      setConfirmAction('deactivate');
                    }}
                  >
                    Nonaktifkan
                  </Button>
                ) : null}
                {detail.status === 'INACTIVE' ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setOperationKey(crypto.randomUUID());
                      setConfirmAction('activate');
                    }}
                  >
                    Aktifkan
                  </Button>
                ) : null}
              </Stack>
            ) : null}
          </Stack>
        ) : (
          <AdminSkeleton lines={3} label="Memuat detail akun" />
        )}
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
            <Button
              loading={reset.isPending}
              onClick={() =>
                detail && operationKey && reset.mutate({ id: detail.id, key: operationKey })
              }
            >
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
                  version: detail.version,
                  key: operationKey!,
                })
              }
              disabled={!reason.trim() || !operationKey}
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
