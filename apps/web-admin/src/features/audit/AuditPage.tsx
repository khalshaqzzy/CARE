import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, DataTable, Drawer, Pagination, Input, Select, Stack } from '@care/ui';
import { Download, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type AuditEvent as Audit } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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
        limit: 10,
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
  const resetFilters = () => setSearchParams({});

  const activePills: { label: string; clear: () => void }[] = [];
  if (from || to)
    activePills.push({
      label: `Waktu: ${from ? new Date(from).toLocaleDateString('id-ID') : '…'} - ${to ? new Date(to).toLocaleDateString('id-ID') : '…'}`,
      clear: () => {
        updateFilter('from', '');
        updateFilter('to', '');
      },
    });
  if (result)
    activePills.push({ label: `Result: ${result}`, clear: () => updateFilter('result', '') });
  if (action)
    activePills.push({ label: `Action: ${action}`, clear: () => updateFilter('action', '') });
  if (actorKind)
    activePills.push({ label: `Actor: ${actorKind}`, clear: () => updateFilter('actorKind', '') });
  if (resourceType)
    activePills.push({
      label: `Resource: ${resourceType}`,
      clear: () => updateFilter('resourceType', ''),
    });
  if (correlationId)
    activePills.push({
      label: `Correlation: ${correlationId.slice(0, 8)}…`,
      clear: () => updateFilter('correlationId', ''),
    });

  const exportCsv = () => {
    const items = q.data?.items ?? [];
    const lines = [
      'waktu,action,result,actor,resource,correlationId,ringkasan',
      ...items.map((r) =>
        [
          new Date(r.occurredAt).toISOString(),
          r.action,
          r.result,
          r.actorAccountKind ?? '',
          `${r.resourceType}${r.resourceId ? `:${r.resourceId}` : ''}`,
          r.correlationId ?? '',
          JSON.stringify(r.summary ?? {}).replaceAll('"', '""'),
        ]
          .map((cell) => `"${cell}"`)
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'audit-ekspor.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Audit"
        title="Audit"
        description="Jejak audit tidak dapat diubah. Semua data disimpan secara immutable dan disanitasi untuk kepatuhan dan keamanan."
        badge={
          <span
            className="admin-meta--xs"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
          >
            <ShieldCheck size={14} aria-hidden="true" /> Immutable &amp; disanitasi
          </span>
        }
      />

      <section className="admin-filterbar" aria-label="Filter audit">
        <div
          className="admin-filterbar__controls"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}
        >
          <Select
            label="Action"
            value={action || 'ALL'}
            onValueChange={(v) => updateFilter('action', v === 'ALL' ? '' : v)}
            options={[
              { value: 'ALL', label: 'Pilih action' },
              { value: 'VOICE_PRIVATE_DETAIL_READ', label: 'VOICE_PRIVATE_DETAIL_READ' },
              { value: 'ACCOUNT_PASSWORD_RESET', label: 'ACCOUNT_PASSWORD_RESET' },
              { value: 'USER_LOGIN', label: 'USER_LOGIN' },
              { value: 'UNION_SLOT_REPLACED', label: 'UNION_SLOT_REPLACED' },
              { value: 'ACCOUNT_ACTIVATED', label: 'ACCOUNT_ACTIVATED' },
              { value: 'ACCOUNT_DEACTIVATED', label: 'ACCOUNT_DEACTIVATED' },
            ]}
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
            label="Actor"
            value={actorKind}
            onChange={(e) => updateFilter('actorKind', e.target.value)}
            placeholder="Pilih actor"
          />
          <Input
            label="Resource"
            value={resourceType}
            onChange={(e) => updateFilter('resourceType', e.target.value)}
            placeholder="Pilih resource"
          />
          <Input
            label="Correlation ID"
            value={correlationId}
            onChange={(e) => updateFilter('correlationId', e.target.value)}
            placeholder="Masukkan correlation ID"
          />
        </div>
        <div
          className="admin-filterbar__controls"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))' }}
        >
          <Select
            label="Waktu"
            value={from || to ? 'CUSTOM' : 'ALL'}
            onValueChange={(v) => {
              if (v === 'ALL') {
                updateFilter('from', '');
                updateFilter('to', '');
              } else {
                updateFilter('from', from || new Date().toISOString().slice(0, 16));
              }
            }}
            options={[
              { value: 'ALL', label: 'Semua waktu' },
              { value: 'CUSTOM', label: 'Kustom' },
            ]}
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
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Reset filter
            </Button>
            <Button size="sm" onClick={() => void q.refetch()}>
              Terapkan
            </Button>
          </div>
        </div>
        {activePills.length ? (
          <div className="admin-filterbar__meta">
            <span>Filter aktif:</span>
            {activePills.map((pill) => (
              <button
                key={pill.label}
                type="button"
                className="admin-active-pill"
                onClick={pill.clear}
                aria-label={`Hapus filter ${pill.label}`}
                style={{ cursor: 'pointer', border: 0 }}
              >
                {pill.label} <X size={12} aria-hidden="true" />
              </button>
            ))}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              Bersihkan semua
            </Button>
          </div>
        ) : null}
      </section>

      <div className="admin-table-foot">
        <p className="admin-meta" style={{ margin: 0 }}>
          Hasil: <strong>{(q.data?.items.length ?? 0).toLocaleString('id-ID')} kejadian</strong>
          {q.data?.nextCursor ? '+' : ''}
        </p>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!q.data?.items.length}>
          <Download size={14} /> Ekspor CSV
        </Button>
      </div>

      {q.isLoading ? (
        <section className="admin-table-card" aria-label="Memuat audit">
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={4} label="Memuat audit" />
          </div>
        </section>
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card admin-card--lift" aria-label="Hasil audit">
          <DataTable
            caption="Jejak audit administratif dan keamanan"
            columns={[
              {
                key: 'occurredAt',
                header: 'Waktu ↓',
                cell: (r: Audit) => (
                  <span className="admin-nums" style={{ whiteSpace: 'nowrap' }}>
                    {formatDateTime(r.occurredAt)}
                  </span>
                ),
              },
              {
                key: 'action',
                header: 'Action',
                cell: (r: Audit) => (
                  <button
                    type="button"
                    className="care-link admin-id"
                    style={{
                      fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                      fontSize: 'var(--font-size-xs)',
                    }}
                    onClick={() => {
                      setSelectedId(r.id);
                      setOpen(true);
                    }}
                  >
                    {r.action}
                  </button>
                ),
              },
              {
                key: 'result',
                header: 'Result',
                cell: (r: Audit) => (
                  <span
                    className="admin-pill"
                    data-tone={r.result === 'SUCCESS' ? 'success' : 'danger'}
                  >
                    {r.result}
                  </span>
                ),
              },
              { key: 'actor', header: 'Actor', cell: (r: Audit) => r.actorAccountKind ?? '-' },
              {
                key: 'resource',
                header: 'Resource',
                cell: (r: Audit) => {
                  const full = `${r.resourceType}${r.resourceId ? `:${r.resourceId}` : ''}`;
                  return (
                    <span
                      className="admin-nums"
                      title={full}
                    >{`${r.resourceType}${r.resourceId ? `:${r.resourceId.slice(0, 6)}` : ''}`}</span>
                  );
                },
              },
              {
                key: 'correlationId',
                header: 'Correlation ID',
                cell: (r: Audit) => (
                  <span className="admin-id admin-nums" title={r.correlationId ?? undefined}>
                    {r.correlationId ? `${r.correlationId.slice(0, 13)}…` : '—'}
                  </span>
                ),
              },
              {
                key: 'summary',
                header: 'Sanitized summary',
                cell: (r: Audit) => {
                  const summary = r.summary as Record<string, unknown> | null;
                  const raw =
                    (summary?.['message'] as string | undefined) ??
                    (summary?.['scope'] as string | undefined);
                  const text = raw ? raw.replaceAll('_', ' ') : 'Detail rekaman suara diakses';
                  return <span className="admin-clamp-2">{text}</span>;
                },
              },
            ]}
            rows={(q.data?.items ?? []) as never}
            rowKey={(r: Audit) => r.id}
            empty={
              <AdminEmpty
                title="Tidak ada audit"
                description="Belum ada kejadian audit pada filter aktif."
              />
            }
          />
          <div className="admin-table-foot">
            <span>
              Menampilkan 1–{q.data?.items.length ?? 0} dari {q.data?.items.length ?? 0}
              {q.data?.nextCursor ? '+' : ''}
            </span>
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
          </div>
        </section>
      )}

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
                <span className="admin-kv__value admin-id">{detail.action}</span>
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
                <span className="admin-kv__value admin-nums">
                  {detail.resourceType} {detail.resourceId ?? ''}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Waktu</span>
                <span className="admin-kv__value admin-nums">
                  {new Date(detail.occurredAt).toLocaleString('id-ID')}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Alasan</span>
                <span className="admin-kv__value">{detail.reason ?? '-'}</span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Release</span>
                <span className="admin-kv__value admin-id admin-nums">{detail.releaseSha}</span>
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
        ) : (
          <AdminSkeleton lines={3} label="Memuat detail audit" />
        )}
      </Drawer>
    </Stack>
  );
}
