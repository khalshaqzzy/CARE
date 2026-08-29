import { Alert, Button, Card, EmptyState, Input, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, CheckCircle2, Inbox, Lock, Search } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { Pager } from '../../components/Pager';
import { VoiceCard } from '../../components/VoiceCard';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatRelative,
  STATUS_LABELS,
  SEVERITY_LABELS,
} from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import { useOnlineStatus } from '../../lib/use-online-status';
import type { DashboardAggregate } from '../../workforce-api';

const STATUS_VIEWS = new Set(['ACTIVE', 'ALL', 'OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED']);

export function WorkItemsPage() {
  const { session } = useAuth();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const nav = useCursorPagination(searchParams, setSearchParams);
  const offline = !useOnlineStatus();
  const caps = session?.capabilities ?? [];
  const isUnion = caps.some(
    (capability) => capability === 'UNION_HEAD' || capability === 'UNION_OFFICER',
  );
  const isUnionHead = caps.includes('UNION_HEAD');
  const isLeadership = caps.some((capability) =>
    ['DIVISION_LEADERSHIP', 'DIRECTOR'].includes(capability),
  );
  const isDirector = caps.includes('DIRECTOR');
  const isSectionHead = caps.includes('SECTION_HEAD') && !caps.includes('MANAGER');
  const unassignedOnly = isUnionHead && searchParams.get('unassigned') === 'true';

  const rawView = searchParams.get('view') ?? (isUnion ? 'ALL' : 'ACTIVE');
  const view = STATUS_VIEWS.has(rawView) ? rawView : 'ACTIVE';
  const status = ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'].includes(view)
    ? view
    : undefined;
  const statusGroup = status ? undefined : (view as 'ACTIVE' | 'CLOSED' | 'ALL');
  const severity = searchParams.get('severity') ?? undefined;
  const area = searchParams.get('area') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const handler = searchParams.get('handler') ?? undefined;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const search = searchParams.get('search') ?? undefined;

  const inbox = useQuery({
    queryKey: voiceQuery(
      sessionId,
      'work-items',
      isLeadership ? 'leadership' : isUnion ? 'union' : 'responder',
      status,
      statusGroup,
      severity,
      area,
      category,
      handler,
      from,
      to,
      search,
      unassignedOnly ? 'unassigned' : 'assigned-any',
      nav.cursor,
    ),
    queryFn: () => {
      const common = {
        limit: 10,
        ...(status ? { status: status as never } : {}),
        ...(statusGroup && statusGroup !== 'ALL' ? { statusGroup } : {}),
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(category ? { category: category as never } : {}),
        ...(handler ? { handler } : {}),
        ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
        ...(search ? { search } : {}),
        ...(nav.cursor ? { cursor: nav.cursor } : {}),
      };
      return isLeadership
        ? api.listVoices({ ...common, visibility: 'GENERAL', sort: 'severity' })
        : api.workItems({ ...common, ...(unassignedOnly ? { unassigned: 'true' } : {}) });
    },
    enabled: !!session,
    refetchInterval: 3000,
  });

  const aggregate = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'monitoring', severity, area, category, from, to),
    queryFn: () =>
      api.dashboardGeneral({
        ...(severity ? { severity: severity as never } : {}),
        ...(area ? { area } : {}),
        ...(category ? { category: category as never } : {}),
        ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      }),
    enabled: !!session && !isUnion,
    refetchInterval: 3000,
  });

  const options = useQuery({
    queryKey: voiceQuery(sessionId, 'monitoring-options'),
    queryFn: () => api.monitoringOptions(),
    enabled: !!session && !isUnion,
    staleTime: 60_000,
  });

  const setParam = (key: string, value: string | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('cursor');
    params.delete('cursorHistory');
    setSearchParams(params);
  };
  const clearFilters = () =>
    setSearchParams(isUnion ? new URLSearchParams() : new URLSearchParams({ view: 'ACTIVE' }));
  const items = inbox.data?.items ?? [];
  const nextCursor = inbox.data?.nextCursor ?? null;
  const intro = introFor({
    isUnion,
    isUnionHead,
    isLeadership,
    isDirector,
    isSectionHead,
    unassignedOnly,
  });
  const filterCount = [
    search,
    view !== (isUnion ? 'ALL' : 'ACTIVE') ? view : undefined,
    severity,
    area,
    category,
    handler,
    from,
    to,
    unassignedOnly ? 'yes' : undefined,
  ].filter(Boolean).length;

  return (
    <Stack gap="lg" className="monitoring-page">
      <header className="page-intro page-intro--monitoring">
        <div>
          <p className="care-eyebrow">{intro.eyebrow}</p>
          <h1>{intro.title}</h1>
          <p>{intro.description}</p>
        </div>
        {!isUnion && aggregate.data ? (
          <span className="dashboard-updated">
            Diperbarui {formatRelative(aggregate.data.generatedAt)}
          </span>
        ) : null}
      </header>
      {offline ? (
        <Alert tone="warning" title="Anda sedang offline">
          Daftar terbaru, detail, dan seluruh tindakan memerlukan koneksi.
        </Alert>
      ) : null}
      {!isUnion && aggregate.data ? <MonitoringKpis data={aggregate.data} /> : null}

      <Card className="history-filters monitoring-filters">
        <div className="history-filters__row">
          <div className="history-filters__search">
            <Input
              label="Cari Voice"
              value={search ?? ''}
              onChange={(event) => setParam('search', event.target.value || undefined)}
              leading={<Search size={16} />}
              placeholder="ID atau judul"
            />
          </div>
          <Select
            label="Status"
            value={view}
            onValueChange={(value) => setParam('view', value)}
            options={[
              { value: 'ACTIVE', label: 'Aktif' },
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
              { value: 'ALL', label: 'Semua status' },
            ]}
          />
          <Select
            label="Severity"
            value={severity ?? ''}
            onValueChange={(value) => setParam('severity', value || undefined)}
            options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Kategori"
            value={category ?? ''}
            onValueChange={(value) => setParam('category', value || undefined)}
            options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Select
            label="Area"
            value={area ?? ''}
            onValueChange={(value) => setParam('area', value || undefined)}
            options={Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }))}
          />
          {!isUnion ? (
            <Select
              label="Penanggung jawab"
              value={handler ?? ''}
              onValueChange={(value) => setParam('handler', value || undefined)}
              options={(options.data?.handlers ?? []).map((option) => ({
                value: option.id,
                label: option.displayName,
              }))}
            />
          ) : null}
          {isUnionHead ? (
            <Select
              label="Penugasan"
              value={unassignedOnly ? 'unassigned' : 'all'}
              onValueChange={(value) =>
                setParam('unassigned', value === 'unassigned' ? 'true' : undefined)
              }
              options={[
                { value: 'all', label: 'Semua' },
                { value: 'unassigned', label: 'Perlu ditugaskan' },
              ]}
            />
          ) : null}
          {!isUnion ? (
            <>
              <Input
                label="Dari tanggal"
                type="date"
                value={from ?? ''}
                onChange={(event) => setParam('from', event.target.value || undefined)}
              />
              <Input
                label="Sampai tanggal"
                type="date"
                value={to ?? ''}
                onChange={(event) => setParam('to', event.target.value || undefined)}
              />
            </>
          ) : null}
        </div>
        <div className="filter-summary">
          <span>
            {filterCount
              ? `${filterCount} filter aktif`
              : 'Menampilkan prioritas tertinggi lebih dulu'}
          </span>
          {filterCount ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Bersihkan filter
            </Button>
          ) : null}
        </div>
      </Card>

      {inbox.isLoading ? (
        <Skeleton label="Memuat daftar Voice" />
      ) : inbox.isError ? (
        <Card>
          <EmptyState
            title="Daftar gagal dimuat"
            description="Periksa koneksi lalu coba muat ulang."
          />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState {...emptyStateFor({ isUnion, isUnionHead, unassignedOnly })} />
        </Card>
      ) : (
        <Stack gap="md">
          <div className="voice-grid">
            {items.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                onOpen={() => void navigate(`/voices/${voice.id}`)}
              />
            ))}
          </div>
          <Pager
            page={nav.page}
            hasPrevious={nav.canPrevious}
            hasNext={Boolean(nextCursor)}
            onPrevious={() => nav.previous()}
            onNext={nextCursor ? () => nav.next(nextCursor) : undefined}
            loading={inbox.isFetching}
          />
        </Stack>
      )}
    </Stack>
  );
}

