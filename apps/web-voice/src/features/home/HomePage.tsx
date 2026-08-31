import { Alert, Button, Card, EmptyState, Input, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  Home as HomeIcon,
  Inbox,
  Lock,
  Plus,
  ScrollText,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { AttentionCard } from '../../components/AttentionCard';
import { DashboardChartCard } from '../../components/DashboardChartCard';
import { DonutChart, DonutLegend } from '../../components/DonutChart';
import { FilterPillRow } from '../../components/FilterPills';
import { HeroInset } from '../../components/HeroBand';
import { InboxVoiceCard } from '../../components/InboxVoiceCard';
import { KpiTrio, generalKpiItems, unionKpiItems } from '../../components/KpiTrio';
import { StatusDistribution } from '../../components/StatusDistribution';
import { StatusSummary } from '../../components/StatusSummary';
import { TrendCard } from '../../components/TrendCard';
import { VoiceCard } from '../../components/VoiceCard';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDate,
  formatRelative,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from '../../lib/formatters';
import { bucketValue } from '../../lib/dashboard-math';
import { dashboardDates, type DashboardRange } from '../../lib/dashboard-range';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useOnlineStatus } from '../../lib/use-online-status';
import type { DashboardAggregate } from '../../workforce-api';

type QuickAction = { label: string; icon: React.ReactNode; to: string };

const RANGE_LABELS: Record<DashboardRange, string> = {
  '30d': '30 hari',
  '90d': '90 hari',
  year: 'tahun berjalan',
  all: 'seluruh periode',
  custom: 'rentang kustom',
};

