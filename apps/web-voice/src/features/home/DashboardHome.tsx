import { Alert, Button, Card, Dialog, EmptyState, Input, Select, Skeleton } from '@care/ui';
import { FrontendError, useAuth } from '@care/frontend-core';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Inbox,
  Layers3,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardChartCard } from '../../components/DashboardChartCard';
import { DonutChart, DonutLegend } from '../../components/DonutChart';
import { FilterPillRow } from '../../components/FilterPills';
import { InboxVoiceCard } from '../../components/InboxVoiceCard';
import { TrendCard } from '../../components/TrendCard';
import { activeCount, bucketValue } from '../../lib/dashboard-math';
import { dashboardDates, isDashboardDate, type DashboardRange } from '../../lib/dashboard-range';
import { AREA_LABELS, SEVERITY_LABELS, STATUS_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useOnlineStatus } from '../../lib/use-online-status';
import { PersonalVoiceSection } from './PersonalVoiceSection';

const orgLevels = ['directorate', 'division', 'department', 'section'] as const;
const orgLabels = {
  directorate: 'Direktorat',
  division: 'Division',
  department: 'Department',
  section: 'Section',
};
const rangeOptions = [
  { value: '30d', label: '30 hari terakhir' },
  { value: '90d', label: '90 hari terakhir' },
  { value: 'year', label: 'Tahun berjalan' },
  { value: 'all', label: 'Semua waktu' },
  { value: 'custom', label: 'Pilih tanggal' },
];
const filterNames = [
  'basis',
  'scopeMode',
  'level',
  ...orgLevels,
  'handler',
  'dashArea',
  'range',
  'dashCategory',
  'dashSeverity',
  'dashStatus',
  'dashFrom',
  'dashTo',
];

// Promise.allSettled is absent on the supported legacy WebKit tier.
function settled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ status: 'rejected', reason }),
  );
}

