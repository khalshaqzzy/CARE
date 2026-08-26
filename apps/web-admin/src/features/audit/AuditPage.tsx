import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Card,
  DataTable,
  Drawer,
  Loader,
  PageHeader,
  Stack,
  Pagination,
  Input,
  Select,
} from '@care/ui';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type Audit = {
  id: string;
  action: string;
  result: string;
  resourceType: string;
  resourceId?: string | null;
  actorAccountKind?: string | null;
  occurredAt: string;
  correlationId: string;
  reason?: string | null;
  summary: Record<string, unknown>;
};

export function AuditPage() {
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const cursor = searchParams.get('cursor') ?? undefined;
  const action = searchParams.get('action') ?? '';
  const [detail, setDetail] = useState<Audit | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'audit', action, cursor ?? 'first'),
    queryFn: async () => {
      const qs = new URLSearchParams({
        limit: '20',
        ...(action ? { action } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const res = await fetch(`/api/v1/admin/audit-events?${qs}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Gagal memuat audit');
      return (await res.json()) as { items: Audit[]; nextCursor: string | null };
    },
    enabled: !!session,
  });

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Audit"
        title="Audit"
        description="Jejak administratif dan keamanan yang telah diredaksi."
      />
      <Card>
        <Stack gap="sm">
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Input
              label="Filter action"
              value={action}
              onChange={(e) =>
                setSearchParams({ ...(e.target.value ? { action: e.target.value } : {}) })
              }
              placeholder="ACCOUNT_PASSWORD_RESET"
            />
            <Select
              label="Sort"
              value="newest"
              onValueChange={() => {}}
              options={[{ value: 'newest', label: 'Terbaru' }]}
            />
          </div>
          {q.isLoading ? (
            <Loader label="Memuat audit" />
          ) : q.error ? (
            <Alert tone="danger" title="Gagal">
              {String((q.error as Error).message)}
            </Alert>
          ) : (
            <>
              <DataTable
                columns={[
                  {
                    key: 'occurredAt',
                    header: 'Waktu',
                    cell: (r: Audit) => new Date(r.occurredAt).toLocaleString('id-ID'),
                  },
                  {
                    key: 'action',
                    header: 'Aksi',
                    cell: (r: Audit) => <Badge tone="info">{r.action}</Badge>,
                  },
                  { key: 'result', header: 'Hasil', cell: (r: Audit) => r.result },
                  {
                    key: 'resource',
                    header: 'Resource',
                    cell: (r: Audit) =>
                      `${r.resourceType}${r.resourceId ? `:${r.resourceId.slice(0, 6)}` : ''}`,
                  },
                  { key: 'actor', header: 'Actor', cell: (r: Audit) => r.actorAccountKind ?? '-' },
                  {
                    key: 'detail',
                    header: '',
                    cell: (r: Audit) => (
                      <button
                        onClick={() => {
                          setDetail(r);
                          setOpen(true);
                        }}
                        style={{ fontSize: '0.75rem', color: 'var(--action-primary)' }}
                      >
                        Detail
                      </button>
                    ),
                  },
                ]}
                rows={(q.data?.items ?? []) as never}
                rowKey={(r: Audit) => r.id}
                empty={<span>Tidak ada audit</span>}
              />
              <Pagination
                page={1}
                pageCount={q.data?.nextCursor ? 2 : 1}
                onPageChange={(p) =>
                  setSearchParams(
                    p === 2 && q.data?.nextCursor
                      ? { cursor: q.data.nextCursor, ...(action ? { action } : {}) }
                      : { ...(action ? { action } : {}) },
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
        title="Detail audit"
        description={detail?.correlationId ?? ''}
      >
        {detail ? (
          <Stack gap="sm">
            <div style={{ fontSize: '0.875rem' }}>
              <div>
                Aksi: {detail.action} • Hasil: {detail.result}
              </div>
              <div>
                Resource: {detail.resourceType} {detail.resourceId ?? ''}
              </div>
              <div>Waktu: {new Date(detail.occurredAt).toLocaleString('id-ID')}</div>
              <div>Alasan: {detail.reason ?? '-'}</div>
            </div>
            <pre
              style={{
                fontSize: '0.75rem',
                overflow: 'auto',
                background: 'var(--surface-subtle)',
                padding: '0.5rem',
                borderRadius: '0.5rem',
              }}
            >
              {JSON.stringify(detail.summary, null, 2)}
            </pre>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Password, token, cookie, raw file, message body, dan identitas Private telah
              diredaksi.
            </p>
          </Stack>
        ) : null}
      </Drawer>
    </Stack>
  );
}
