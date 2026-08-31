import { Alert, Card, EmptyState, Input, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Inbox,
  Lock,
  ScrollText,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { FilterPillRow } from '../../components/FilterPills';
import { HeroBand, HeroChip } from '../../components/HeroBand';
import { InboxVoiceCard } from '../../components/InboxVoiceCard';
import { Pager } from '../../components/Pager';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatRelative,
  STATUS_LABELS,
  SEVERITY_LABELS,
} from '../../lib/formatters';
import { activeCount, bucketValue } from '../../lib/dashboard-math';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import { useOnlineStatus } from '../../lib/use-online-status';

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
  const isManager = caps.includes('MANAGER');
  const isSectionHead = caps.includes('SECTION_HEAD') && !isManager;
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

  // Header stats stay unfiltered: the strip describes the whole queue, not the
  // active filter combination.
  const aggregate = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'monitoring'),
    queryFn: () => api.dashboardGeneral({}),
    enabled: !!session && !isUnion,
    refetchInterval: 3000,
  });

  // Union hero stats come from the private dashboard (incl. pendingAssignment).
  const privateDash = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'private'),
    queryFn: () => api.dashboardPrivate(),
    enabled: !!session && isUnion,
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
  const severityOptions = [
    { value: '', label: 'Semua' },
    ...Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
  ];
  const areaOptions = Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }));
  const categoryOptions = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <Stack gap="lg" className="monitoring-page">
      <HeroBand
        eyebrow={intro.eyebrow}
        title={intro.title}
        description={intro.description}
        updated={
          !isUnion && aggregate.data
            ? `Diperbarui ${formatRelative(aggregate.data.generatedAt)}`
            : undefined
        }
        stats={
          isUnion
            ? privateDash.data
              ? [
                  {
                    key: 'aktif',
                    icon: <Activity />,
                    value: activeCount(privateDash.data.status),
                    label: 'Aktif',
                    tone: 'brand',
                  },
                  isUnionHead
                    ? {
                        key: 'pending',
                        icon: <Clock3 />,
                        value: privateDash.data.pendingAssignment ?? 0,
                        label: 'Belum ditugaskan',
                        tone: 'brand',
                      }
                    : {
                        key: 'selesai',
                        icon: <CheckCircle2 />,
                        value: bucketValue(privateDash.data.status, 'CLOSED'),
                        label: 'Selesai',
                        tone: 'brand',
                      },
                  {
                    key: 'kritis',
                    icon: <AlertTriangle />,
                    value: bucketValue(privateDash.data.severity, 'CRITICAL'),
                    label: 'Kritis',
                    tone: 'danger',
                  },
                ]
              : []
            : aggregate.data
              ? [
                  {
                    key: 'aktif',
                    icon: <Activity />,
                    value: activeCount(aggregate.data.status),
                    label: 'Aktif',
                    tone: 'brand',
                  },
                  isManager
                    ? {
                        key: 'pending',
                        icon: <Clock3 />,
                        value: aggregate.data.pendingAssignment ?? 0,
                        label: 'Menunggu penugasan',
                        tone: 'brand',
                      }
                    : isSectionHead
                      ? {
                          key: 'verifikasi',
                          icon: <ScrollText />,
                          value: bucketValue(aggregate.data.status, 'IN_VERIFICATION'),
                          label: 'Verifikasi',
                          tone: 'brand',
                        }
                      : {
                          key: 'selesai',
                          icon: <CheckCircle2 />,
                          value: bucketValue(aggregate.data.status, 'CLOSED'),
                          label: 'Selesai',
                          tone: 'brand',
                        },
                  {
                    key: 'kritis',
                    icon: <AlertTriangle />,
                    value: bucketValue(aggregate.data.severity, 'CRITICAL'),
                    label: 'Kritis',
                    tone: 'danger',
                  },
                ]
              : []
        }
        chip={
          isUnion ? (
            <HeroChip icon={<ShieldCheck size={12} aria-hidden="true" />} label="Union Private" />
          ) : isLeadership ? (
            <HeroChip icon={<Lock size={12} aria-hidden="true" />} label="Read-only" />
          ) : undefined
        }
      />
      {offline ? (
        <Alert tone="warning" title="Anda sedang offline">
          Daftar terbaru, detail, dan seluruh tindakan memerlukan koneksi.
        </Alert>
      ) : null}

      <div className="monitoring-search">
        <Input
          label="Cari Voice"
          value={search ?? ''}
          onChange={(event) => setParam('search', event.target.value || undefined)}
          leading={<Search size={16} />}
          placeholder="Cari judul atau ID"
          hideLabel
        />
      </div>

      <FilterPillRow
        primary={[
          {
            id: 'severity',
            label: 'Prioritas',
            value: severity ?? '',
            onValueChange: (value) => setParam('severity', value || undefined),
            options: severityOptions,
          },
          {
            id: 'view',
            label: 'Status',
            value: view,
            alwaysNeutral: true,
            onValueChange: (value) => setParam('view', value),
            options: [
              { value: 'ACTIVE', label: 'Aktif' },
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
              { value: 'ALL', label: 'Semua status' },
            ],
          },
          ...(isUnion
            ? isUnionHead
              ? [
                  {
                    id: 'unassigned',
                    label: 'Penugasan',
                    value: unassignedOnly ? 'unassigned' : 'all',
                    neutralValue: 'all',
                    onValueChange: (value: string) =>
                      setParam('unassigned', value === 'unassigned' ? 'true' : undefined),
                    options: [
                      { value: 'all', label: 'Semua' },
                      { value: 'unassigned', label: 'Perlu ditugaskan' },
                    ],
                  },
                ]
              : []
            : [
                {
                  id: 'area',
                  label: 'Area',
                  value: area ?? '',
                  onValueChange: (value: string) => setParam('area', value || undefined),
                  options: areaOptions,
                },
                {
                  id: 'handler',
                  label: 'PIC',
                  value: handler ?? '',
                  onValueChange: (value: string) => setParam('handler', value || undefined),
                  options: [
                    { value: '', label: 'Semua' },
                    ...(options.data?.handlers ?? []).map((option) => ({
                      value: option.id,
                      label: option.displayName,
                    })),
                  ],
                },
              ]),
        ]}
        secondary={[
          ...(isUnion
            ? [
                {
                  id: 'area',
                  label: 'Area',
                  value: area ?? '',
                  onValueChange: (value: string) => setParam('area', value || undefined),
                  options: areaOptions,
                },
              ]
            : []),
          {
            id: 'category',
            label: 'Kategori',
            value: category ?? '',
            onValueChange: (value: string) => setParam('category', value || undefined),
            options: categoryOptions,
          },
        ]}
        onClear={clearFilters}
        sheetContent={
          <div className="filter-pills__dates">
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
          </div>
        }
      />

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
          <div className="inbox-list">
            {items.map((voice) => (
              <InboxVoiceCard
                key={voice.id}
                voice={voice}
                {...(isUnion ? { identity: { alias: voice.reporterAlias ?? null } } : {})}
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