function MonitoringKpis({ data }: { data: DashboardAggregate }) {
  const count = (label: string) => data.status.find((bucket) => bucket.label === label)?.value ?? 0;
  const critical = data.severity.find((bucket) => bucket.label === 'CRITICAL')?.value ?? 0;
  const active = count('OPEN') + count('IN_VERIFICATION') + count('IN_PROGRESS');
  return (
    <div className="monitor-kpis" aria-label="Ringkasan Voice Member">
      <Card padding="md">
        <Activity />
        <span>
          <strong>{active}</strong>
          <small>Aktif</small>
        </span>
      </Card>
      <Card padding="md">
        <Inbox />
        <span>
          <strong>{count('IN_VERIFICATION')}</strong>
          <small>Verifikasi</small>
        </span>
      </Card>
      <Card padding="md">
        <AlertTriangle />
        <span>
          <strong>{critical}</strong>
          <small>Critical</small>
        </span>
      </Card>
      <Card padding="md">
        <CheckCircle2 />
        <span>
          <strong>{count('CLOSED')}</strong>
          <small>Selesai</small>
        </span>
      </Card>
    </div>
  );
}

function introFor({
  isUnion,
  isUnionHead,
  isLeadership,
  isDirector,
  isSectionHead,
  unassignedOnly,
}: Record<string, boolean>) {
  if (isUnion)
    return {
      eyebrow: 'Union',
      title: 'Private Voice',
      description: unassignedOnly
        ? 'Private Voice yang masih menunggu penugasan Union Officer.'
        : isUnionHead
          ? 'Seluruh Private Voice melalui Union Head, diurutkan berdasarkan severity.'
          : 'Private Voice yang ditugaskan kepada Anda untuk ditangani.',
    };
  if (isLeadership)
    return {
      eyebrow: 'Monitoring organisasi',
      title: 'Voice Member',
      description: isDirector
        ? 'Pantau seluruh General Voice secara read-only. Aggregate dan detail tetap mengikuti batas permission.'
        : 'Pantau General Voice divisi Anda secara read-only dengan overview organisasi yang aman.',
    };
  return {
    eyebrow: 'Workspace operasional',
    title: 'Voice Member',
    description: isSectionHead
      ? 'General Voice yang ditugaskan kepada Anda untuk diverifikasi dan ditangani.'
      : 'General Voice yang menjadi tanggung jawab route Anda, lengkap dengan filter dan tindakan lifecycle.',
  };
}

function emptyStateFor({ isUnion, isUnionHead, unassignedOnly }: Record<string, boolean>) {
  if (unassignedOnly)
    return {
      icon: <Lock size={24} />,
      title: 'Semua Private Voice sudah ditugaskan',
      description: 'Tidak ada Private Voice yang menunggu Union Officer.',
    };
  if (isUnionHead)
    return {
      icon: <Lock size={24} />,
      title: 'Belum ada Private Voice',
      description: 'Private Voice dari reporter akan muncul di sini.',
    };
  if (isUnion)
    return {
      icon: <Inbox size={24} />,
      title: 'Belum ada penugasan',
      description: 'Private Voice yang ditugaskan kepada Anda akan muncul di sini.',
    };
  return {
    icon: <Inbox size={24} />,
    title: 'Tidak ada Voice pada filter ini',
    description: 'Ubah filter atau rentang tanggal untuk melihat Voice lainnya.',
  };
}