export function HomePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const [searchParams, setSearchParams] = useSearchParams();
  const caps = session?.capabilities ?? [];
  const isOnline = useOnlineStatus();
  const offline = !isOnline;

  const isUnion = caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER'].includes(c));
  const isUnionHead = caps.includes('UNION_HEAD');
  const isMember = caps.includes('MEMBER');
  const isLeadership = caps.some((c) => ['DIVISION_LEADERSHIP', 'DIRECTOR'].includes(c));
  const isResponder = caps.some((c) => ['MANAGER', 'SECTION_HEAD'].includes(c));
  const isManager = caps.includes('MANAGER');

  const member = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'member'),
    queryFn: () => api.dashboardMember(),
    enabled: !!session && isMember && !isUnion,
    refetchInterval: 3000,
  });

  const range = (searchParams.get('range') ?? '30d') as DashboardRange;
  const customFrom = searchParams.get('dashFrom') ?? undefined;
  const customTo = searchParams.get('dashTo') ?? undefined;
  const dashArea = searchParams.get('dashArea') ?? undefined;
  const dashCategory = searchParams.get('dashCategory') ?? undefined;
  const dashSeverity = searchParams.get('dashSeverity') ?? undefined;
  const dashStatus = searchParams.get('dashStatus') ?? undefined;
  const dates = useMemo(
    () => dashboardDates(range, customFrom, customTo),
    [range, customFrom, customTo],
  );
  const scopedDashboard = !isUnion && (isLeadership || isManager);
  const general = useQuery({
    queryKey: voiceQuery(
      sessionId,
      'dashboard',
      'general',
      range,
      customFrom,
      customTo,
      dashArea,
      dashCategory,
      dashSeverity,
      dashStatus,
    ),
    queryFn: () =>
      api.dashboardGeneral({
        ...(scopedDashboard ? dates : {}),
        ...(dashArea ? { area: dashArea } : {}),
        ...(dashCategory ? { category: dashCategory as never } : {}),
        ...(dashSeverity ? { severity: dashSeverity as never } : {}),
        ...(dashStatus ? { status: dashStatus as never } : {}),
      }),
    enabled: !!session && (isUnion || isLeadership || isResponder),
    refetchInterval: 3000,
  });

  const privateDash = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'private'),
    queryFn: () => api.dashboardPrivate(),
    enabled: !!session && isUnion,
    refetchInterval: 3000,
  });

  const privateInbox = useQuery({
    queryKey: voiceQuery(sessionId, 'work-items', 'private-home'),
    queryFn: () => api.workItems({ limit: 6 }),
    enabled: !!session && isUnion,
    refetchInterval: 3000,
  });

  const inbox = useQuery({
    queryKey: voiceQuery(sessionId, 'work-items', 'responder-home'),
    queryFn: () => api.workItems({ limit: 15 }),
    enabled: !!session && isResponder,
    refetchInterval: 3000,
  });

  const greeting = greetingForNow();
  const displayName = session?.account.displayName ?? '';
  const unionSlotLabel = isUnion
    ? caps.includes('UNION_HEAD')
      ? 'Union Head'
      : 'Union Officer'
    : null;
  // Leadership/union heroes show the role instead of the date (screens 20/21).
  const heroSubline = unionSlotLabel
    ? unionSlotLabel
    : isLeadership
      ? (session?.workforceProfile?.structuralPosition ?? 'Leadership')
      : null;

  const quickActions: QuickAction[] = isUnion
    ? [
        { label: 'Private Voice', icon: <Lock size={20} />, to: '/work-items' },
        { label: 'General', icon: <ScrollText size={20} />, to: '/general' },
        { label: 'Notifikasi', icon: <Bell size={20} />, to: '/notifications' },
        { label: 'Akun', icon: <UserRound size={20} />, to: '/account' },
      ]
    : isLeadership
      ? [
          { label: 'Voice Member', icon: <Inbox size={20} />, to: '/work-items' },
          { label: 'Voice Saya', icon: <ClipboardList size={20} />, to: '/history' },
          { label: 'Notifikasi', icon: <Bell size={20} />, to: '/notifications' },
          { label: 'Akun', icon: <UserRound size={20} />, to: '/account' },
        ]
      : isResponder
        ? [
            { label: 'Buat Voice', icon: <Plus size={20} />, to: '/voices/new' },
            { label: 'Voice Member', icon: <Inbox size={20} />, to: '/work-items' },
            { label: 'Voice Saya', icon: <ClipboardList size={20} />, to: '/history' },
            { label: 'Notifikasi', icon: <Bell size={20} />, to: '/notifications' },
            { label: 'Akun', icon: <UserRound size={20} />, to: '/account' },
          ]
        : [
            { label: 'Buat Voice', icon: <Plus size={20} />, to: '/voices/new' },
            { label: 'Voice Saya', icon: <ClipboardList size={20} />, to: '/history' },
            { label: 'Notifikasi', icon: <Bell size={20} />, to: '/notifications' },
            { label: 'Akun', icon: <UserRound size={20} />, to: '/account' },
          ];

  const setParam = (key: string, value?: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === 'range' && value !== 'custom') {
      params.delete('dashFrom');
      params.delete('dashTo');
    }
    setSearchParams(params);
  };

  const generalData = general.data;
  const organizationLevel = isLeadership ? 'division' : 'department';
  const trendTitle = `Trend ${RANGE_LABELS[range]}`;

  return (
    <Stack gap="lg">
      <section className="member-hero">
        <div className="member-hero__top">
          <div className="member-hero__identity">
            <span className="member-hero__avatar">{initialOf(displayName)}</span>
            <div className="member-hero__who">
              <p className="member-hero__greeting">{greeting},</p>
              <h1 className="member-hero__name">{displayName}</h1>
              <p className={heroSubline ? 'member-hero__role' : 'member-hero__date'}>
                {heroSubline ?? formatDate(new Date())}
              </p>
            </div>
          </div>
          <div className="member-hero__actions">
            {!isUnion ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Buat Voice"
                className="member-hero__orb"
                onClick={() => void navigate('/voices/new')}
              >
                <Plus size={20} />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Lihat notifikasi"
              className="member-hero__orb"
              onClick={() => void navigate('/notifications')}
            >
              <Bell size={20} />
            </Button>
          </div>
        </div>
        {isResponder || isLeadership ? (
          <span className="member-hero__context">
            {isLeadership ? (
              <>
                <Lock size={12} aria-hidden="true" /> Leadership · Read-only
              </>
            ) : (
              'Operasional Responder'
            )}
          </span>
        ) : null}
        {isUnion ? (
          <>
            {privateDash.isLoading ? (
              <Skeleton className="home-skeleton" label="Memuat Private Voice" />
            ) : privateDash.data ? (
              <HeroInset
                title="Private Voice"
                watermark={<ShieldCheck />}
                ariaLabel="Ringkasan Private Voice"
              >
                <KpiTrio
                  ariaLabel="Ringkasan Private Voice"
                  items={
                    isUnionHead
                      ? unionKpiItems(
                          privateDash.data.status,
                          privateDash.data.total,
                          privateDash.data.pendingAssignment,
                        )
                      : generalKpiItems(privateDash.data.status, privateDash.data.total)
                  }
                />
              </HeroInset>
            ) : null}
            {isUnionHead && privateDash.data?.pendingAssignment !== undefined ? (
              <button
                type="button"
                className="hero-row"
                onClick={() => void navigate('/work-items?unassigned=true')}
              >
                <span className="hero-row__plate" aria-hidden="true">
                  <ClipboardList size={18} />
                </span>
                <span className="hero-row__label">
                  <span className="hero-row__title">
                    {privateDash.data.pendingAssignment > 0
                      ? `${privateDash.data.pendingAssignment} Private Voice menunggu penugasan`
                      : 'Semua Private Voice sudah ditugaskan'}
                  </span>
                  <span className="hero-row__meta">
                    Tugaskan Union Officer sebelum Voice diproses.
                  </span>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ) : null}
          </>
        ) : isLeadership ? (
          general.isLoading ? (
            <Skeleton className="home-skeleton" label="Memuat ringkasan" />
          ) : generalData ? (
            <HeroInset title="Ringkasan General Voice" ariaLabel="Ringkasan General Voice">
              <KpiTrio
                ariaLabel="Ringkasan General Voice"
                items={generalKpiItems(generalData.status, generalData.total)}
              />
            </HeroInset>
          ) : null
        ) : member.isLoading ? (
          <Skeleton className="home-skeleton" label="Memuat ringkasan" />
        ) : member.data ? (
          <StatusSummary dashboard={member.data} cached={offline} />
        ) : null}
      </section>

      {member.isError ? (
        <Alert tone="danger" title="Gagal memuat ringkasan">
          {member.error instanceof Error ? member.error.message : 'Coba muat ulang halaman.'}
        </Alert>
      ) : null}

      {offline ? (
        <Alert tone="warning" title="Anda sedang offline">
          Ringkasan status mungkin sudah usang. Detail Voice dan seluruh tindakan memerlukan
          koneksi.
        </Alert>
      ) : null}

      {isResponder || isLeadership ? (
        <FilterPillRow
          primary={[
            {
              id: 'dashArea',
              label: 'Seluruh organisasi',
              value: dashArea ?? '',
              onValueChange: (value) => setParam('dashArea', value || undefined),
              options: Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              id: 'range',
              label: 'Rentang',
              value: range,
              onValueChange: (value) => setParam('range', value),
              options: [
                { value: '30d', label: '30 hari terakhir' },
                { value: '90d', label: '90 hari terakhir' },
                { value: 'year', label: 'Tahun berjalan' },
                { value: 'all', label: 'Semua waktu' },
                { value: 'custom', label: 'Pilih tanggal' },
              ],
            },
          ]}
          secondary={[
            {
              id: 'dashCategory',
              label: 'Kategori',
              value: dashCategory ?? '',
              onValueChange: (value) => setParam('dashCategory', value || undefined),
              options: Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              id: 'dashSeverity',
              label: 'Severity',
              value: dashSeverity ?? '',
              onValueChange: (value) => setParam('dashSeverity', value || undefined),
              options: Object.entries(SEVERITY_LABELS).map(([value, label]) => ({ value, label })),
            },
            {
              id: 'dashStatus',
              label: 'Status',
              value: dashStatus ?? '',
              onValueChange: (value) => setParam('dashStatus', value || undefined),
              options: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
            },
          ]}
          onClear={() => {
            const params = new URLSearchParams(searchParams);
            for (const key of [
              'dashArea',
              'dashCategory',
              'dashSeverity',
              'dashStatus',
              'dashFrom',
              'dashTo',
            ])
              params.delete(key);
            setSearchParams(params);
          }}
          customContent={
            range === 'custom' ? (
              <div className="filter-pills__dates">
                <Input
                  label="Dari tanggal"
                  type="date"
                  value={customFrom ?? ''}
                  onChange={(event) => setParam('dashFrom', event.target.value || undefined)}
                />
                <Input
                  label="Sampai tanggal"
                  type="date"
                  value={customTo ?? ''}
                  onChange={(event) => setParam('dashTo', event.target.value || undefined)}
                />
              </div>
            ) : undefined
          }
        />
      ) : null}

      {(isResponder || isLeadership) && generalData ? (
        <>
          <section className="dashboard-section" aria-labelledby="home-general-summary">
            <div className="home-section__head">
              <div>
                <p className="care-eyebrow">General Voice</p>
                <h2 className="home-section__title" id="home-general-summary">
                  Ringkasan General Voice
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void navigate('/work-items')}>
                Lihat semua
              </Button>
            </div>
            <KpiTrio
              ariaLabel="Ringkasan General Voice"
              items={generalKpiItems(generalData.status, generalData.total)}
            />
            {isLeadership ? (
              <>
                <TrendCard
                  title={trendTitle}
                  buckets={generalData.trend}
                  total={generalData.total}
                  previousTotal={generalData.previousTotal ?? undefined}
                />
                <Card className="distribution-card" padding="md">
                  <h3 className="attention-card__title">Distribusi status</h3>
                  <StatusDistribution buckets={generalData.status} />
                </Card>
                <AttentionCard
                  title="Area yang perlu perhatian"
                  ariaLabel="Area yang perlu perhatian"
                  rows={areaAttentionRows(generalData, (area) => setParam('dashArea', area))}
                />
                <p className="info-banner">
                  <ShieldCheck size={15} aria-hidden="true" />
                  Ringkasan tidak menampilkan identitas pelapor.
                </p>
              </>
            ) : (
              <>
                <Card className="distribution-card" padding="md">
                  <h3 className="attention-card__title">Distribusi Status</h3>
                  <div className="donut-card__grid">
                    <DonutLegend buckets={generalData.status} />
                    <DonutChart buckets={generalData.status} />
                  </div>
                </Card>
                <div className="dashboard-chart-grid">
                  <DashboardChartCard title="Severity" buckets={generalData.severity} />
                  <DashboardChartCard title="Kategori" buckets={generalData.category} />
                </div>
                <TrendCard
                  title={trendTitle}
                  buckets={generalData.trend}
                  total={generalData.total}
                  previousTotal={generalData.previousTotal ?? undefined}
                />
                <div className="dashboard-chart-grid__wide">
                  <DashboardChartCard
                    title={
                      organizationLevel === 'division' ? 'Breakdown divisi' : 'Breakdown department'
                    }
                    buckets={
                      organizationLevel === 'division'
                        ? generalData.division
                        : generalData.department
                    }
                    {...(generalData.suppression.enabled
                      ? {
                          caption: `Kelompok di bawah ambang ${generalData.suppression.threshold} digabung untuk menjaga privasi.`,
                        }
                      : {})}
                  />
                </div>
              </>
            )}
          </section>
        </>
      ) : null}

      {(isResponder || isLeadership) && general.isLoading ? (
        <Skeleton label="Memuat dashboard organisasi" />
      ) : null}
      {(isResponder || isLeadership) && general.isError ? (
        <Alert tone="danger" title="Dashboard gagal dimuat">
          Coba muat ulang atau ubah rentang waktu.
        </Alert>
      ) : null}

      {isUnion ? (
        <section className="home-inbox">
          <div className="home-section__head">
            <h2 className="home-section__title">Private terbaru</h2>
            <Button variant="ghost" size="sm" onClick={() => void navigate('/work-items')}>
              Lihat semua
            </Button>
          </div>
          {privateInbox.isLoading ? (
            <Skeleton label="Memuat Private Voice" />
          ) : (privateInbox.data?.items.length ?? 0) === 0 ? (
            <Card>
              <EmptyState
                icon={<Lock size={24} />}
                title={isUnionHead ? 'Belum ada Private Voice' : 'Belum ada penugasan'}
                description={
                  isUnionHead
                    ? 'Private Voice dari reporter akan muncul di sini.'
                    : 'Private Voice yang ditugaskan kepada Anda akan muncul di sini.'
                }
              />
            </Card>
          ) : (
            <div className="inbox-list">
              {privateInbox.data?.items.map((voice) => (
                <InboxVoiceCard
                  key={voice.id}
                  voice={voice}
                  identity={{ alias: voice.reporterAlias ?? null }}
                  onOpen={() => void navigate(`/voices/${voice.id}`)}
                />
              ))}
            </div>
          )}
          {generalData ? (
            <button type="button" className="hero-row" onClick={() => void navigate('/general')}>
              <span className="hero-row__plate" aria-hidden="true">
                <FileCheck2 size={18} />
              </span>
              <span className="hero-row__label">
                <span className="hero-row__title">General Voice · Read-only</span>
                <span className="hero-row__meta">Aggregate organisasi tanpa aksi operasional.</span>
              </span>
              <span className="hero-row__stats">
                <span className="hero-row__stat">
                  <strong>{generalData.total}</strong>
                  <small>Total</small>
                </span>
                <span className="hero-row__stat hero-row__stat--danger">
                  <strong>{bucketValue(generalData.severity, 'CRITICAL')}</strong>
                  <small>Kritis</small>
                </span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ) : null}
        </section>
      ) : null}

      {isResponder ? (
        <section className="home-inbox">
          <div className="home-section__head">
            <h2 className="home-section__title">Inbox Voice Member</h2>
            <Button variant="ghost" size="sm" onClick={() => void navigate('/work-items')}>
              Lihat semua
            </Button>
          </div>
          {inbox.isLoading ? (
            <Skeleton label="Memuat inbox" />
          ) : (inbox.data?.items.length ?? 0) === 0 ? (
            <Card>
              <EmptyState
                icon={<Inbox size={24} />}
                title="Tidak ada Voice ditugaskan"
                description="Voice yang rutenya menjadi tanggung jawab Anda akan muncul di sini."
              />
            </Card>
          ) : (
            <div className="inbox-list">
              {inbox.data?.items.slice(0, 3).map((voice) => (
                <InboxVoiceCard
                  key={voice.id}
                  voice={voice}
                  onOpen={() => void navigate(`/voices/${voice.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!isUnion ? (
        <section className="home-recent">
          <div className="home-section__head">
            <h2 className="home-section__title">Voice Anda</h2>
            <Button size="sm" className="home-cta" onClick={() => void navigate('/voices/new')}>
              <Plus size={16} /> Buat Voice
            </Button>
          </div>
          {offline ? (
            <Card>
              <EmptyState
                icon={<Inbox size={24} />}
                title="Detail memerlukan koneksi"
                description="Sambungkan kembali untuk melihat daftar Voice Anda, draft tersimpan, dan pembaruan terbaru."
              />
            </Card>
          ) : member.data?.draft ? (
            <Card className="home-resume" padding="md" data-tone="accent">
              <div>
                <p className="home-resume__eyebrow">Draft tersimpan</p>
                <h3 className="home-resume__title">{member.data.draft.title}</h3>
                <p className="home-resume__meta">
                  Diperbarui {formatRelative(member.data.draft.updatedAt)} ·{' '}
                  {member.data.draft.visibility}
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void navigate(`/drafts/${member.data?.draft?.id}/edit`)}
              >
                Lanjutkan
              </Button>
            </Card>
          ) : null}
          {offline ? null : member.isLoading ? (
            <Skeleton label="Memuat Voice terbaru" />
          ) : (member.data?.recent.length ?? 0) === 0 ? (
            <Card>
              <EmptyState
                icon={<HomeIcon size={24} />}
                title="Belum ada Voice"
                description="Buat Voice pertama Anda untuk mulai menyampaikan suara."
                action={
                  <Button onClick={() => void navigate('/voices/new')}>
                    <Plus size={18} /> Buat Voice
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="voice-grid">
                {member.data?.recent.map((voice) => (
                  <VoiceCard
                    key={voice.id}
                    voice={voice}
                    onOpen={() => void navigate(`/voices/${voice.id}`)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="home-viewall"
                onClick={() => void navigate('/history')}
              >
                Lihat semua
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </>
          )}
        </section>
      ) : null}

      <section className="home-quick" aria-label="Aksi cepat">
        <h2 className="home-section__title">Aksi cepat</h2>
        <div className="home-quick__grid">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className="home-quick__tile"
              onClick={() => void navigate(action.to)}
            >
              <span className="home-quick__icon" aria-hidden="true">
                {action.icon}
              </span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </Stack>
  );
}

/** "Area yang perlu perhatian" rows: critical count first, then total volume. */
function areaAttentionRows(data: DashboardAggregate, onPick: (area: string) => void) {
  const criticalByArea = new Map(data.areaCritical.map((bucket) => [bucket.label, bucket.value]));
  return [...data.area]
    .filter((bucket) => bucket.label !== 'OTHER_SUPPRESSED')
    .sort((a, b) => b.value - a.value)
    .slice(0, 4)
    .map((bucket) => {
      const critical = criticalByArea.get(bucket.label) ?? 0;
      return {
        key: bucket.label,
        icon: critical > 0 ? <AlertTriangle size={18} /> : <Activity size={18} />,
        label: AREA_LABELS[bucket.label] ?? bucket.label,
        tone: critical > 0 ? ('danger' as const) : ('brand' as const),
        value: critical > 0 ? `${critical} Kritis` : `${bucket.value} Voice`,
        onClick: () => onPick(bucket.label),
      };
    });
}

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function initialOf(name: string): string {
  return (name?.trim().charAt(0) ?? 'C').toUpperCase();
}
