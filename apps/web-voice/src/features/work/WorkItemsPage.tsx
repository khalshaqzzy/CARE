import { Alert, Card, EmptyState, Input, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  Inbox,
  Lock,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { FilterPillRow } from '../../components/FilterPills';
import { HeroBand, HeroChip } from '../../components/HeroBand';
import { ACTION_FILTERS, ActionSummaryCard, type ActionKind } from '../home/ActionSummary';
import { InboxVoiceCard } from '../../components/InboxVoiceCard';
import { Pager } from '../../components/Pager';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatCategoryName,
  formatDate,
  PRIVATE_ROUTE_LABEL,
  STATUS_LABELS,
  SEVERITY_LABELS,
} from '../../lib/formatters';
import { activeCount, bucketValue } from '../../lib/dashboard-math';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorPagination } from '../../lib/useCursorPagination';
import { useOnlineStatus } from '../../lib/use-online-status';
import type { HandoverHistoryItem } from '../../workforce-api';

const STATUS_VIEWS = new Set(['ACTIVE', 'ALL', 'OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED']);

type ListTab = 'me' | 'unit' | 'team';
const TAB_LABELS: Record<ListTab, string> = {
  me: 'Butuh Tindakan Saya',
  unit: 'Voice Untuk Unit',
  team: 'Voice Tim Saya',
};
/**
 * The list a link opens. Links from before the tabs carry `action` for the
 * viewer's own Voices and organization or filter parameters for the unit list.
 */
function resolveTab(params: URLSearchParams, tabs: ListTab[]): ListTab {
  const raw = params.get('tab') as ListTab | null;
  if (raw && tabs.includes(raw)) return raw;
  if (params.has('action') || !tabs.includes('unit')) return 'me';
  return [...params.keys()].some((key) => key !== 'view') ? 'unit' : 'me';
}

const TAB_DESCRIPTIONS: Record<ListTab, string> = {
  me: 'Voice yang menunggu tindakan Anda.',
  unit: 'Voice yang ditangani unit Anda.',
  team: 'Voice yang dikirim anggota tim Anda.',
};

