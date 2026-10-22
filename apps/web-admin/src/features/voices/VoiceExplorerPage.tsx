import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, DataTable, Input, Pagination, Select, Stack } from '@care/ui';
import { Funnel, Lock } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminFilterBar } from '../../components/AdminFilterBar';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type VoiceItem } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';
import { remainingTime } from './voice-time';
import {
  DivisionKpis,
  DivisionSummary,
  ExportButton,
  tileParams,
  useDivisionOverview,
  type DivisionTile,
} from '../division/DivisionPages';

function severityTone(severity: string): 'danger' | 'warning' | 'success' {
  return severity === 'CRITICAL' || severity === 'HIGH'
    ? 'danger'
    : severity === 'MEDIUM'
      ? 'warning'
      : 'success';
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Terbuka',
  RESPONDED: 'Direspon',
  IN_PROGRESS: 'Diproses',
  CLOSED: 'Selesai',
};

function voiceStatusTone(status: string): 'warning' | 'info' | 'success' | 'neutral' {
  if (status === 'OPEN' || status === 'RESPONDED') return 'warning';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'CLOSED') return 'success';
  return 'neutral';
}

export function VoiceExplorerPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const status = searchParams.get('status') ?? '';
  const visibility = searchParams.get('visibility') ?? '';
  const severity = searchParams.get('severity') ?? '';
  const area = searchParams.get('area') ?? '';
  const category = searchParams.get('category') ?? '';
  const handler = searchParams.get('handler') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const statusGroup = searchParams.get('statusGroup') ?? '';
  const due = searchParams.get('due') ?? '';
  // A Division Admin reads only its division's General Voices, read-only.
  const divisionAdmin = !!session?.capabilities.includes('DIVISION_ADMIN');
  const overview = useDivisionOverview();
  const pagination = cursorPagination(searchParams, setSearchParams);

  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'voices',
      search,
      status,
      visibility,
      severity,
      area,
      category,
      handler,
      dateFrom,
      dateTo,
      statusGroup,
      due,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.voices({
        statusGroup: (statusGroup || undefined) as never,
        due: (due || undefined) as never,
        limit: 10,
        search: search || undefined,
        status: status || undefined,
        visibility: visibility || undefined,
        severity: severity || undefined,
        area: area || undefined,
        category: category || undefined,
        handler: handler || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        cursor: pagination.cursor,
        sort: 'updatedAt',
      }),
    enabled: !!session,
  });
  const updateFilter = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete('cursor');
    params.delete('cursorHistory');
    if (value) params.set(name, value);
    else params.delete(name);
    setSearchParams(params);
  };
  const exportQuery = {
    status: status || undefined,
    statusGroup: statusGroup || undefined,
    severity: severity || undefined,
    due: due || undefined,
    from: dateFrom || undefined,
    to: dateTo || undefined,
  };
  const currentTile = (
    ['open', 'responded', 'inProgress', 'closed', 'overdue', 'soon'] as DivisionTile[]
  ).find((tile) =>
    Object.entries(tileParams(tile)).every(([key, value]) => searchParams.get(key) === value),
  );
  const activeFilters = [
    search,
    statusGroup,
    due,
    status,
    visibility,
    severity,
    area,
    category,
    handler,
    dateFrom || dateTo,
  ].filter(Boolean).length;
  const dateLabel =
    dateFrom || dateTo
      ? `${dateFrom ? new Date(dateFrom).toLocaleDateString('id-ID') : '…'} - ${dateTo ? new Date(dateTo).toLocaleDateString('id-ID') : '…'}`
      : '';

  return (
    <Stack gap="lg">
      {divisionAdmin ? (
        <AdminPageHeader
          eyebrow="Admin Divisi"
          title={overview.data?.division ?? 'Voice divisi'}
          description={overview.data?.directorate ?? ''}
          badge={<ExportButton query={exportQuery} />}
        />
      ) : (
        <>
          <AdminPageHeader
            eyebrow="Voice Explorer"
            title="Voice Explorer"
            description="Jelajahi seluruh rekaman Voice dari General dan Private. Akses Private diaudit dan setiap akses tercatat."
            badge={
              <span
                className="admin-meta--xs"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
              >
                Read-only • Akses Private diaudit <Lock size={12} aria-hidden="true" />
              </span>
            }
          />
          <Alert tone="warning" title="Akses Private diaudit">
            Setiap akses detail Private dicatat sebagai audit event teredaksi. Mutasi Voice oleh
            Admin ditolak.
          </Alert>
        </>
      )}
      {divisionAdmin && overview.data ? (
        <section className="admin-card">
          <DivisionKpis
            overview={overview.data}
            current={currentTile ?? null}
            onPick={(tile) => {
              const params = new URLSearchParams(searchParams);
              for (const key of [
                'status',
                'statusGroup',
                'severity',
                'due',
                'cursor',
                'cursorHistory',
              ])
                params.delete(key);
              if (currentTile !== tile)
                for (const [key, value] of Object.entries(tileParams(tile))) params.set(key, value);
              setSearchParams(params);
            }}
          />
          <DivisionSummary overview={overview.data} />
        </section>
      ) : null}

      <AdminFilterBar
        controls={
          <>
            <Input
              label="Cari ID atau judul"
              value={search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Cari ID atau judul"
            />
            <Select
              label="Status"
              value={status || 'ALL'}
              onValueChange={(v) => updateFilter('status', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'OPEN', label: 'OPEN' },
                { value: 'RESPONDED', label: 'Direspon' },
                { value: 'IN_PROGRESS', label: 'Diproses' },
                { value: 'CLOSED', label: 'Selesai' },
              ]}
            />
            {divisionAdmin ? (
              <Select
                label="Batas waktu"
                value={due || 'ALL'}
                onValueChange={(v) => updateFilter('due', v === 'ALL' ? '' : v)}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  { value: 'OVERDUE', label: 'Terlambat' },
                  { value: 'SOON', label: '< 24 jam' },
                ]}
              />
            ) : (
              <Select
                label="Visibility"
                value={visibility || 'ALL'}
                onValueChange={(v) => updateFilter('visibility', v === 'ALL' ? '' : v)}
                options={[
                  { value: 'ALL', label: 'Semua' },
                  { value: 'GENERAL', label: 'General' },
                  { value: 'PRIVATE', label: 'Private' },
                ]}
              />
            )}
            <Select
              label="Severity"
              value={severity || 'ALL'}
              onValueChange={(v) => updateFilter('severity', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'LOW', label: 'LOW' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
            <Select
              label="Area"
              value={area || 'ALL'}
              onValueChange={(v) => updateFilter('area', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                ...['KARAWANG_1', 'KARAWANG_2', 'KARAWANG_3', 'SUNTER_1', 'SUNTER_2'].map(
                  (value) => ({ value, label: value }),
                ),
              ]}
            />
            <Select
              label="Kategori"
              value={category || 'ALL'}
              onValueChange={(v) => updateFilter('category', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                ...[
                  'SAFETY',
                  'ENVIRONMENT',
                  'FACILITY',
                  'FACILITY_REPAIR',
                  'WORK_DIFFICULTY',
                  'WELFARE',
                ].map((value) => ({
                  value,
                  label: value,
                })),
              ]}
            />
            <Input
              label="Handler"
              value={handler}
              onChange={(e) => updateFilter('handler', e.target.value)}
              placeholder="Semua"
            />
            <Input
              label="Rentang tanggal"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                updateFilter('dateFrom', e.target.value);
                if (e.target.value && !dateTo) updateFilter('dateTo', e.target.value);
              }}
            />
          </>
        }
        {...(q.data
          ? {
              resultCount: `${(q.data.items.length + (q.data.nextCursor ? 1 : 0)).toLocaleString('id-ID')} hasil ditemukan`,
            }
          : {})}
        {...(activeFilters > 0
          ? {
              activeFilterPill: (
                <span className="admin-active-pill">
                  <Funnel size={12} aria-hidden="true" /> {activeFilters} filter aktif
                  {dateLabel ? ` · ${dateLabel}` : ''}
                </span>
              ),
            }
          : {})}
        {...(activeFilters > 0 ? { onReset: () => setSearchParams({}) } : {})}
      />

      {q.isLoading ? (
        <section className="admin-table-card" aria-label="Memuat voices">
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={4} label="Memuat voices" />
          </div>
        </section>
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card admin-card--lift" aria-label="Hasil Voice">
          <DataTable
            caption="Hasil penjelajahan Voice"
            columns={[
              {
                key: 'displayId',
                header: 'ID',
                cell: (r: VoiceItem) => <span className="admin-id admin-nums">{r.displayId}</span>,
              },
              {
                key: 'title',
                header: 'Judul / Pelapor',
                cell: (r: VoiceItem) => (
                  <span className="admin-voice-title">
                    <Link className="admin-clamp-2 admin-voice-link" to={`/voices/${r.id}`}>
                      {r.title}
                    </Link>
                    <span className="admin-meta--xs">
                      {r.visibility === 'PRIVATE' ? (
                        <>
                          <Lock size={11} aria-hidden="true" /> Private ·{' '}
                        </>
                      ) : null}
                      {r.reporterName ?? r.reporterAlias ?? '–'}
                      {r.reporterDepartment ? ` · ${r.reporterDepartment}` : ''}
                    </span>
                  </span>
                ),
              },
              {
                key: 'category',
                header: 'Kategori',
                cell: (r: VoiceItem) => r.categoryNameSnapshot ?? r.category ?? '–',
              },
              {
                key: 'severity',
                header: 'Severity',
                cell: (r: VoiceItem) =>
                  r.severity ? (
                    <span className="admin-pill" data-tone={severityTone(r.severity)}>
                      {r.severity}
                    </span>
                  ) : (
                    '–'
                  ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (r: VoiceItem) => (
                  <span className="admin-pill" data-tone={voiceStatusTone(r.status)}>
                    {STATUS_LABELS[r.status] ?? r.status}
                    {r.status === 'IN_PROGRESS' && r.closureReviewState === 'REJECTED'
                      ? ' · Dibuka kembali'
                      : ''}
                  </span>
                ),
              },
              {
                key: 'handler',
                header: 'PIC',
                cell: (r: VoiceItem) => r.currentHandlerName ?? '–',
              },
              {
                key: 'remaining',
                header: 'Sisa waktu',
                cell: (r: VoiceItem) => {
                  const remaining = remainingTime(r);
                  return (
                    <span className="admin-pill" data-tone={remaining.tone}>
                      {remaining.label}
                    </span>
                  );
                },
              },
              {
                key: 'rating',
                header: 'Rating',
                cell: (r: VoiceItem) => {
                  const score = (r as { ratingScore?: number | null }).ratingScore;
                  return score ? <span className="admin-nums">★ {score}/5</span> : '–';
                },
              },
            ]}
            rows={(q.data?.items ?? []) as never}
            rowKey={(r: VoiceItem) => r.id}
            empty={
              <AdminEmpty
                title="Tidak ada Voice"
                description="Belum ada Voice pada filter aktif."
              />
            }
          />
          <div className="admin-table-foot">
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
            <Select
              label="Baris per halaman"
              value="10"
              onValueChange={() => undefined}
              options={[{ value: '10', label: '10 / halaman' }]}
            />
          </div>
        </section>
      )}
    </Stack>
  );
}
