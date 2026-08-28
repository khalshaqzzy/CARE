import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  Input,
  Loader,
  PageHeader,
  Select,
  Stack,
  Textarea,
  Pagination,
} from '@care/ui';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createAdminApi, type RemediationList } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';
type Issue = RemediationList['items'][number];

export function RemediationPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'OPEN';
  const type = searchParams.get('type') ?? '';
  const pagination = cursorPagination(searchParams, setSearchParams);
  const [selected, setSelected] = useState<Issue | null>(null);
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [operationKey, setOperationKey] = useState('');

  const issues = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'remediation',
      status,
      type,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.remediation({ limit: 20, status, type: type || undefined, cursor: pagination.cursor }),
    enabled: !!session,
  });

  const candidates = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'candidates',
      selected?.organizationUnitId ?? 'none',
    ),
    queryFn: () => api.sectionHeads(selected!.organizationUnitId!),
    enabled: !!selected?.organizationUnitId && drawerOpen,
  });

  const assignDefault = useMutation({
    mutationFn: async () => {
      if (!selected?.organizationUnitId) throw new Error('Pilih unit');
      return api.setDefaultPic(
        selected.organizationUnitId,
        {
          accountId,
          reason,
          expectedCurrentRouteId:
            typeof selected.details.currentRouteId === 'string'
              ? selected.details.currentRouteId
              : null,
        },
        operationKey,
      );
    },
    onSuccess: () => {
      setDrawerOpen(false);
      setAccountId('');
      setReason('');
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'remediation'),
      });
    },
  });

  const assignGlobal = useMutation({
    mutationFn: () =>
      api.setGlobalPic(
        {
          accountId,
          reason,
          expectedCurrentRouteId:
            typeof selected?.details.currentRouteId === 'string'
              ? selected.details.currentRouteId
              : null,
        },
        operationKey,
      ),
    onSuccess: () => {
      setDrawerOpen(false);
      setAccountId('');
      setReason('');
      void qc.invalidateQueries({
        queryKey: careQueryKey(session?.sessionId ?? 'anon', 'remediation'),
      });
    },
  });

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Remediation"
        title="Remediation & Route"
        description="Antrian isu yang perlu tindakan: default PIC, global PIC, dan Union."
      />
      <Card>
        <Stack gap="sm">
          <div className="admin-toolbar">
            <Select
              label="Status"
              value={status}
              onValueChange={(v) => setSearchParams({ status: v, ...(type ? { type } : {}) })}
              options={[
                { value: 'OPEN', label: 'OPEN' },
                { value: 'RESOLVED', label: 'RESOLVED' },
                { value: 'SUPERSEDED', label: 'SUPERSEDED' },
              ]}
            />
            <Select
              label="Tipe"
              value={type || 'ALL'}
              onValueChange={(v) =>
                setSearchParams({ status, ...(v !== 'ALL' ? { type: v } : {}) })
              }
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'MISSING_DEPARTMENT_HEAD', label: 'Missing Head' },
                { value: 'INVALID_GLOBAL_PIC', label: 'Invalid Global' },
                { value: 'UNION_HEAD_MISSING', label: 'Union Head' },
                { value: 'UNION_OFFICER_MISSING', label: 'Union Officer' },
              ]}
            />
          </div>
          {issues.isLoading ? (
            <Loader label="Memuat remediation" />
          ) : issues.error ? (
            <Alert tone="danger" title="Gagal">
              {String((issues.error as Error).message)}
            </Alert>
          ) : (
            <DataTable
              columns={[
                {
                  key: 'type',
                  header: 'Tipe',
                  cell: (r: Issue) => <Badge tone="warning">{r.type}</Badge>,
                },
                { key: 'status', header: 'Status', cell: (r: Issue) => r.status },
                {
                  key: 'unit',
                  header: 'Unit',
                  cell: (r: Issue) => r.organizationUnitId?.slice(0, 8) ?? '-',
                },
                {
                  key: 'action',
                  header: 'Aksi',
                  cell: (r: Issue) => (
                    <Button
                      size="sm"
                      onClick={() => {
                        setSelected(r);
                        setOperationKey(crypto.randomUUID());
                        setDrawerOpen(true);
                      }}
                    >
                      Tangani
                    </Button>
                  ),
                },
              ]}
              rows={(issues.data?.items ?? []) as never}
              rowKey={(r: Issue) => r.id}
              empty={<span>Tidak ada isu</span>}
            />
          )}
          <Pagination
            page={pagination.page}
            pageCount={pagination.page + (issues.data?.nextCursor ? 1 : 0)}
            onPageChange={(page) =>
              page < pagination.page
                ? pagination.previous()
                : issues.data?.nextCursor
                  ? pagination.next(issues.data.nextCursor)
                  : undefined
            }
          />
        </Stack>
      </Card>

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Atur PIC"
        description="Pilih akun dan isi alasan."
      >
        <Stack gap="md">
          {selected?.type === 'MISSING_DEPARTMENT_HEAD' ||
          selected?.type === 'INVALID_DEFAULT_PIC' ? (
            <>
              <Input
                label="Account ID (default PIC)"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="UUID akun workforce aktif"
              />
              {candidates.data?.length ? (
                <p className="admin-meta--xs">
                  Candidates Section Head: {candidates.data.length} (read-only, tidak dapat promote)
                </p>
              ) : null}
              <Textarea
                label="Alasan"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alasan remediation"
              />
              <Button
                onClick={() => assignDefault.mutate()}
                loading={assignDefault.isPending}
                disabled={!accountId || !reason.trim()}
              >
                Simpan default PIC
              </Button>
              {assignDefault.error ? (
                <Alert tone="danger" title="Gagal">
                  {String((assignDefault.error as Error).message)}
                </Alert>
              ) : null}
            </>
          ) : null}
          {selected?.type === 'INVALID_GLOBAL_PIC' ? (
            <>
              <Input
                label="Account ID (global PIC)"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="UUID Department Head aktif"
              />
              <Textarea label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button
                onClick={() => assignGlobal.mutate()}
                loading={assignGlobal.isPending}
                disabled={!accountId || !reason.trim()}
              >
                Simpan global PIC
              </Button>
              {assignGlobal.error ? (
                <Alert tone="danger" title="Gagal">
                  {String((assignGlobal.error as Error).message)}
                </Alert>
              ) : null}
            </>
          ) : null}
          {selected?.type === 'UNION_HEAD_MISSING' || selected?.type === 'UNION_OFFICER_MISSING' ? (
            <Alert tone="info" title="Kelola melalui fixed Union slots">
              Isu ini harus diselesaikan pada halaman Union Accounts agar HEAD/OFFICER dan
              optimistic term expectation tetap benar.
              <div>
                <Button size="sm" onClick={() => navigate('/union')}>
                  Buka Union Accounts
                </Button>
              </div>
            </Alert>
          ) : null}
          {!selected ? <p>Pilih isu untuk menangani.</p> : null}
        </Stack>
      </Drawer>
    </Stack>
  );
}
