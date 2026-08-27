import { Alert, Button, Card, EmptyState, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { Bell, Home as HomeIcon, Inbox, Plus, ShieldCheck, ScrollText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { DashboardChartCard } from '../../components/DashboardChartCard';
import { StatusSummary } from '../../components/StatusSummary';
import { VoiceCard } from '../../components/VoiceCard';
import { formatDateTime, formatRelative } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useOnlineStatus } from '../../lib/use-online-status';

export function HomePage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const caps = session?.capabilities ?? [];
  const isOnline = useOnlineStatus();
  const offline = !isOnline;

  const isUnion = caps.some((c) => ['UNION_HEAD', 'UNION_OFFICER'].includes(c));
  const isLeadership = caps.some((c) => ['DIVISION_LEADERSHIP', 'DIRECTOR'].includes(c));
  const isResponder = caps.some((c) => ['MANAGER', 'SECTION_HEAD'].includes(c));
  const isSectionHead = caps.includes('SECTION_HEAD');

  const member = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'member'),
    queryFn: () => api.dashboardMember(),
    enabled: !!session,
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

  const inbox = useQuery({
    queryKey: voiceQuery(sessionId, 'work-items'),
    queryFn: () => api.workItems({ limit: 15 }),
    enabled: !!session && isResponder,
    refetchInterval: 3000,
  });

  const greeting = greetingForNow();
  const displayName = session?.account.displayName ?? '';

  return (
    <Stack gap="lg">
      <section className="member-hero">
        <div className="member-hero__top">
          <div className="member-hero__identity">
            <span className="member-hero__avatar">{initialOf(displayName)}</span>
            <div>
              <p className="member-hero__greeting">{greeting},</p>
              <h1 className="member-hero__name">{displayName}</h1>
              <p className="member-hero__date">{formatDateTime(new Date())}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Lihat notifikasi"
            onClick={() => void navigate('/notifications')}
            className="member-hero__bell"
          >
            <Bell size={22} />
          </Button>
        </div>
        {isResponder || isUnion || isLeadership ? (
          <div className="member-hero__context">
            <span className="member-hero__cap">
              {isUnion
                ? 'Operasional Union'
                : isLeadership
                  ? 'Tampilan Leadership'
                  : 'Operasional Responder'}
            </span>
          </div>
        ) : null}
        <div className="member-hero__cta">
          <Button variant="primary" onClick={() => void navigate('/voices/new')}>
            <Plus size={18} /> Buat Voice
          </Button>
        </div>
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

      {member.isLoading ? (
        <Skeleton className="home-skeleton" label="Memuat ringkasan" />
      ) : member.data ? (
        <StatusSummary dashboard={member.data} cached={offline} />
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

      {isResponder ? (
        <section className="home-inbox">
          <div className="home-section__head">
            <div>
              <p className="care-eyebrow">Operasional</p>
              <h2 className="home-section__title">Inbox Voice Member</h2>
            </div>
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
            <div>
              <p className="care-eyebrow">Leadership (read-only)</p>
              <h2 className="home-section__title">Ringkasan General</h2>
            </div>
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
            <div>
              <p className="care-eyebrow">Section Head</p>
              <h2 className="home-section__title">Voice Ditugaskan</h2>
            </div>
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

      <section className="home-recent">
        <div className="home-section__head">
          <div>
            <p className="care-eyebrow">Aktivitas terbaru</p>
            <h2 className="home-section__title">Voice Anda</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void navigate('/history')}>
            Riwayat
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
          <div className="voice-grid">
            {member.data?.recent.map((voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                onOpen={() => void navigate(`/voices/${voice.id}`)}
              />
            ))}
          </div>
        )}
      </section>

      {isUnion || isLeadership ? (
        <Card>
          <EmptyState
            icon={isUnion ? <ShieldCheck size={24} /> : <ScrollText size={24} />}
            title={isUnion ? 'Akses Union' : 'Akses Leadership'}
            description={
              isUnion
                ? 'Akses detail General bersifat read-only dan Private terisolasi berdasarkan scope.'
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
