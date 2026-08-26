import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
/* eslint-disable @typescript-eslint/no-unsafe-return */
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
} from '@care/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Issue = {
  id: string;
  type: string;
  status: string;
  organizationUnitId?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export function RemediationPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') ?? 'OPEN';
  const type = searchParams.get('type') ?? '';
  const cursor = searchParams.get('cursor') ?? undefined;
  const [selected, setSelected] = useState<Issue | null>(null);
  const [accountId, setAccountId] = useState('');
  const [reason, setReason] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const issues = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'remediation',
      status,
      type,
      cursor ?? 'first',
    ),
    queryFn: async () => {
      const q = new URLSearchParams({
        limit: '20',
        status,
        ...(type ? { type } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const res = await fetch(`/api/v1/admin/remediation-issues?${q}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Gagal memuat remediation');
      return (await res.json()) as { items: Issue[]; nextCursor: string | null };
    },
    enabled: !!session,
  });

  const candidates = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'candidates',
      selected?.organizationUnitId ?? 'none',
    ),
    queryFn: async () => {
      if (!selected?.organizationUnitId) return [];
      const res = await fetch(
        `/api/v1/admin/organization-units/${selected.organizationUnitId}/section-head-candidates`,
        { credentials: 'include' },
      );
      if (!res.ok) return [];
      return (await res.json()) as Array<{
        employeeName: string;
        employee: { account: { id: string } | null };
      }>;
    },
    enabled: !!selected?.organizationUnitId && drawerOpen,
  });

  async function getCsrf() {
    const r = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const j = (await r.json()) as { token: string };
    return j.token;
  }

  const assignDefault = useMutation({
    mutationFn: async () => {
      if (!selected?.organizationUnitId) throw new Error('Pilih unit');
      const res = await fetch(
        `/api/v1/admin/organization-units/${selected.organizationUnitId}/default-pic`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': await getCsrf(),
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ accountId, reason }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Gagal');
      }
      return res.json();
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
    mutationFn: async () => {
      const res = await fetch('/api/v1/admin/routes/global-special-pic', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrf(),
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ accountId, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Gagal');
      }
      return res.json();
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

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Remediation"
        title="Remediation & Route"
        description="Antrian isu yang perlu tindakan: default PIC, global PIC, dan Union."
      />
      <Card>
        <Stack gap="sm">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                <p style={{ fontSize: '0.75rem' }}>
                  Candidates Section Head: {candidates.data.length} (read-only, tidak dapat promote)
                </p>
              ) : null}
              <Textarea
                label="Alasan"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Alasan remediation"
              />
              <Button onClick={() => assignDefault.mutate()} loading={assignDefault.isPending}>
                Simpan default PIC
              </Button>
              {assignDefault.error ? (
                <Alert tone="danger" title="Gagal">
                  {String((assignDefault.error as Error).message)}
                </Alert>
              ) : null}
            </>
          ) : null}
          {selected?.type === 'INVALID_GLOBAL_PIC' || selected?.type === 'UNION_HEAD_MISSING' ? (
            <>
              <Input
                label="Account ID (global PIC)"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="UUID Department Head aktif"
              />
              <Textarea label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />
              <Button onClick={() => assignGlobal.mutate()} loading={assignGlobal.isPending}>
                Simpan global PIC
              </Button>
              {assignGlobal.error ? (
                <Alert tone="danger" title="Gagal">
                  {String((assignGlobal.error as Error).message)}
                </Alert>
              ) : null}
            </>
          ) : null}
          {!selected ? <p>Pilih isu untuk menangani.</p> : null}
        </Stack>
      </Drawer>
    </Stack>
  );
}
