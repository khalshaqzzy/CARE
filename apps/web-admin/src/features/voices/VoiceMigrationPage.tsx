import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, DataTable, Input, Pagination, Select, Stack } from '@care/ui';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminFilterBar } from '../../components/AdminFilterBar';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type VoiceItem } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';
import { ExportButton } from '../division/DivisionPages';
import { wibRange } from './VoiceSummary';

const SEVERITY_TONES: Record<string, 'danger' | 'warning' | 'success'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'success',
};

/**
 * Voices imported from earlier member-voice platforms. They are closed history,
 * so the page is a searchable list with an export and no summary.
 */
export function VoiceMigrationPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get('search') ?? '';
  const severity = searchParams.get('severity') ?? '';
  const category = searchParams.get('category') ?? '';
  const dateFrom = searchParams.get('dateFrom') ?? '';
  const dateTo = searchParams.get('dateTo') ?? '';
  const pagination = cursorPagination(searchParams, setSearchParams);
  const range = wibRange(dateFrom, dateTo);
  const query = {
    origin: 'MIGRATED' as const,
    search: search || undefined,
    severity: severity || undefined,
    category: category || undefined,
    from: range.from,
    to: range.to,
  };
  const categories = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'voices', 'category-options'),
    queryFn: () => api.generalVoiceCategories('ALL'),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });
  const q = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'voices',
      'migrated',
      query,
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.voices({ ...query, limit: 20, cursor: pagination.cursor, sort: 'newest' } as never),
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
  const active = [search, severity, category, dateFrom || dateTo].filter(Boolean).length;

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Voice"
        title="Voice Migrasi"
        description="Voice selesai dari platform sebelumnya. Hanya baca."
        badge={<ExportButton download={() => api.voiceExport(query)} />}
      />
      <AdminFilterBar
        controls={
          <>
            <Input
              label="Cari ID CARE / ID lama / judul"
              value={search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Cari"
            />
            <Select
              label="Kategori"
              value={category || 'ALL'}
              onValueChange={(v) => updateFilter('category', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                ...(categories.data ?? []).map((item) => ({ value: item.key, label: item.name })),
              ]}
            />
            <Select
              label="Severity"
              value={severity || 'ALL'}
              onValueChange={(v) => updateFilter('severity', v === 'ALL' ? '' : v)}
              options={[
                { value: 'ALL', label: 'Semua' },
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
            />
            <Input
              label="Dikirim dari"
              type="date"
              value={dateFrom}
              onChange={(e) => updateFilter('dateFrom', e.target.value)}
            />
            <Input
              label="Sampai"
              type="date"
              value={dateTo}
              onChange={(e) => updateFilter('dateTo', e.target.value)}
            />
          </>
        }
        {...(active ? { onReset: () => setSearchParams({}) } : {})}
      />
      {q.isLoading ? (
        <section className="admin-table-card" aria-label="Memuat Voice migrasi">
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={4} label="Memuat Voice migrasi" />
          </div>
        </section>
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card admin-card--lift" aria-label="Voice migrasi">
          <DataTable
            caption="Voice migrasi"
            columns={[
              {
                key: 'displayId',
                header: 'ID CARE',
                cell: (r: VoiceItem) => <span className="admin-id admin-nums">{r.displayId}</span>,
              },
              {
                key: 'legacy',
                header: 'Platform / ID lama',
                cell: (r: VoiceItem) => (
                  <span className="admin-voice-title">
                    <strong>{r.legacySource ?? '–'}</strong>
                    <span className="admin-meta--xs admin-nums">{r.legacyId ?? '–'}</span>
                  </span>
                ),
              },
              {
                key: 'title',
                header: 'Judul',
                cell: (r: VoiceItem) => (
                  <Link className="admin-clamp-2 admin-voice-link" to={`/voices/${r.id}`}>
                    {r.title}
                  </Link>
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
                cell: (r: VoiceItem) => (
                  <span className="admin-pill" data-tone={SEVERITY_TONES[r.severity] ?? 'neutral'}>
                    {r.severity}
                  </span>
                ),
              },
              {
                key: 'handler',
                header: 'PIC',
                cell: (r: VoiceItem) => r.currentHandlerName ?? '–',
              },
            ]}
            rows={(q.data?.items ?? []) as never}
            rowKey={(r: VoiceItem) => r.id}
            empty={
              <AdminEmpty
                title="Tidak ada Voice migrasi"
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
          </div>
        </section>
      )}
    </Stack>
  );
}
