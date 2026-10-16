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
import { LoginSummary } from './LoginSummary';

function orgContext(account: Account): string {
  const membership = account.employee?.memberships?.[0];
  if (!membership) return '—';
  const unit = membership.organizationUnit;
  return `${unit.division} — ${unit.department}`;
}

function formatLastLogin(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
}

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

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
  const division = searchParams.get('division') ?? '';
  const department = searchParams.get('department') ?? '';
  const section = searchParams.get('section') ?? '';
  const loggedIn = searchParams.get('loggedIn') ?? '';
  // A Division Admin reads its own division's workforce accounts, read-only.
  const divisionAdmin = !!session?.capabilities.includes('DIVISION_ADMIN');
  const scoped = divisionAdmin || !!division;
  const listAccounts = (query: Parameters<typeof api.accounts>[0]) => {
    if (!divisionAdmin) return api.accounts(query);
    // The server fixes kind and division for a Division Admin.
    const rest = Object.fromEntries(
      Object.entries(query).filter(([key]) => key !== 'kind' && key !== 'division'),
    );
    return api.divisionAccounts(rest);
  };
  const summaryOf = (query: { division?: string; department?: string }) =>
    divisionAdmin
      ? api.divisionLoginSummary({ department: query.department })
      : api.loginSummary(query);
  const [exporting, setExporting] = useState(false);
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
      division,
      department,
      section,
      loggedIn,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      listAccounts({
        limit: 20,
        search: search || undefined,
        kind: kind || undefined,
        status: status || undefined,
        division: division || undefined,
        department: department || undefined,
        section: section || undefined,
        loggedIn: (loggedIn || undefined) as 'true' | 'false' | undefined,
        cursor: pagination.cursor,
      }),
    enabled: !!session,
  });

  const divisionsQuery = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts', 'divisions'),
    queryFn: () => api.organizationDivisions(),
    enabled: !!session && !divisionAdmin,
  });

  const summaryQuery = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts', 'login', division, department),
    queryFn: () =>
      summaryOf({
        ...(division ? { division } : {}),
        ...(department ? { department } : {}),
      }),
    enabled: !!session && scoped,
  });
  // Department and section options come from the summary one level up.
  const departmentsQuery = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts', 'login', division, ''),
    queryFn: () => summaryOf({ division }),
    enabled: !!session && scoped,
  });
  const departments = departmentsQuery.data?.groups.map((group) => group.name) ?? [];
  const sections = department ? (summaryQuery.data?.groups.map((group) => group.name) ?? []) : [];

  const detailQuery = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'accounts',
      'detail',
      selectedId ?? 'none',
    ),
    queryFn: () => api.account(selectedId!),
    enabled: !!session && !!selectedId && !divisionAdmin,
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

  const updateParams = (values: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    params.delete('cursor');
    params.delete('cursorHistory');
    for (const [name, value] of Object.entries(values))
      if (value) params.set(name, value);
      else params.delete(name);
    setSearchParams(params);
  };
  const updateParam = (name: string, value: string) => updateParams({ [name]: value });
  // Login counts cover active workforce accounts, so the list follows suit.
  const pickLogin = (value: string) =>
    updateParams(
      value
        ? divisionAdmin
          ? { loggedIn: value, status: status || 'ACTIVE' }
          : { loggedIn: value, kind: kind || 'WORKFORCE', status: status || 'ACTIVE' }
        : { loggedIn: '' },
    );
  const pickDivision = (value: string) =>
    updateParams({ division: value, department: '', section: '' });
  const pickGroup = (name: string) =>
    !scoped
      ? pickDivision(name)
      : !department
        ? updateParams({ department: name, section: '' })
        : updateParams({ section: name });
  const filtersActive = Boolean(search || kind || status || division || loggedIn);

  const exportNotLoggedIn = async () => {
    setExporting(true);
    try {
      const rows: Account[] = [];
      let cursor: string | undefined;
      do {
        const pageData = await listAccounts({
          limit: 100,
          kind: 'WORKFORCE',
          status: 'ACTIVE',
          loggedIn: 'false',
          division: division || undefined,
          department: department || undefined,
          section: section || undefined,
          cursor,
        });
        rows.push(...pageData.items);
        cursor = pageData.nextCursor ?? undefined;
      } while (cursor);
      const lines = [
        'noReg,nama,divisi,departemen,seksi,posisi',
        ...rows.map((row) => {
          const membership = row.employee?.memberships?.[0];
          return [
            row.employee?.noReg ?? row.username,
            row.employee?.name ?? row.displayName,
            membership?.organizationUnit.division ?? '',
            membership?.organizationUnit.department ?? '',
            membership?.section ?? '',
            membership?.structuralPosition ?? '',
          ]
            .map(csvCell)
            .join(',');
        }),
      ];
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `belum-login-${(section || department || division || 'semua').replace(/[^\w-]+/g, '-')}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow={divisionAdmin ? 'Admin Divisi' : 'Akun'}
        title={divisionAdmin ? 'Akun divisi' : 'Accounts'}
        description={
          divisionAdmin
            ? (summaryQuery.data?.division ?? '')
            : 'Kelola workflow dan Union. CARE Admin hanya read-only di sini.'
        }
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
            {divisionAdmin ? null : (
              <Select
                label="Jenis akun"
                value={kind || 'ALL'}
                onValueChange={(v) => updateParam('kind', v === 'ALL' ? '' : v)}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  { value: 'WORKFORCE', label: 'Workforce' },
                  { value: 'UNION', label: 'Union' },
                  { value: 'CARE_ADMIN', label: 'Admin' },
                  { value: 'DIVISION_ADMIN', label: 'Admin Divisi' },
                ]}
              />
            )}
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
            {divisionAdmin ? null : (
              <Select
                label="Divisi"
                value={division || 'ALL'}
                onValueChange={(v) => pickDivision(v === 'ALL' ? '' : v)}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  ...(divisionsQuery.data ?? []).map((name) => ({ value: name, label: name })),
                ]}
              />
            )}
            {scoped ? (
              <Select
                label="Departemen"
                value={department || 'ALL'}
                onValueChange={(v) =>
                  updateParams({ department: v === 'ALL' ? '' : v, section: '' })
                }
                options={[
                  { value: 'ALL', label: 'Semua' },
                  ...departments.map((name) => ({ value: name, label: name })),
                ]}
              />
            ) : null}
            {department ? (
              <Select
                label="Seksi"
                value={section || 'ALL'}
                onValueChange={(v) => updateParam('section', v === 'ALL' ? '' : v)}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  ...sections.map((name) => ({ value: name, label: name })),
                ]}
              />
            ) : null}
            <Select
              label="Login"
              value={loggedIn || 'ALL'}
              onValueChange={(v) => pickLogin(v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'true', label: 'Sudah login' },
                { value: 'false', label: 'Belum login' },
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

      {summaryQuery.data ? (
        <LoginSummary
          summary={summaryQuery.data}
          exporting={exporting}
          onExport={() => void exportNotLoggedIn()}
          onPickGroup={pickGroup}
          onPickLogin={pickLogin}
        />
      ) : null}

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
              ...(divisionAdmin
                ? []
                : [
                    {
                      key: 'username',
                      header: 'Username / Nama',
                      cell: (r: Account) => (
                        <span className="admin-id admin-nums">{r.username}</span>
                      ),
                    },
                    { key: 'displayName', header: 'Nama', cell: (r: Account) => r.displayName },
                    {
                      key: 'kind',
                      header: 'Jenis akun',
                      cell: (r: Account) => (
                        <Badge tone={kindTone(r.accountKind)}>{r.accountKind}</Badge>
                      ),
                    },
                  ]),
              ...(divisionAdmin
                ? [
                    {
                      key: 'noReg',
                      header: 'No. Reg',
                      cell: (r: Account) => (
                        <span className="admin-id admin-nums">
                          {r.employee?.noReg ?? r.username}
                        </span>
                      ),
                    },
                    {
                      key: 'name',
                      header: 'Nama',
                      cell: (r: Account) => r.employee?.name ?? r.displayName,
                    },
                    {
                      key: 'unit',
                      header: 'Departemen / Seksi',
                      cell: (r: Account) => {
                        const membership = r.employee?.memberships?.[0];
                        return membership
                          ? `${membership.organizationUnit.department} — ${membership.section ?? '–'}`
                          : '—';
                      },
                    },
                  ]
                : [
                    {
                      key: 'org',
                      header: 'Konteks organisasi',
                      cell: (r: Account) => orgContext(r),
                    },
                  ]),
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
                key: 'lastLogin',
                header: 'Login terakhir',
                cell: (r: Account) =>
                  formatLastLogin(r.lastLoginAt) ?? (
                    <span className="admin-meta--xs">Belum pernah</span>
                  ),
              },
              {
                key: 'route',
                header: divisionAdmin ? 'Posisi' : 'Dependensi rute',
                cell: (r: Account) => (
                  <span className="admin-meta--xs">
                    {r.employee?.memberships?.[0]?.structuralPosition ?? '—'}
                  </span>
                ),
              },
              ...(divisionAdmin
                ? []
                : [
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
                  ]),
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
