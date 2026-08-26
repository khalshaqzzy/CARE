import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  Drawer,
  Input,
  Loader,
  PageHeader,
  Select,
  Stack,
  Pagination,
} from '@care/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type VoiceItem = {
  id: string;
  displayId: string;
  visibility: string;
  area: string;
  title: string;
  severity: string;
  status: string;
  updatedAt: string;
  category?: string | null;
};

export function VoiceExplorerPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const visibility = searchParams.get('visibility') ?? '';
  const severity = searchParams.get('severity') ?? '';
  const cursor = searchParams.get('cursor') ?? undefined;
  const [selected, setSelected] = useState<VoiceItem | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'voices',
      search,
      status,
      visibility,
      severity,
      cursor ?? 'first',
    ),
    queryFn: async () => {
      const qs = new URLSearchParams({
        limit: '20',
        ...(search ? { search } : {}),
        ...(status ? { status } : {}),
        ...(visibility ? { visibility } : {}),
        ...(severity ? { severity } : {}),
        ...(cursor ? { cursor } : {}),
        sort: 'updatedAt',
      });
      const res = await fetch(`/api/v1/voices?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Gagal memuat voices');
      const j = await res.json();
      if (Array.isArray(j.items)) return j as { items: VoiceItem[]; nextCursor: string | null };
      return { items: j.items as VoiceItem[], nextCursor: j.nextCursor as string | null };
    },
    enabled: !!session,
  });

  async function openDetail(v: VoiceItem) {
    setSelected(v);
    setOpen(true);
    const res = await fetch(`/api/v1/voices/${v.id}`, { credentials: 'include' });
    if (res.ok) setDetail(await res.json());
    else setDetail({ error: 'Gagal memuat detail' });
  }

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Explorer"
        title="Voice Explorer"
        description="Read-only untuk seluruh General dan Private. Akses Private diaudit."
      />
      <Alert tone="warning" title="Akses Private diaudit">
        Setiap akses detail Private dicatat sebagai audit event teredaksi. Mutasi Voice oleh Admin
        ditolak.
      </Alert>
      <Card>
        <Stack gap="sm">
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Input
              label="Search ID/Judul"
              value={search}
              onChange={(e) =>
                setSearchParams({
                  ...(e.target.value ? { search: e.target.value } : {}),
                  ...(status ? { status } : {}),
                  ...(visibility ? { visibility } : {}),
                  ...(severity ? { severity } : {}),
                })
              }
              placeholder="CARE-2026 atau judul"
            />
            <Select
              label="Status"
              value={status || 'ALL'}
              onValueChange={(v) =>
                setSearchParams({
                  ...(search ? { search } : {}),
                  ...(v !== 'ALL' ? { status: v } : {}),
                  ...(visibility ? { visibility } : {}),
                  ...(severity ? { severity } : {}),
                })
              }
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'OPEN', label: 'OPEN' },
                { value: 'IN_VERIFICATION', label: 'In Verification' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
            />
            <Select
              label="Visibility"
              value={visibility || 'ALL'}
              onValueChange={(v) =>
                setSearchParams({
                  ...(search ? { search } : {}),
                  ...(status ? { status } : {}),
                  ...(v !== 'ALL' ? { visibility: v } : {}),
                  ...(severity ? { severity } : {}),
                })
              }
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'GENERAL', label: 'General' },
                { value: 'PRIVATE', label: 'Private' },
              ]}
            />
            <Select
              label="Severity"
              value={severity || 'ALL'}
              onValueChange={(v) =>
                setSearchParams({
                  ...(search ? { search } : {}),
                  ...(status ? { status } : {}),
                  ...(visibility ? { visibility } : {}),
                  ...(v !== 'ALL' ? { severity: v } : {}),
                })
              }
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'LOW', label: 'LOW' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
          </div>
          {q.isLoading ? (
            <Loader label="Memuat voices" />
          ) : q.error ? (
            <Alert tone="danger" title="Gagal">
              {String((q.error as Error).message)}
            </Alert>
          ) : (
            <>
              <DataTable
                columns={[
                  { key: 'displayId', header: 'ID', cell: (r: VoiceItem) => r.displayId },
                  {
                    key: 'title',
                    header: 'Judul',
                    cell: (r: VoiceItem) => (
                      <span
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {r.title}
                      </span>
                    ),
                  },
                  {
                    key: 'visibility',
                    header: 'Vis',
                    cell: (r: VoiceItem) => (
                      <Badge tone={r.visibility === 'PRIVATE' ? 'warning' : 'info'}>
                        {r.visibility}
                      </Badge>
                    ),
                  },
                  {
                    key: 'severity',
                    header: 'Severity',
                    cell: (r: VoiceItem) => (
                      <Badge
                        tone={
                          r.severity === 'CRITICAL'
                            ? 'danger'
                            : r.severity === 'HIGH'
                              ? 'danger'
                              : r.severity === 'MEDIUM'
                                ? 'warning'
                                : 'success'
                        }
                      >
                        {r.severity}
                      </Badge>
                    ),
                  },
                  { key: 'status', header: 'Status', cell: (r: VoiceItem) => r.status },
                  {
                    key: 'action',
                    header: '',
                    cell: (r: VoiceItem) => (
                      <button
                        onClick={() => openDetail(r)}
                        style={{ fontSize: '0.75rem', color: 'var(--action-primary)' }}
                      >
                        Detail
                      </button>
                    ),
                  },
                ]}
                rows={(q.data?.items ?? []) as never}
                rowKey={(r: VoiceItem) => r.id}
                empty={<span>Tidak ada Voice</span>}
              />
              <Pagination
                page={1}
                pageCount={q.data?.nextCursor ? 2 : 1}
                onPageChange={(p) =>
                  setSearchParams(
                    p === 2 && q.data?.nextCursor
                      ? { search, status, visibility, severity, cursor: q.data.nextCursor }
                      : { search, status, visibility, severity },
                  )
                }
              />
            </>
          )}
        </Stack>
      </Card>

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={selected?.displayId ?? 'Detail'}
        description={selected?.title ?? ''}
      >
        {detail ? (
          <Stack gap="sm">
            <pre
              style={{
                fontSize: '0.75rem',
                overflow: 'auto',
                background: 'var(--surface-subtle)',
                padding: '0.5rem',
                borderRadius: '0.5rem',
              }}
            >
              {JSON.stringify(detail, null, 2)}
            </pre>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Reporter untuk Private menampilkan identitas lengkap immutable (noReg, nama,
              directorate, division, department, section, posisi). Tidak ada kontrol aksi.
            </p>
          </Stack>
        ) : (
          <Loader label="Memuat detail" />
        )}
      </Drawer>
    </Stack>
  );
}