export function DashboardHome() {
  const { session } = useAuth();
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const online = useOnlineStatus();
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const caps = session?.capabilities ?? [];
  const union = caps.includes('UNION_HEAD') || caps.includes('UNION_OFFICER');
  const unionHead = caps.includes('UNION_HEAD');
  const isPrivate = union && params.get('dashboardTab') !== 'general';
  const prefix = isPrivate ? 'private.' : '';
  const read = (key: string) => params.get(`${prefix}${key}`) ?? undefined;
  const range = (read('range') ?? '30d') as DashboardRange;
  const from = read('dashFrom'),
    to = read('dashTo');
  const invalidDates =
    !rangeOptions.some((r) => r.value === range) ||
    (range === 'custom' &&
      (!from ||
        !to ||
        !isDashboardDate(from) ||
        !isDashboardDate(to) ||
        from > to ||
        !Number.isFinite(Date.parse(from)) ||
        !Number.isFinite(Date.parse(to))));
  const query = {
    basis: isPrivate ? 'HANDLING' : (read('basis') ?? 'HANDLING'),
    visibility: isPrivate ? 'PRIVATE' : 'GENERAL',
    scopeMode: read('scopeMode'),
    level: read('level'),
    directorate: read('directorate'),
    division: read('division'),
    department: read('department'),
    section: read('section'),
    handler: isPrivate ? read('handler') : undefined,
    area: read('dashArea'),
    category: isPrivate ? undefined : read('dashCategory'),
    severity: read('dashSeverity'),
    status: read('dashStatus'),
  };
  const metadataQuery = {
    ...query,
    ...{
      area: undefined,
      category: undefined,
      severity: undefined,
      status: undefined,
      from: undefined,
      to: undefined,
    },
  };
  const metadata = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'metadata', metadataQuery),
    queryFn: ({ signal }) => api.dashboardMetadata(metadataQuery, signal),
    enabled: online,
    staleTime: 30000,
  });
  // One refresh owns the date bounds and waits for both independent results.
  // A stable semantic key prevents time-driven cache churn; changed filters
  // get a different key, so delayed responses cannot replace the current view.
  const refresh = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'snapshot', query, range, from, to),
    queryFn: async ({ signal }) => {
      const dates = dashboardDates(range, from, to);
      const request = { ...query, ...dates };
      const [view, inbox] = await Promise.all([
        settled(api.dashboardView(request, signal)),
        settled(api.dashboardPreview(request, signal)),
      ]);
      return { view, inbox, dates };
    },
    enabled: online && !invalidDates && sessionId !== 'anon',
    refetchInterval: online ? 3000 : false,
  });
  const dashboard = {
    data: refresh.data?.view.status === 'fulfilled' ? refresh.data.view.value : undefined,
    isError: refresh.isError || refresh.data?.view.status === 'rejected',
    refetch: () => refresh.refetch({ cancelRefetch: false }),
  };
  const preview = {
    data: refresh.data?.inbox.status === 'fulfilled' ? refresh.data.inbox.value : undefined,
    isError: refresh.isError || refresh.data?.inbox.status === 'rejected',
    isPending: refresh.isPending,
    refetch: () => refresh.refetch({ cancelRefetch: false }),
  };
  const viewError =
    refresh.data?.view.status === 'rejected' ? refresh.data.view.reason : refresh.error;
  const organizationUnavailable =
    viewError instanceof FrontendError && viewError.code === 'DASHBOARD_ORGANIZATION_UNAVAILABLE';
  const data = !invalidDates && !dashboard.isError ? dashboard.data : undefined;
  const meta = metadata.data;
  const selectionSignature = JSON.stringify(data?.selected);
  const metadataSignature = JSON.stringify(meta?.selected);
  const metadataMatches = Boolean(
    meta &&
    data &&
    meta.basis === data.basis &&
    meta.visibility === data.visibility &&
    meta.level === data.level &&
    meta.scopeMode === data.scopeMode &&
    selectionSignature === metadataSignature,
  );
  const refetchMetadata = metadata.refetch;
  useEffect(() => {
    // A master import can change the default unit while this page is polling.
    // Refresh selector options before allowing interaction with that new scope.
    if (online && data && meta && !metadataMatches && !metadata.isFetching && !metadata.isError)
      void refetchMetadata();
  }, [online, data, meta, metadataMatches, metadata.isFetching, metadata.isError, refetchMetadata]);
  const set = (values: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(`${prefix}${key}`, value);
      else next.delete(`${prefix}${key}`);
    }
    setParams(next);
  };
  const clearOrg = Object.fromEntries(orgLevels.map((l) => [l, undefined]));
  const reset = () => {
    const next = new URLSearchParams(params);
    for (const key of filterNames) next.delete(`${prefix}${key}`);
    setParams(next);
  };
  const pickOrg = (level: (typeof orgLevels)[number], value: string) => {
    const i = orgLevels.indexOf(level);
    const changes: Record<string, string | undefined> = {};
    orgLevels.forEach((key, n) => {
      changes[key] = n < i ? meta?.selected[key] : n === i ? value || undefined : undefined;
    });
    const ownSelection = sectionOnly
      ? changes.section
      : caps.includes('DIVISION_LEADERSHIP')
        ? changes.division
        : changes.department;
    if (ownSelection && !union && !caps.includes('DIRECTOR')) {
      changes.scopeMode = 'OWN';
      changes.level = caps.includes('DIVISION_LEADERSHIP') ? 'department' : 'section';
    }
    set(changes);
  };
  const pickLevel = (level: string) => {
    const scopeMode =
      caps.includes('DIRECTOR') || union
        ? 'GLOBAL'
        : caps.includes('DIVISION_LEADERSHIP')
          ? level === 'division'
            ? 'GLOBAL'
            : 'OWN'
          : level === 'department'
            ? 'PARENT'
            : 'OWN';
    set({ ...clearOrg, scopeMode, level });
  };
  const sectionOnly =
    !union &&
    !caps.includes('DIRECTOR') &&
    !caps.includes('DIVISION_LEADERSHIP') &&
    !caps.includes('MANAGER');
  const scope = data?.scopeLabel ?? meta?.scopeLabel;
  const readonly =
    !isPrivate && (union || caps.includes('DIVISION_LEADERSHIP') || caps.includes('DIRECTOR'));
  const name = session?.account.displayName ?? '';
  const role = union
    ? unionHead
      ? 'Union Head'
      : 'Union Officer'
    : (session?.workforceProfile?.structuralPosition ?? 'PIC');
  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? 'Selamat pagi'
      : hour < 15
        ? 'Selamat siang'
        : hour < 18
          ? 'Selamat sore'
          : 'Selamat malam';
  const listUrl = () => {
    const p = new URLSearchParams();
    const listQuery = { ...query, ...refresh.data?.dates };
    for (const key of ['area', 'category', 'severity', 'status', 'from', 'to', 'handler'] as const)
      if (listQuery[key]) p.set(key, listQuery[key]!);
    if (!query.status) p.set('statusGroup', 'ACTIVE');
    return `${union && !isPrivate ? '/general' : '/work-items'}?${p}`;
  };
  return (
    <div className="organization-home">
      <section className="member-hero organization-home__hero">
        <div className="member-hero__top">
          <div className="member-hero__identity">
            <div className="member-hero__who">
              <p className="member-hero__greeting">{greeting},</p>
              <h1 className="member-hero__name">{name}</h1>
              <p className="member-hero__role">{role}</p>
            </div>
          </div>
          <div className="member-hero__actions">
            <Button
              variant="ghost"
              size="icon"
              className="member-hero__orb"
              aria-label="Lihat notifikasi"
              onClick={() => void navigate('/notifications')}
            >
              <Bell size={20} />
            </Button>
          </div>
        </div>
        {readonly ? (
          <span className="member-hero__context">
            <Lock size={12} /> {union ? 'General' : 'Leadership'} · Read-only
          </span>
        ) : null}
        {union ? (
          <div className="dashboard-tabs dashboard-tabs--hero" aria-label="Jenis dashboard">
            {['private', 'general'].map((tab) => (
              <button
                type="button"
                key={tab}
                aria-pressed={isPrivate === (tab === 'private')}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('dashboardTab', tab);
                  setParams(next);
                }}
              >
                {tab === 'private' ? 'Private Voice' : 'General Voice'}
              </button>
            ))}
          </div>
        ) : null}
        <div className="dashboard-summary" aria-label="Ringkasan Voice">
          <h2>Ringkasan Voice</h2>
          {data ? (
            <div className="dashboard-summary__grid">
              <Metric label="Total" value={data.total} icon={<Layers3 />} />
              <Metric label="Aktif" value={activeCount(data.status)} icon={<Activity />} />
              <Metric
                label="Kritis"
                value={bucketValue(data.severity, 'CRITICAL')}
                icon={<AlertTriangle />}
                danger
              />
            </div>
          ) : dashboard.isError ? (
            <p>Ringkasan belum tersedia.</p>
          ) : (
            <Skeleton label="Memuat ringkasan dashboard" />
          )}
        </div>
      </section>
      <div className="organization-home__body">
        {!online ? (
          <Alert tone="warning" title="Anda sedang offline">
            Ringkasan terakhir mungkin sudah usang. Sambungkan kembali untuk memperbarui dashboard.
          </Alert>
        ) : null}
        <Card className="dashboard-filters" padding="none">
          <div className="dashboard-filters__head">
            {!isPrivate ? (
              <div className="dashboard-tabs" aria-label="Basis organisasi">
                {[
                  { id: 'HANDLING', label: 'Penanganan' },
                  { id: 'REPORTER', label: 'Pelaporan' },
                ].map((b) => (
                  <button
                    type="button"
                    key={b.id}
                    aria-pressed={query.basis === b.id}
                    onClick={() =>
                      set({ ...clearOrg, basis: b.id, level: undefined, scopeMode: undefined })
                    }
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="dashboard-scope">
                <Lock size={16} /> {scope}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw size={14} /> Reset
            </Button>
          </div>
          {!isPrivate ? (
            <>
              <button
                type="button"
                className="dashboard-org-summary"
                aria-label="Filter organisasi"
                aria-haspopup="dialog"
                aria-expanded={organizationOpen}
                onClick={() => setOrganizationOpen(true)}
              >
                <Building2 size={18} aria-hidden="true" />
                <span>{scope}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              <div className="dashboard-org-selects dashboard-org-selects--desktop">
                <Building2 size={19} aria-hidden="true" />
                {orgLevels
                  .filter((l) => (meta?.organization[l].length ?? 0) > 0)
                  .map((l) => (
                    <Select
                      key={l}
                      disabled={metadata.isFetching || metadata.isError || !metadataMatches}
                      label={orgLabels[l]}
                      placeholder={`Semua ${orgLabels[l].toLowerCase()}`}
                      value={data?.selected[l] ?? meta?.selected[l] ?? ''}
                      onValueChange={(v) => pickOrg(l, v)}
                      options={[
                        { value: '', label: `Semua ${orgLabels[l].toLowerCase()}` },
                        ...(meta?.organization[l].map((o) => ({ value: o.id, label: o.label })) ??
                          []),
                      ]}
                    />
                  ))}
              </div>
              <Dialog
                open={organizationOpen}
                onOpenChange={setOrganizationOpen}
                title="Filter organisasi"
                description="Pilih cakupan organisasi untuk seluruh ringkasan dan grafik."
                mobileSheet
              >
                <div className="dashboard-org-selects dashboard-org-selects--sheet">
                  <Building2 size={19} aria-hidden="true" />
                  {orgLevels
                    .filter((l) => (meta?.organization[l].length ?? 0) > 0)
                    .map((l) => (
                      <Select
                        key={l}
                        disabled={metadata.isFetching || metadata.isError || !metadataMatches}
                        label={orgLabels[l]}
                        placeholder={`Semua ${orgLabels[l].toLowerCase()}`}
                        value={data?.selected[l] ?? meta?.selected[l] ?? ''}
                        onValueChange={(v) => pickOrg(l, v)}
                        options={[
                          { value: '', label: `Semua ${orgLabels[l].toLowerCase()}` },
                          ...(meta?.organization[l].map((o) => ({ value: o.id, label: o.label })) ??
                            []),
                        ]}
                      />
                    ))}
                </div>
                <div className="dialog-actions">
                  <Button onClick={() => setOrganizationOpen(false)}>Selesai</Button>
                </div>
              </Dialog>
            </>
          ) : unionHead && meta ? (
            <div className="dashboard-private-handler">
              <Select
                label="PIC Union"
                value={read('handler') ?? ''}
                onValueChange={(v) => set({ handler: v || undefined })}
                options={[
                  { value: '', label: 'Semua PIC' },
                  ...meta.handlers.map((h) => ({ value: h.id, label: h.label })),
                ]}
              />
            </div>
          ) : null}
          <FilterPillRow
            primary={[
              {
                id: 'dashArea',
                label: 'Semua area',
                icon: <MapPin size={18} />,
                value: read('dashArea') ?? '',
                onValueChange: (v) => set({ dashArea: v || undefined }),
                options: [
                  { value: '', label: 'Semua area' },
                  ...Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label })),
                ],
              },
              {
                id: 'range',
                label: 'Rentang',
                icon: <CalendarDays size={18} />,
                value: range,
                onValueChange: (v) =>
                  set({
                    range: v,
                    ...(v === 'custom' ? {} : { dashFrom: undefined, dashTo: undefined }),
                  }),
                options: rangeOptions,
              },
            ]}
            secondary={[
              ...(!isPrivate
                ? [
                    {
                      id: 'dashCategory',
                      label: 'Kategori',
                      value: read('dashCategory') ?? '',
                      onValueChange: (v: string) => set({ dashCategory: v || undefined }),
                      options: [
                        { value: '', label: 'Semua kategori' },
                        ...(meta?.categories.map((c) => ({ value: c.id, label: c.label })) ?? []),
                      ],
                    },
                  ]
                : []),
              {
                id: 'dashSeverity',
                label: 'Severity',
                value: read('dashSeverity') ?? '',
                onValueChange: (v) => set({ dashSeverity: v || undefined }),
                options: [
                  { value: '', label: 'Semua severity' },
                  ...Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
                ],
              },
              {
                id: 'dashStatus',
                label: 'Status',
                value: read('dashStatus') ?? '',
                onValueChange: (v) => set({ dashStatus: v || undefined }),
                options: [
                  { value: '', label: 'Semua status' },
                  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                ],
              },
            ]}
            onClear={reset}
            customContent={
              range === 'custom' ? (
                <div className="filter-pills__dates">
                  <Input
                    label="Dari tanggal"
                    type="date"
                    value={from ?? ''}
                    onChange={(e) => set({ dashFrom: e.target.value })}
                  />
                  <Input
                    label="Sampai tanggal"
                    type="date"
                    value={to ?? ''}
                    onChange={(e) => set({ dashTo: e.target.value })}
                  />
                </div>
              ) : undefined
            }
          />
        </Card>
        {metadata.isError ? (
          <Alert tone="danger" title="Filter organisasi gagal dimuat">
            <Button variant="ghost" onClick={() => void metadata.refetch()}>
              Coba lagi
            </Button>
            <Button variant="ghost" onClick={reset}>
              Reset filter
            </Button>
          </Alert>
        ) : null}
        {invalidDates ? (
          <Alert tone="warning" title="Periksa rentang tanggal">
            Pilih tanggal awal dan akhir yang valid.
          </Alert>
        ) : dashboard.isError ? (
          <Alert tone="danger" title="Dashboard gagal dimuat">
            {organizationUnavailable
              ? 'Organisasi akun belum lengkap. Hubungi Admin untuk memperbarui data organisasi.'
              : 'Coba muat ulang atau reset filter.'}
            <Button onClick={() => void dashboard.refetch()}>Coba lagi</Button>
          </Alert>
        ) : !data ? (
          <Skeleton label="Memuat dashboard organisasi" />
        ) : (
          <>
            {data.total === 0 ? (
              <Card>
                <EmptyState
                  icon={<Inbox size={26} />}
                  title="Belum ada Voice pada filter ini"
                  description="Ubah filter atau rentang waktu untuk melihat data lainnya."
                  action={
                    <Button variant="secondary" onClick={reset}>
                      Reset filter
                    </Button>
                  }
                />
              </Card>
            ) : null}
            <div className="dashboard-visual-grid">
              <Card className="distribution-card dashboard-donut">
                <h2>Distribusi status</h2>
                <div className="donut-card__grid">
                  <DonutChart buckets={data.status} />
                  <DonutLegend buckets={data.status} />
                </div>
              </Card>
              <TrendCard
                title={`Tren ${range === '30d' ? '30 hari' : range === '90d' ? '90 hari' : range === 'year' ? 'tahun berjalan' : range === 'custom' ? 'periode terpilih' : 'seluruh periode'}`}
                buckets={data.trend}
                total={data.total ?? undefined}
                previousTotal={data.previousTotal ?? undefined}
              />
              <DashboardChartCard
                title="Voice menurut severity"
                buckets={['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
                  .map((label) => ({
                    label,
                    value: bucketValue(data.severity, label),
                  }))
                  .filter((bucket) => bucket.value > 0)}
              />
              {!isPrivate ? (
                <DashboardChartCard title="Voice menurut kategori" buckets={data.category} />
              ) : null}
            </div>
            <Card className="dashboard-organization" padding="none">
              <div className="dashboard-organization__head">
                <h2>{isPrivate ? 'Cakupan penanganan' : 'Cakupan organisasi'}</h2>
                {!isPrivate && meta ? (
                  <div className="dashboard-tabs" aria-label="Level cakupan">
                    {sectionOnly
                      ? meta.allowedScopeModes.map((mode) => (
                          <button
                            type="button"
                            key={mode}
                            aria-pressed={data.scopeMode === mode}
                            onClick={() => set({ ...clearOrg, scopeMode: mode, level: 'section' })}
                          >
                            {mode === 'OWN' ? 'Section saya' : 'Seluruh section di department'}
                          </button>
                        ))
                      : meta.allowedLevels.map((l) => (
                          <button
                            type="button"
                            key={l}
                            aria-pressed={data.level === l}
                            onClick={() => pickLevel(l)}
                          >
                            {orgLabels[l]}
                          </button>
                        ))}
                  </div>
                ) : null}
              </div>
              <DashboardChartCard
                title={
                  isPrivate
                    ? 'Penanggung jawab'
                    : `Voice per ${orgLabels[data.level].toLowerCase()}`
                }
                buckets={data.organization}
              />
              <p className="dashboard-privacy">
                <Lock size={14} />
                {isPrivate
                  ? 'Identitas pelapor tidak ditampilkan dalam ringkasan.'
                  : 'Akses detail Voice mengikuti kewenangan Anda.'}
              </p>
              {data.handlingUnresolved ? (
                <p className="chart-card__caption">
                  {data.handlingUnresolved} Voice historis belum memiliki organisasi penanganan yang
                  dapat dipastikan.
                </p>
              ) : null}
            </Card>
            {!isPrivate &&
            !union &&
            !caps.includes('DIRECTOR') &&
            meta?.allowedLevels.includes(data.level === 'section' ? 'department' : 'division') &&
            data.level !== 'division' ? (
              <Button
                variant="ghost"
                className="dashboard-up"
                onClick={() => pickLevel(data.level === 'section' ? 'department' : 'division')}
              >
                <ArrowUp size={16} /> Lihat satu level lebih luas
              </Button>
            ) : null}
          </>
        )}
        {isPrivate && unionHead && data?.pendingAssignment !== undefined ? (
          <button
            type="button"
            className="dashboard-queue"
            onClick={() => void navigate('/work-items?unassigned=true')}
          >
            <ClipboardList size={20} />
            <span>
              <strong>{data.pendingAssignment} Private Voice menunggu penugasan</strong>
              <small>Antrean operasional · seluruh periode</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ) : null}
        <section className="dashboard-inbox">
          <div className="home-section__head">
            <h2>{isPrivate ? 'Private terbaru' : 'Inbox Voice Member'}</h2>
            <Button variant="ghost" size="sm" onClick={() => void navigate(listUrl())}>
              Lihat semua
            </Button>
          </div>
          {preview.isError ? (
            <Alert tone="danger" title="Inbox gagal dimuat">
              <Button onClick={() => void preview.refetch()}>Coba lagi</Button>
            </Alert>
          ) : invalidDates ? null : preview.isPending ? (
            <Skeleton label="Memuat inbox" />
          ) : preview.data?.items.length ? (
            <div className="inbox-list">
              {preview.data.items.map((v) => (
                <InboxVoiceCard
                  key={v.id}
                  voice={v}
                  {...(isPrivate ? { identity: { alias: v.reporterAlias ?? null } } : {})}
                  onOpen={() => void navigate(`/voices/${v.id}`)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <EmptyState
                icon={<Inbox size={24} />}
                title="Tidak ada Voice aktif pada cakupan ini"
                description="Voice yang dapat Anda akses akan muncul di sini."
              />
            </Card>
          )}
        </section>
        {!union && caps.includes('MEMBER') ? <PersonalVoiceSection /> : null}
        <section className="home-quick" aria-label="Aksi cepat">
          <h2 className="home-section__title">Aksi cepat</h2>
          <div className="home-quick__grid">
            {[
              ...(!union
                ? [
                    { label: 'Buat Voice', path: '/voices/new', icon: <Plus size={20} /> },
                    { label: 'Voice Saya', path: '/history', icon: <ClipboardList size={20} /> },
                  ]
                : [
                    { label: 'Private Voice', path: '/work-items', icon: <Lock size={20} /> },
                    { label: 'General', path: '/general', icon: <Inbox size={20} /> },
                  ]),
              { label: 'Notifikasi', path: '/notifications', icon: <Bell size={20} /> },
              { label: 'Akun', path: '/account', icon: <UserRound size={20} /> },
            ].map((a) => (
              <button
                type="button"
                key={a.label}
                className="home-quick__tile"
                onClick={() => void navigate(a.path)}
              >
                <span className="home-quick__icon">{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
function Metric({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="dashboard-summary__metric" data-danger={danger || undefined}>
      <span aria-hidden="true">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
