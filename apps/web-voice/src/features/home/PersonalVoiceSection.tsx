import { Alert, Button, Card, EmptyState, Skeleton } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Inbox, Plus, Home as HomeIcon, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useOnlineStatus } from '../../lib/use-online-status';
import { StatusSummary } from '../../components/StatusSummary';
import { AttentionCard } from '../../components/AttentionCard';
import { VoiceCard } from '../../components/VoiceCard';
import { formatRelative, formatRemaining } from '../../lib/formatters';
export function PersonalVoiceSection() {
  const api = useApi();
  const sessionId = useSessionId();
  const navigate = useNavigate();
  const offline = !useOnlineStatus();
  const member = useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'member'),
    queryFn: () => api.dashboardMember(),
    refetchInterval: offline ? false : 3000,
  });
  return (
    <div className="dashboard-personal">
      {member.data ? <StatusSummary dashboard={member.data} cached={offline} /> : null}
      {member.isError ? (
        <Alert tone="danger" title="Voice Saya gagal dimuat">
          <Button onClick={() => void member.refetch()}>Coba lagi</Button>
        </Alert>
      ) : null}
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
        {!offline && (member.data?.closedPendingReview ?? 0) > 0 && member.data ? (
          <AttentionCard
            title="Menunggu penilaian Anda"
            ariaLabel="Voice yang menunggu penilaian Anda"
            rows={member.data.recent
              .filter((voice) => voice.closureReviewState === 'PENDING')
              .map((voice) => ({
                key: voice.id,
                icon: <Star size={18} />,
                label: voice.title,
                description: `${voice.displayId} · otomatis diterima ${formatRemaining(
                  voice.closureReviewDeadline,
                )}`,
                tone: 'danger' as const,
                onClick: () => void navigate(`/voices/${voice.id}`),
              }))}
            caption="Voice yang tidak dinilai dalam 2 hari diterima otomatis."
          />
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
    </div>
  );
}
