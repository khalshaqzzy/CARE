import { Alert, Button, Card, EmptyState, Input, Select, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ChevronRight,
  ClipboardList,
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
import { DashboardChartCard } from '../../components/DashboardChartCard';
import { DashboardOverview } from '../../components/DashboardOverview';
import { StatusSummary } from '../../components/StatusSummary';
import { VoiceCard } from '../../components/VoiceCard';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDate,
  formatRelative,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from '../../lib/formatters';
import { dashboardDates, type DashboardRange } from '../../lib/dashboard-range';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useOnlineStatus } from '../../lib/use-online-status';

type QuickAction = { label: string; icon: React.ReactNode; to: string };

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
  const isSectionHead = caps.includes('SECTION_HEAD');

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

  return (
    <Stack gap="lg">
      <section className="member-hero">
        <div className="member-hero__top">
          <div className="member-hero__identity">
            <span className="member-hero__avatar">{initialOf(displayName)}</span>
            <div className="member-hero__who">
              <p className="member-hero__greeting">{greeting},</p>
              <h1 className="member-hero__name">{displayName}</h1>
              <p className="member-hero__date">{formatDate(new Date())}</p>
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
        {isResponder || isUnion || isLeadership ? (
          <span className="member-hero__context">
            {isUnion
              ? 'Operasional Union'
              : isLeadership
                ? 'Tampilan Leadership'
                : 'Operasional Responder'}
          </span>
        ) : null}
        {member.isLoading ? (
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

      {isUnion ? (
        <Stack gap="md" className="home-dash-row">
          {privateDash.data ? (
            <DashboardChartCard
              title="Private Voice"
              buckets={privateDash.data.status}
              total={privateDash.data.total}
            />
          ) : null}
          {general.data ? (
            <DashboardChartCard
              title="General (read-only)"
              buckets={general.data.status}
              total={general.data.total}
            />
          ) : null}
        </Stack>
      ) : null}

      {isUnionHead && privateDash.data?.pendingAssignment !== undefined ? (
        <Card
          className="home-resume"
          padding="md"
          {...(privateDash.data.pendingAssignment > 0 ? { 'data-tone': 'accent' } : {})}
        >
          <div>
            <p className="home-resume__eyebrow">Penugasan</p>
            <h3 className="home-resume__title">
              {privateDash.data.pendingAssignment > 0
                ? `${privateDash.data.pendingAssignment} Private Voice menunggu penugasan`
                : 'Semua Private Voice sudah ditugaskan'}
            </h3>
            <p className="home-resume__meta">
              Tugaskan Union 1 atau Union 2 sebelum Voice diproses lebih lanjut.
            </p>
          </div>
          <Button
            variant={privateDash.data.pendingAssignment > 0 ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => void navigate('/work-items?unassigned=true')}
          >
            Tinjau
          </Button>
        </Card>
      ) : null}

      {isManager || isLeadership ? (
        <section className="dashboard-section">
          <Card className="dashboard-filters">
            <div className="dashboard-filters__grid">
              <Select
                label="Rentang"
                value={range}
                onValueChange={(value) =>
                  setDashboardParam(searchParams, setSearchParams, 'range', value)
                }
                options={[
                  { value: '30d', label: '30 hari terakhir' },
                  { value: '90d', label: '90 hari terakhir' },
                  { value: 'year', label: 'Tahun berjalan' },
                  { value: 'all', label: 'Semua waktu' },
                  { value: 'custom', label: 'Pilih tanggal' },
                ]}
              />
              <Select
                label="Area"
                value={dashArea ?? ''}
                onValueChange={(value) =>
                  setDashboardParam(searchParams, setSearchParams, 'dashArea', value || undefined)
                }
                options={Object.entries(AREA_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <Select
                label="Kategori"
                value={dashCategory ?? ''}
                onValueChange={(value) =>
                  setDashboardParam(
                    searchParams,
                    setSearchParams,
                    'dashCategory',
                    value || undefined,
                  )
                }
                options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Select
                label="Severity"
                value={dashSeverity ?? ''}
                onValueChange={(value) =>
                  setDashboardParam(
                    searchParams,
                    setSearchParams,
                    'dashSeverity',
                    value || undefined,
                  )
                }
                options={Object.entries(SEVERITY_LABELS).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
              <Select
                label="Status"
                value={dashStatus ?? ''}
                onValueChange={(value) =>
                  setDashboardParam(searchParams, setSearchParams, 'dashStatus', value || undefined)
                }
                options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
              />
              {range === 'custom' ? (
                <>
                  <Input
                    label="Dari tanggal"
                    type="date"
                    value={customFrom ?? ''}
                    onChange={(event) =>
                      setDashboardParam(
                        searchParams,
                        setSearchParams,
                        'dashFrom',
                        event.target.value || undefined,
                      )
                    }
                  />
                  <Input
                    label="Sampai tanggal"
                    type="date"
                    value={customTo ?? ''}
                    onChange={(event) =>
                      setDashboardParam(
                        searchParams,
                        setSearchParams,
                        'dashTo',
                        event.target.value || undefined,
                      )
                    }
                  />
                </>
              ) : null}
            </div>
          </Card>
          {general.isLoading ? (
            <Skeleton label="Memuat dashboard organisasi" />
          ) : general.isError ? (
            <Alert tone="danger" title="Dashboard gagal dimuat">
              Coba muat ulang atau ubah rentang waktu.
            </Alert>
          ) : general.data ? (
            <DashboardOverview
              data={general.data}
              organizationLevel={isLeadership ? 'division' : 'department'}
            />
          ) : null}
        </section>
      ) : null}

      {isUnion ? (
        <section className="home-inbox">
          <div className="home-section__head">
            <h2 className="home-section__title">Private Voice</h2>
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
            <div className="voice-grid">
              {privateInbox.data?.items.map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  onOpen={() => void navigate(`/voices/${voice.id}`)}
                />
              ))}
            </div>
          )}
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
            <div className="voice-grid">
              {inbox.data?.items.slice(0, 6).map((voice) => (
                <VoiceCard
                  key={voice.id}
                  voice={voice}
                  onOpen={() => void navigate(`/voices/${voice.id}`)}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {isSectionHead && !isManager && general.data ? (
        <section>
          <div className="home-section__head">
            <h2 className="home-section__title">Voice Ditugaskan</h2>
          </div>
          <div className="home-dash-row">
            <DashboardChartCard
              title="Status"
              buckets={general.data.status}
              total={general.data.total}
            />
            <DashboardChartCard title="Severity" buckets={general.data.severity} />
          </div>
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

      {isUnion || isLeadership ? (
        <Card>
          <EmptyState
            icon={isUnion ? <ShieldCheck size={24} /> : <ScrollText size={24} />}
            title={isUnion ? 'Akses Union' : 'Akses Leadership'}
            description={
              isUnionHead
                ? 'Anda menangani seluruh Private Voice dan dapat menugaskan Union Officer. Detail General bersifat read-only.'
                : isUnion
                  ? 'Anda menangani Private Voice yang ditugaskan. Detail General bersifat read-only.'
                  : 'Detail General hanya dapat dibaca pada scope yang diizinkan; tidak ada aksi lifecycle.'
            }
          />
        </Card>
      ) : null}
    </Stack>
  );
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

function setDashboardParam(
  current: URLSearchParams,
  setSearchParams: (next: URLSearchParams) => void,
  key: string,
  value?: string,
) {
  const params = new URLSearchParams(current);
  if (value) params.set(key, value);
  else params.delete(key);
  if (key === 'range' && value !== 'custom') {
    params.delete('dashFrom');
    params.delete('dashTo');
  }
  setSearchParams(params);
}
