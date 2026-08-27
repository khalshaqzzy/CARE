import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
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
  Pagination,
  Select,
  Stack,
  Textarea,
} from '@care/ui';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createAdminApi, type Account } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

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
                          setSelectedId(r.id);
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
              <Pagination
                page={pagination.page}
                pageCount={pagination.page + (q.data?.nextCursor ? 1 : 0)}
                onPageChange={(page) => {
                  if (page < pagination.page) pagination.previous();
                  else if (q.data?.nextCursor) pagination.next(q.data.nextCursor);
                }}
              />
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
