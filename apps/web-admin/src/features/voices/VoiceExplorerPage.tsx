import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Button,
  DataTable,
  Drawer,
  Input,
  Loader,
  Pagination,
  Select,
  Stack,
} from '@care/ui';
import { Funnel, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminFilterBar } from '../../components/AdminFilterBar';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { createAdminApi, type VoiceItem } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

function severityTone(severity: string): 'danger' | 'warning' | 'success' {
  return severity === 'CRITICAL' || severity === 'HIGH'
    ? 'danger'
    : severity === 'MEDIUM'
      ? 'warning'
      : 'success';
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
  const pagination = cursorPagination(searchParams, setSearchParams);
  const [selected, setSelected] = useState<VoiceItem | null>(null);
  const [open, setOpen] = useState(false);

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
      pagination.cursor ?? 'first',
    ),
    queryFn: () =>
      api.voices({
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
  const detail = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'voices',
      'detail',
      selected?.id ?? 'none',
    ),
    queryFn: () => api.voice(selected!.id),
    enabled: !!session && !!selected && open,
  });
  const timeline = useInfiniteQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'voices',
      'timeline',
      selected?.id ?? 'none',
    ),
    queryFn: ({ pageParam }) =>
      api.voiceTimeline(selected!.id, {
        limit: 50,
        order: 'desc',
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!session && !!selected && open,
  });
  const timelineItems = timeline.data?.pages.flatMap((page) => page.items) ?? [];
  const messages = useInfiniteQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'voices',
      'messages',
      selected?.id ?? 'none',
    ),
    queryFn: ({ pageParam }) =>
      api.voiceMessages(selected!.id, {
        limit: 50,
        order: 'desc',
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!session && !!selected && open,
  });
  const messageItems = messages.data?.pages.flatMap((page) => page.items) ?? [];
  const updateFilter = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.delete('cursor');
    params.delete('cursorHistory');
    if (value) params.set(name, value);
    else params.delete(name);
    setSearchParams(params);
  };
  const activeFilters = [
    search,
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
        Setiap akses detail Private dicatat sebagai audit event teredaksi. Mutasi Voice oleh Admin
        ditolak.
      </Alert>

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
                { value: 'IN_VERIFICATION', label: 'In Verification' },
                { value: 'IN_PROGRESS', label: 'In Progress' },
                { value: 'CLOSED', label: 'Closed' },
              ]}
            />
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
        <Loader label="Memuat voices" />
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <section className="admin-table-card" aria-label="Hasil Voice">
          <DataTable
            caption="Hasil penjelajahan Voice"
            columns={[
              {
                key: 'displayId',
                header: 'ID',
                cell: (r: VoiceItem) => <span className="admin-id">{r.displayId}</span>,
              },
              {
                key: 'title',
                header: 'Judul',
                cell: (r: VoiceItem) => <span className="admin-clamp-2">{r.title}</span>,
              },
              {
                key: 'visibility',
                header: 'Visibility',
                cell: (r: VoiceItem) => (
                  <span
                    className="admin-pill"
                    data-tone={r.visibility === 'PRIVATE' ? 'warning' : 'info'}
                  >
                    {r.visibility}
                  </span>
                ),
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
              { key: 'status', header: 'Status', cell: (r: VoiceItem) => r.status },
              {
                key: 'handler',
                header: 'Handler',
                cell: (r: VoiceItem) => r.currentHandlerName ?? '–',
              },
              {
                key: 'updatedAt',
                header: 'Terakhir diperbarui',
                cell: (r: VoiceItem) =>
                  r.updatedAt ? (
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {new Date(r.updatedAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  ) : (
                    '–'
                  ),
              },
              {
                key: 'action',
                header: '',
                cell: (r: VoiceItem) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setSelected(r);
                      setOpen(true);
                    }}
                  >
                    Detail
                  </Button>
                ),
              },
            ]}
            rows={(q.data?.items ?? []) as never}
            rowKey={(r: VoiceItem) => r.id}
            empty={<span>Tidak ada Voice</span>}
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

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={selected?.displayId ?? 'Detail'}
        description={selected?.title ?? ''}
      >
        {detail.data ? (
          <Stack gap="sm">
            <dl className="admin-dl">
              <div>
                <dt>Status</dt>
                <dd>{detail.data.status}</dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd>{detail.data.area}</dd>
              </div>
              <div>
                <dt>Kategori / severity</dt>
                <dd>
                  {detail.data.category ?? '-'} / {detail.data.severity}
                </dd>
              </div>
              <div>
                <dt>Lokasi</dt>
                <dd>{detail.data.locationDetail}</dd>
              </div>
              <div>
                <dt>Detail</dt>
                <dd>{detail.data.detail}</dd>
              </div>
              {detail.data.audience === 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY' ||
              detail.data.audience === 'GENERAL_RESPONDER' ? (
                <div>
                  <dt>Reporter</dt>
                  <dd>
                    {detail.data.reporter.name} ({detail.data.reporter.noReg}) —{' '}
                    {detail.data.reporter.division} / {detail.data.reporter.department}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="admin-card">
              <Stack gap="xs">
                <strong>Lampiran Voice</strong>
                {detail.data.attachments.length ? (
                  <ul className="admin-feed">
                    {detail.data.attachments.map((attachment) => (
                      <li key={attachment.id}>
                        {attachment.state === 'READY' ? (
                          <a
                            href={`/api/v1/media/${attachment.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Buka {attachment.purpose.toLowerCase()} (
                            {Math.ceil(attachment.size / 1024)} KB)
                          </a>
                        ) : (
                          <span>
                            {attachment.purpose} — {attachment.state}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span>Tidak ada lampiran.</span>
                )}
              </Stack>
            </div>
            <div className="admin-card">
              <Stack gap="xs">
                <strong>Timeline</strong>
                {timeline.isLoading ? (
                  <Loader label="Memuat timeline" />
                ) : timelineItems.length ? (
                  <ol className="admin-feed">
                    {timelineItems.map((event) => (
                      <li key={event.id}>
                        <strong>{event.type}</strong> —{' '}
                        {new Date(event.occurredAt).toLocaleString('id-ID')}
                        {Object.keys(event.payload).length ? (
                          <div>
                            <code>{JSON.stringify(event.payload)}</code>
                          </div>
                        ) : null}
                      </li>
                    ))}
                    {timeline.hasNextPage ? (
                      <li>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void timeline.fetchNextPage()}
                          disabled={timeline.isFetching}
                        >
                          {timeline.isFetching ? 'Memuat…' : 'Muat lebih'}
                        </Button>
                      </li>
                    ) : null}
                  </ol>
                ) : (
                  <span>Belum ada event.</span>
                )}
              </Stack>
            </div>
            <div className="admin-card">
              <Stack gap="xs">
                <strong>Percakapan</strong>
                {messages.isLoading ? (
                  <Loader label="Memuat percakapan" />
                ) : messageItems.length ? (
                  <ol className="admin-feed">
                    {messageItems.map((message) => (
                      <li key={message.id}>
                        <div>
                          <strong>{message.sender.alias ?? message.sender.kind}</strong> —{' '}
                          {new Date(message.createdAt).toLocaleString('id-ID')}
                        </div>
                        <p>{message.text || '(hanya lampiran)'}</p>
                        {message.attachments.length ? (
                          <ul className="admin-feed">
                            {message.attachments.map((attachment) => (
                              <li key={attachment.id}>
                                <a
                                  href={`/api/v1/media/${attachment.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Buka lampiran ({Math.ceil(attachment.size / 1024)} KB)
                                </a>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                    {messages.hasNextPage ? (
                      <li>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void messages.fetchNextPage()}
                          disabled={messages.isFetching}
                        >
                          {messages.isFetching ? 'Memuat…' : 'Muat lebih'}
                        </Button>
                      </li>
                    ) : null}
                  </ol>
                ) : (
                  <span>Belum ada pesan.</span>
                )}
              </Stack>
            </div>
            <p className="admin-meta--xs">
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
