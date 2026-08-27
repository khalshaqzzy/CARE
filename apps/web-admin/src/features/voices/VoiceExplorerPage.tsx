import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { createAdminApi, type VoiceItem } from '../../admin-api';
import { cursorPagination } from '../../use-cursor-pagination';

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
        limit: 20,
        search: search || undefined,
        status: status || undefined,
        visibility: visibility || undefined,
        severity: severity || undefined,
        area: area || undefined,
        category: category || undefined,
        handler: handler || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="CARE-2026 atau judul"
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
                ...['SAFETY', 'ENVIRONMENT', 'FACILITY', 'WORK_DIFFICULTY'].map((value) => ({
                  value,
                  label: value,
                })),
              ]}
            />
            <Input
              label="Handler ID"
              value={handler}
              onChange={(e) => updateFilter('handler', e.target.value)}
            />
            <Input
              label="Dari"
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
                        onClick={() => {
                          setSelected(r);
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
                rowKey={(r: VoiceItem) => r.id}
                empty={<span>Tidak ada Voice</span>}
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
        title={selected?.displayId ?? 'Detail'}
        description={selected?.title ?? ''}
      >
        {detail.data ? (
          <Stack gap="sm">
            <dl>
              <dt>Status</dt>
              <dd>{detail.data.status}</dd>
              <dt>Area</dt>
              <dd>{detail.data.area}</dd>
              <dt>Kategori / severity</dt>
              <dd>
                {detail.data.category ?? '-'} / {detail.data.severity}
              </dd>
              <dt>Lokasi</dt>
              <dd>{detail.data.locationDetail}</dd>
              <dt>Detail</dt>
              <dd>{detail.data.detail}</dd>
              {detail.data.audience === 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY' ||
              detail.data.audience === 'GENERAL_RESPONDER' ? (
                <>
                  <dt>Reporter</dt>
                  <dd>
                    {detail.data.reporter.name} ({detail.data.reporter.noReg}) —{' '}
                    {detail.data.reporter.division} / {detail.data.reporter.department}
                  </dd>
                </>
              ) : null}
            </dl>
            <Card>
              <Stack gap="xs">
                <strong>Lampiran Voice</strong>
                {detail.data.attachments.length ? (
                  <ul>
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
            </Card>
            <Card>
              <Stack gap="xs">
                <strong>Timeline</strong>
                {timeline.isLoading ? (
                  <Loader label="Memuat timeline" />
                ) : timelineItems.length ? (
                  <ol>
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
                        <button
                          type="button"
                          onClick={() => void timeline.fetchNextPage()}
                          disabled={timeline.isFetching}
                        >
                          {timeline.isFetching ? 'Memuat…' : 'Muat lebih'}
                        </button>
                      </li>
                    ) : null}
                  </ol>
                ) : (
                  <span>Belum ada event.</span>
                )}
              </Stack>
            </Card>
            <Card>
              <Stack gap="xs">
                <strong>Percakapan</strong>
                {messages.isLoading ? (
                  <Loader label="Memuat percakapan" />
                ) : messageItems.length ? (
                  <ol>
                    {messageItems.map((message) => (
                      <li key={message.id}>
                        <div>
                          <strong>{message.sender.alias ?? message.sender.kind}</strong> —{' '}
                          {new Date(message.createdAt).toLocaleString('id-ID')}
                        </div>
                        <p>{message.text || '(hanya lampiran)'}</p>
                        {message.attachments.length ? (
                          <ul>
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
                        <button
                          type="button"
                          onClick={() => void messages.fetchNextPage()}
                          disabled={messages.isFetching}
                        >
                          {messages.isFetching ? 'Memuat…' : 'Muat lebih'}
                        </button>
                      </li>
                    ) : null}
                  </ol>
                ) : (
                  <span>Belum ada pesan.</span>
                )}
              </Stack>
            </Card>
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
