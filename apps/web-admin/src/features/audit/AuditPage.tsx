import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
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
          <div className="admin-toolbar">
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
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSelectedId(r.id);
                          setOpen(true);
                        }}
                      >
                        Detail
                      </Button>
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
            <div className="admin-kv">
              <div className="admin-kv__row">
                <span className="admin-kv__label">Aksi</span>
                <span className="admin-kv__value">{detail.action}</span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Hasil</span>
                <span
                  className="admin-kv__value"
                  data-tone={detail.result === 'SUCCESS' ? 'success' : 'danger'}
                >
                  {detail.result}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Resource</span>
                <span className="admin-kv__value">
                  {detail.resourceType} {detail.resourceId ?? ''}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Waktu</span>
                <span className="admin-kv__value">
                  {new Date(detail.occurredAt).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Alasan</span>
                <span className="admin-kv__value">{detail.reason ?? '-'}</span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Release</span>
                <span className="admin-kv__value">{detail.releaseSha}</span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Actor snapshot</span>
                <span className="admin-kv__value">
                  {detail.actorAccountKind ?? '-'} / {detail.actorStructuralPosition ?? '-'}
                </span>
              </div>
            </div>
            <pre className="admin-pre">{JSON.stringify(detail.summary, null, 2)}</pre>
            <p className="admin-meta--xs">
              Password, token, cookie, raw file, message body, dan identitas Private telah
              diredaksi.
            </p>
          </Stack>
        ) : null}
      </Drawer>
    </Stack>
  );
}
