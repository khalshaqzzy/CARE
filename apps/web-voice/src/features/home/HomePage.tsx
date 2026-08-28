import { Alert, Button, Card, EmptyState, Skeleton, Stack } from '@care/ui';
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
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { DashboardChartCard } from '../../components/DashboardChartCard';
import { StatusSummary } from '../../components/StatusSummary';
import { VoiceCard } from '../../components/VoiceCard';
import { formatDate, formatRelative } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useOnlineStatus } from '../../lib/use-online-status';

type QuickAction = { label: string; icon: React.ReactNode; to: string };

export function HomePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const caps = session?.capabilities ?? [];
  const isOnline = useOnlineStatus();
  const offline = !isOnline;

  const isUnion = caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER'].includes(c));
  const isUnionHead = caps.includes('UNION_HEAD');
  const isMember = caps.includes('MEMBER');
  const isLeadership = caps.some((c) => ['DIVISION_LEADERSHIP', 'DIRECTOR'].includes(c));
  const isResponder = caps.some((c) => ['MANAGER', 'SECTION_HEAD'].includes(c));
  const isSectionHead = caps.includes('SECTION_HEAD');

  const member = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'member'),
    queryFn: () => api.dashboardMember(),
    enabled: !!session && isMember && !isUnion,
    refetchInterval: 3000,
  });

  const general = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'general'),
    queryFn: () => api.dashboardGeneral(),
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
          { label: 'General', icon: <ScrollText size={20} />, to: '/general' },
          { label: 'Notifikasi', icon: <Bell size={20} />, to: '/notifications' },
          { label: 'Akun', icon: <UserRound size={20} />, to: '/account' },
        ]
      : isResponder
        ? [
            { label: 'Buat Voice', icon: <Plus size={20} />, to: '/voices/new' },
            { label: 'Voice Member', icon: <Inbox size={20} />, to: '/work-items' },
            { label: 'Notifikasi', icon: <Bell size={20} />, to: '/notifications' },
            { label: 'Akun', icon: <UserRound size={20} />, to: '/account' },
          ]
        : [
            { label: 'Buat Voice', icon: <Plus size={20} />, to: '/voices/new' },
            { label: 'Riwayat', icon: <ClipboardList size={20} />, to: '/history' },
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

      {isLeadership && general.data ? (
        <section>
          <div className="home-section__head">
            <h2 className="home-section__title">Ringkasan General</h2>
          </div>
          <div className="home-dash-row">
            <DashboardChartCard
              title="Status"
              buckets={general.data.status}
              total={general.data.total}
            />
            <DashboardChartCard title="Severity" buckets={general.data.severity} />
            <DashboardChartCard title="Kategori" buckets={general.data.category} />
          </div>
        </section>
      ) : null}

      {isSectionHead && general.data ? (
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
            <Card className="home-resume" data-tone="accent">
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
              {action.icon}
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