export function WorkItemsPage() {
  const { session } = useAuth();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const location = useLocation();
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
  const isManager = caps.includes('MANAGER');
  // Director reads General and Private Voices, read-only.
  const isDirector = caps.includes('DIRECTOR');
  // Director and Deputy/Division Heads read their directorate's Private Voices.
  const readsPrivate = isDirector || caps.includes('DIVISION_LEADERSHIP');
  const directorPrivate = readsPrivate && searchParams.get('visibility') === 'PRIVATE';
  // Responders read three lists: what waits for them, what their unit handles,
  // and what their team sent. A Group Leader's unit list is their own queue.
  const canAct = !isUnion && !isDirector;
  const groupLeaderOnly =
    caps.includes('GROUP_LEADER') &&
    !caps.some((capability) =>
      ['SECTION_HEAD', 'MANAGER', 'DIVISION_LEADERSHIP'].includes(capability),
    );
  const tabs: ListTab[] = !canAct ? [] : groupLeaderOnly ? ['me', 'team'] : ['me', 'unit', 'team'];
  const tab = tabs.length ? resolveTab(searchParams, tabs) : undefined;
  // "Tindakan saya" / "Selesai oleh saya": the Voices Butuh Tindakan Saya counts.
  const actionFilter =
    tab === 'me' ? (searchParams.get('action') === 'closed' ? 'closed' : 'me') : undefined;

  const rawView = searchParams.get('view') ?? (isUnion ? 'ALL' : 'ACTIVE');
  const handoverMode = isManager && rawView === 'HANDOVERS';
  const view = handoverMode ? 'HANDOVERS' : STATUS_VIEWS.has(rawView) ? rawView : 'ACTIVE';
  const status = ['OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED'].includes(view) ? view : undefined;
  const statusGroup = status || handoverMode ? undefined : (view as 'ACTIVE' | 'CLOSED' | 'ALL');
  const severity = searchParams.get('severity') ?? undefined;
  const area = searchParams.get('area') ?? undefined;
  const category = searchParams.get('category') ?? undefined;
  const handler = searchParams.get('handler') ?? undefined;
  const from = searchParams.get('from') ?? undefined;
  const to = searchParams.get('to') ?? undefined;
  const search = searchParams.get('search') ?? undefined;
  // Unit heads list the organization the dashboard counts (scope=unit).
  const org = Object.fromEntries(
    (['scopeMode', 'directorate', 'division', 'department', 'section'] as const).flatMap((key) => {
      const value = searchParams.get(key);
      return value ? [[key, value]] : [];
    }),
  ) as Partial<Record<'scopeMode' | 'directorate' | 'division' | 'department' | 'section', string>>;
  const orgKey = JSON.stringify(org);
  const rawSort = searchParams.get('sort');
  const sort =
    rawSort === 'newest' || rawSort === 'severity' ? rawSort : isUnion ? 'severity' : 'action';
  const dueParam = searchParams.get('due');
  const due: 'OVERDUE' | 'SOON' | undefined =
    dueParam === 'OVERDUE' || dueParam === 'SOON' ? dueParam : undefined;

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
      due,
      sort,
      orgKey,
      directorPrivate ? 'private' : 'general',
      actionFilter ?? 'action-any',
      tab ?? 'no-tab',
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
        ...(due ? { due } : {}),
        ...(nav.cursor ? { cursor: nav.cursor } : {}),
      };
      return isUnion
        ? api.workItems({ ...common, sort })
        : directorPrivate
          ? api.workItems({ ...common, sort, visibility: 'PRIVATE' })
          : actionFilter
            ? api.workItems({ ...common, sort, action: actionFilter })
            : api.workItems({ ...common, sort, scope: tab === 'team' ? 'team' : 'unit', ...org });
    },
    enabled: Boolean(session) && !handoverMode,
    refetchInterval: 3000,
  });

  const handovers = useQuery({
    queryKey: voiceQuery(sessionId, 'my-handovers', search, nav.cursor),
    queryFn: () =>
      api.myHandovers({
        limit: 10,
        ...(search ? { search } : {}),
        ...(nav.cursor ? { cursor: nav.cursor } : {}),
      }),
    enabled: Boolean(session) && handoverMode,
  });

  // Union hero stats come from the private dashboard (incl. pendingAssignment).
  const privateDash = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'private'),
    queryFn: () => api.dashboardPrivate(),
    enabled: !!session && isUnion,
    refetchInterval: 3000,
  });

  // "Butuh Tindakan Saya" counts the Voices waiting for the viewer; the status
  // strip counts every Voice in the selected organization.
  const actions = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'actions', orgKey),
    queryFn: ({ signal }) => api.dashboardPreview(org, signal),
    enabled: !!session && !isUnion,
    refetchInterval: 30_000,
  });

  // Voice Tim Saya counts the Voices the viewer's team sent (reporter basis).
  const team = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'team', orgKey),
    queryFn: ({ signal }) => api.dashboardPreview({ ...org, basis: 'REPORTER' }, signal),
    enabled: !!session && tabs.includes('team'),
    refetchInterval: 30_000,
  });
  const unitStatus = actions.data?.summary.status;
  const teamStatus = team.data?.summary.status;
  const tabCounts: Record<ListTab, number | undefined> = {
    me: actions.data?.summary.total,
    unit: unitStatus ? activeCount(unitStatus) : undefined,
    team: teamStatus ? activeCount(teamStatus) : undefined,
  };
  const stripStatus = tab === 'team' ? teamStatus : unitStatus;
  // The Butuh Tindakan Saya count behind the current list, shown pressed.
  const activeKind: ActionKind | null =
    tab !== 'me'
      ? null
      : actionFilter === 'closed'
        ? 'closed'
        : due === 'OVERDUE'
          ? 'overdue'
          : due === 'SOON'
            ? 'soon'
            : severity === 'CRITICAL'
              ? 'critical'
              : view === 'OPEN'
                ? 'open'
                : view === 'RESPONDED'
                  ? 'responded'
                  : view === 'IN_PROGRESS'
                    ? 'inProgress'
                    : null;
  // Switching lists clears the filters but keeps the organization from Home.
  const openTab = (id: ListTab) => setSearchParams(new URLSearchParams({ ...org, tab: id }));

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
    setSearchParams(
      isUnion
        ? new URLSearchParams()
        : new URLSearchParams(tab ? { ...org, tab } : { view: 'ACTIVE' }),
    );
  const items = inbox.data?.items ?? [];
  const handoverItems = handovers.data?.items ?? [];
  const nextCursor = handoverMode
    ? (handovers.data?.nextCursor ?? null)
    : (inbox.data?.nextCursor ?? null);
  const intro = introFor({
    isUnion,
    isUnionHead,
    isDirector,
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
        {...(isUnion ? { eyebrow: intro.eyebrow } : {})}
        title={intro.title}
        description={tab && !directorPrivate ? TAB_DESCRIPTIONS[tab] : intro.description}
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
                  {
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
            : []
        }
        chip={
          isUnion ? (
            <HeroChip icon={<ShieldCheck size={12} aria-hidden="true" />} label="Private" />
          ) : undefined
        }
      />
      {/* The Private view is its own read-only list, outside the tabs. */}
      {tab && !handoverMode && !directorPrivate ? (
        <div className="vm-tabs" role="group" aria-label="Daftar Voice">
          {tabs.map((id) => (
            <button type="button" key={id} aria-pressed={tab === id} onClick={() => openTab(id)}>
              <span className="vm-tabs__label">{TAB_LABELS[id]}</span>
              <span className="vm-tabs__count">{tabCounts[id] ?? '–'}</span>
            </button>
          ))}
        </div>
      ) : null}
      {!isUnion && !handoverMode && !directorPrivate ? (
        <div className="ops ops--inline">
          {tab === 'me' ? (
            <ActionSummaryCard
              preview={actions.data}
              isError={actions.isError}
              active={activeKind}
              // A second tap on the pressed count lifts the filter again.
              onPick={(kind) =>
                setSearchParams(
                  new URLSearchParams(
                    kind === activeKind ? { tab: 'me' } : { ...ACTION_FILTERS[kind], tab: 'me' },
                  ),
                )
              }
              onOpenVoice={(id) => void navigate(`/voices/${id}`)}
            />
          ) : null}
          {tab === 'me' ? null : (
            <div className="ops-card ops-status-strip" role="group" aria-label="Status Voice">
              {(['OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED'] as const).map((key) => (
                <button
                  type="button"
                  key={key}
                  data-status={key}
                  aria-pressed={view === key}
                  onClick={() => setParam('view', view === key ? 'ACTIVE' : key)}
                >
                  <span className="ops-status-strip__label">
                    <span className="ops-status-strip__dot" aria-hidden="true" />
                    {STATUS_LABELS[key]}
                  </span>
                  <strong>
                    {stripStatus ? (stripStatus.find((row) => row.label === key)?.value ?? 0) : '–'}
                  </strong>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
      {offline ? (
        <Alert tone="warning" title="Anda sedang offline">
          Daftar terbaru, detail, dan seluruh tindakan memerlukan koneksi.
        </Alert>
      ) : null}
      {typeof location.state === 'object' &&
      location.state &&
      'handoverSuccess' in location.state ? (
        <Alert tone="success" title="Handover berhasil">
          {String(location.state.handoverSuccess)}
        </Alert>
      ) : null}

      <div className="monitoring-search">
        <Input
          label="Cari Voice"
          value={search ?? ''}
          onChange={(event) => setParam('search', event.target.value || undefined)}
          leading={<Search size={16} />}
          placeholder={handoverMode ? 'Cari ID Voice' : 'Cari judul atau ID'}
          hideLabel
        />
      </div>

      <FilterPillRow
        primary={[
          ...(readsPrivate
            ? [
                {
                  id: 'visibility',
                  label: 'Jenis',
                  value: directorPrivate ? 'PRIVATE' : 'GENERAL',
                  neutralValue: 'GENERAL',
                  onValueChange: (value: string) =>
                    setSearchParams(
                      new URLSearchParams(
                        value === 'PRIVATE' ? { visibility: 'PRIVATE' } : { view: 'ACTIVE' },
                      ),
                    ),
                  options: [
                    { value: 'GENERAL', label: 'General Voice' },
                    { value: 'PRIVATE', label: 'Private Voice' },
                  ],
                },
              ]
            : []),
          ...(handoverMode
            ? []
            : [
                {
                  id: 'severity',
                  label: 'Prioritas',
                  value: severity ?? '',
                  onValueChange: (value: string) => setParam('severity', value || undefined),
                  options: severityOptions,
                },
              ]),
          {
            id: 'view',
            label: 'Status',
            value: view,
            alwaysNeutral: true,
            onValueChange: (value) => setParam('view', value),
            options: [
              { value: 'ACTIVE', label: 'Aktif' },
              ...(isManager ? [{ value: 'HANDOVERS', label: 'Handover Saya' }] : []),
              ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
              { value: 'ALL', label: 'Semua status' },
            ],
          },
          ...(handoverMode
            ? []
            : isUnion || directorPrivate
              ? []
              : [
                  ...(tab === 'me'
                    ? [
                        {
                          id: 'action',
                          label: 'Tindakan',
                          value: actionFilter ?? 'me',
                          neutralValue: 'me',
                          // Closed Voices are only ever "Selesai oleh saya".
                          onValueChange: (value: string) =>
                            setSearchParams(
                              new URLSearchParams(
                                value === 'closed'
                                  ? { tab: 'me', view: 'CLOSED', action: 'closed' }
                                  : { tab: 'me', view: 'ACTIVE' },
                              ),
                            ),
                          options: [
                            { value: 'me', label: 'Menunggu saya' },
                            { value: 'closed', label: 'Selesai oleh saya' },
                          ],
                        },
                      ]
                    : []),
                  {
                    id: 'due',
                    label: 'Tenggat',
                    value: due ?? '',
                    onValueChange: (value: string) => setParam('due', value || undefined),
                    options: [
                      { value: '', label: 'Semua' },
                      { value: 'OVERDUE', label: 'Terlambat' },
                      { value: 'SOON', label: '< 24 jam' },
                    ],
                  },
                  {
                    id: 'area',
                    label: 'Area',
                    value: area ?? '',
                    onValueChange: (value: string) => setParam('area', value || undefined),
                    options: areaOptions,
                  },
                  ...(tab === 'me' || tab === 'team'
                    ? []
                    : [
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
                ]),
        ]}
        secondary={
          handoverMode
            ? []
            : [
                ...(isUnion || directorPrivate
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
              ]
        }
        onClear={clearFilters}
        sheetContent={
          handoverMode ? null : (
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
          )
        }
      />

      {handoverMode ? null : (
        <div className="monitoring-sort">
          <Select
            label="Urutkan"
            value={sort}
            onValueChange={(value) => setParam('sort', value === 'action' ? undefined : value)}
            options={[
              { value: 'action', label: 'Perlu tindakan' },
              { value: 'newest', label: 'Terbaru' },
              { value: 'severity', label: 'Severity' },
            ]}
          />
        </div>
      )}
      {(handoverMode ? handovers.isLoading : inbox.isLoading) ? (
        <Skeleton label={handoverMode ? 'Memuat riwayat handover' : 'Memuat daftar Voice'} />
      ) : (handoverMode ? handovers.isError : inbox.isError) ? (
        <Card>
          <EmptyState
            title={handoverMode ? 'Riwayat handover gagal dimuat' : 'Daftar gagal dimuat'}
            description="Periksa koneksi lalu coba muat ulang."
          />
        </Card>
      ) : handoverMode && handoverItems.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowRightLeft size={24} />}
            title="Belum ada handover"
            description="Handover yang Anda kirim atau terima akan muncul di sini tanpa memengaruhi antrean aktif."
          />
        </Card>
      ) : !handoverMode && items.length === 0 ? (
        <Card>
          <EmptyState {...emptyStateFor({ isUnion, isUnionHead })} />
        </Card>
      ) : (
        <Stack gap="md">
          <div className="inbox-list vm-list" key={searchParams.toString()}>
            {handoverMode
              ? handoverItems.map((item) => (
                  <MyHandoverCard
                    key={item.id}
                    item={item}
                    onOpen={() => void navigate(`/voices/${item.voice?.id}/handover-history`)}
                  />
                ))
              : items.map((voice) => (
                  <InboxVoiceCard
                    key={voice.id}
                    voice={voice}
                    {...(isUnion || directorPrivate
                      ? { identity: { alias: voice.reporterAlias ?? null } }
                      : {})}
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
            loading={handoverMode ? handovers.isFetching : inbox.isFetching}
          />
        </Stack>
      )}
    </Stack>
  );
}

function MyHandoverCard({ item, onOpen }: { item: HandoverHistoryItem; onOpen: () => void }) {
  const source = item.direction === 'SENT' ? item.from : item.to;
  const destination = item.direction === 'SENT' ? item.to : item.from;
  return (
    <button type="button" className="my-handover-card" onClick={onOpen}>
      <span className="my-handover-card__topline">
        <strong>{item.voice?.displayId}</strong>
        <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
      </span>
      <span className="my-handover-card__direction">
        <em>{item.direction === 'SENT' ? 'Dikirim' : 'Diterima'}</em>
        <span>{formatCategoryName(source.category.key, source.category.name)}</span>
        <ArrowRight size={15} aria-hidden="true" />
        <span>{formatCategoryName(destination.category.key, destination.category.name)}</span>
      </span>
      <span className="my-handover-card__department">
        <Building2 size={15} aria-hidden="true" />
        {destination.department.department ?? 'Department'} · {destination.pic.displayName}
      </span>
      {item.detail ? <span className="my-handover-card__note">“{item.detail}”</span> : null}
      <span className="my-handover-card__open">
        Buka riwayat <ArrowRight size={15} aria-hidden="true" />
      </span>
    </button>
  );
}

function introFor({ isUnion, isUnionHead, isDirector }: Record<string, boolean>) {
  // Komite (the former Union Head) handles every Private Voice itself.
  if (isUnion)
    return {
      eyebrow: PRIVATE_ROUTE_LABEL,
      title: 'Private Voice',
      description: isUnionHead
        ? 'Seluruh Private Voice yang masuk, diurutkan berdasarkan severity.'
        : 'Private Voice yang ditugaskan kepada Anda untuk ditangani.',
    };
  if (isDirector)
    return {
      title: 'Voice Member',
      description: 'Pantau General dan Private Voice secara read-only.',
    };
  // Division leaders act on the Voices that reach their level, like other heads.
  return {
    title: 'Voice Member',
    description: 'Voice yang ditangani unit Anda.',
  };
}

function emptyStateFor({ isUnion, isUnionHead }: Record<string, boolean>) {
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
