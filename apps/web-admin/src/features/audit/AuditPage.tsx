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
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createAdminApi, type AuditEvent as Audit } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

export function AuditPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const [searchParams, setSearchParams] = useSearchParams();
  const pagination = cursorPagination(searchParams, setSearchParams);
  const action = searchParams.get('action') ?? '';
  const result = searchParams.get('result') ?? '';
  const actorKind = searchParams.get('actorKind') ?? '';
  const resourceType = searchParams.get('resourceType') ?? '';
  const correlationId = searchParams.get('correlationId') ?? '';
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'audit',
      action,
      result,
      actorKind,
      resourceType,
      correlationId,
      from,
      to,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.auditEvents({
        limit: 20,
        action: action || undefined,
        result: result || undefined,
        actorKind: actorKind || undefined,
        resourceType: resourceType || undefined,
        correlationId: correlationId || undefined,
        from: from || undefined,
        to: to || undefined,
        cursor: pagination.cursor,
      }),
    enabled: !!session,
  });
  const detailQuery = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'audit', 'detail', selectedId ?? 'none'),
    queryFn: () => api.auditEvent(selectedId!),
    enabled: !!session && !!selectedId,
  });
  const detail = detailQuery.data;
  const updateFilter = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete('cursor');
    params.delete('cursorHistory');
    if (value) params.set(name, value);
    else params.delete(name);
    setSearchParams(params);
  };

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
              onChange={(e) => updateFilter('action', e.target.value)}
              placeholder="ACCOUNT_PASSWORD_RESET"
            />
            <Select
              label="Result"
              value={result || 'ALL'}
              onValueChange={(v) => updateFilter('result', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'SUCCESS', label: 'Success' },
                { value: 'FAILED', label: 'Failed' },
              ]}
            />
            <Input
              label="Actor kind"
              value={actorKind}
              onChange={(e) => updateFilter('actorKind', e.target.value)}
            />
            <Input
              label="Resource type"
              value={resourceType}
              onChange={(e) => updateFilter('resourceType', e.target.value)}
            />
            <Input
              label="Correlation ID"
              value={correlationId}
              onChange={(e) => updateFilter('correlationId', e.target.value)}
            />
            <Input
              label="Dari"
              type="datetime-local"
              value={from}
              onChange={(e) => updateFilter('from', e.target.value)}
            />
            <Input
              label="Sampai"
              type="datetime-local"
              value={to}
              onChange={(e) => updateFilter('to', e.target.value)}
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
                          setSelectedId(r.id);
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
                page={pagination.page}
                pageCount={pagination.page + (q.data?.nextCursor ? 1 : 0)}
                onPageChange={(page) =>
                  page < pagination.page
                    ? pagination.previous()
                    : q.data?.nextCursor
                      ? pagination.next(q.data.nextCursor)
                      : undefined
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
              <div>Release: {detail.releaseSha}</div>
              <div>
                Actor snapshot: {detail.actorAccountKind ?? '-'} /{' '}
                {detail.actorStructuralPosition ?? '-'}
              </div>
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
