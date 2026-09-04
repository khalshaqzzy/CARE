import {
  Badge,
  Button,
  Card,
  DotLabel,
  DisclosureRow,
  EmptyState,
  RatingInput,
  Skeleton,
  Stack,
  Textarea,
} from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Clock, Info, Map, MessageCircle, Sparkles, UserRound } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@care/frontend-core';
import { ActionPanel } from '../../components/ActionPanel';
import { LinkCard } from '../../components/LinkCard';
import { MediaGallery } from '../../components/MediaGallery';
import { VoiceHero } from '../../components/VoiceHero';
import { HandoverHistoryList } from '../../components/HandoverHistoryList';
import {
  CATEGORY_LABELS,
  CLOSURE_REVIEW_LABELS,
  formatDate,
  formatDateTime,
  formatRemaining,
} from '../../lib/formatters';
import { useApi, useMutationKey, useSessionId, voiceQuery } from '../../lib/query';
import { useConversation } from '../../lib/useConversation';
import { categoryIcon } from '../../lib/voice-visuals';
import { VOICE_ACTION_LABELS } from '../../lib/formatters';
import { useCursorFeed } from '../../lib/useCursorFeed';
import type { Attachment, TimelineEvent, VoiceDetail } from '../../workforce-api';

type ClosureCycle = {
  id: string;
  cycleNumber: number;
  note: string;
  closedAt: string;
  reopenedAt: string | null;
  reviewState?: 'PENDING' | 'ACCEPTED' | 'REJECTED' | null;
  reviewDeadline?: string | null;
  reviewResolvedAt?: string | null;
  evidence: { id: string; purpose: string }[];
  rating: { score: number; feedback: string | null; reopen: boolean } | null;
};

export function VoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const back = () => {
    // Deep links have no in-app history to return to; land on the root instead.
    if (window.history.length > 1 && location.key !== 'default') void navigate(-1);
    else void navigate('/');
  };

  const detail = useQuery({
    queryKey: voiceQuery(sessionId, 'voice', id),
    queryFn: () => api.voiceDetail(id!),
    enabled: !!id && !!session,
    refetchInterval: 3000,
  });

  if (detail.isLoading) {
    return (
      <Stack gap="lg">
        <Skeleton label="Memuat detail Voice" />
      </Stack>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <EmptyState
        title="Voice tidak tersedia"
        description="Voice tidak ditemukan atau Anda tidak memiliki akses."
      />
    );
  }
  const voice = detail.data;
  const cycles = (voice.closureCycles ?? []) as ClosureCycle[];
  const CategoryIcon = categoryIcon(voice.category);

  return (
    <Stack gap="lg">
      <VoiceHero voice={voice} variant="full" onBack={back} />

      <ReporterCard voice={voice} />

      <ActionPanel detail={voice} />

      {voice.visibility === 'GENERAL' && voice.audience === 'GENERAL_RESPONDER' ? (
        <ParticipantHandovers voiceId={voice.id} />
      ) : null}

      <section className="voice-detail" aria-label="Detail Voice">
        <h2 className="voice-detail__heading">Detail Voice</h2>
        <p className="voice-detail__body">{voice.detail}</p>
        <ul className="voice-meta-list">
          <li>
            <CalendarDays size={17} aria-hidden="true" />
            <span className="voice-meta-list__label">Diajukan</span>
            <strong>{formatDateTime(voice.submittedAt)}</strong>
          </li>
          <li>
            <Clock size={17} aria-hidden="true" />
            <span className="voice-meta-list__label">Diperbarui</span>
            <strong>{formatDateTime(voice.updatedAt)}</strong>
          </li>
          <li>
            <Sparkles size={17} aria-hidden="true" />
            <span className="voice-meta-list__label">Klasifikasi</span>
            <strong>
              {voice.classificationSource === 'AI'
                ? 'AI'
                : voice.classificationSource
                  ? 'Manual Fallback'
                  : '—'}
            </strong>
          </li>
          {voice.category ? (
            <li>
              <CategoryIcon size={17} aria-hidden="true" />
              <span className="voice-meta-list__label">Kategori</span>
              <strong>
                {voice.categoryNameSnapshot ?? CATEGORY_LABELS[voice.category] ?? voice.category}
              </strong>
            </li>
          ) : null}
          {voice.classificationCategory?.key &&
          voice.classificationCategory.key !== voice.category ? (
            <li>
              <Info size={17} aria-hidden="true" />
              <span className="voice-meta-list__label">Klasifikasi awal</span>
              <strong>
                {voice.classificationCategory.name ??
                  CATEGORY_LABELS[voice.classificationCategory.key] ??
                  voice.classificationCategory.key}
              </strong>
            </li>
          ) : null}
          {voice.locationReview ? (
            <li>
              <Map size={17} aria-hidden="true" />
              <span className="voice-meta-list__label">Kelengkapan lokasi</span>
              <strong>
                {voice.locationReview.completeness === 'INCOMPLETE'
                  ? 'Belum lengkap'
                  : voice.locationReview.completeness === 'COMPLETE'
                    ? 'Lengkap'
                    : 'Tidak diketahui'}
              </strong>
            </li>
          ) : null}
        </ul>
      </section>

      {voice.attachments?.length ? (
        <Card padding="md">
          <MediaGallery attachments={voice.attachments} variant="row" />
        </Card>
      ) : null}

      {voice.conversationState !== 'UNAVAILABLE' ? <ConversationLink voice={voice} /> : null}

      <ClosureSection cycles={cycles} />

      {voice.availableActions?.includes('RATE') ? <RatingCard voice={voice} /> : null}

      <Timeline voiceId={voice.id} />
    </Stack>
  );
}

function ParticipantHandovers({ voiceId }: { voiceId: string }) {
  const api = useApi();
  const sessionId = useSessionId();
  const history = useQuery({
    queryKey: voiceQuery(sessionId, 'handovers', voiceId),
    queryFn: () => api.handovers(voiceId),
  });
  const visible = (history.data?.items ?? []).filter((item) => item.detail !== undefined);
  if (!visible.length) return null;
  return (
    <section className="voice-handovers" aria-labelledby="voice-handovers-title">
      <div>
        <h2 id="voice-handovers-title">Handover terkait Anda</h2>
        <p>Detail privat hanya tampil pada transfer yang melibatkan Anda.</p>
      </div>
      <HandoverHistoryList items={visible} />
    </section>
  );
}

/** Conversation summary row; the room itself lives on the dedicated chat page. */
function ConversationLink({ voice }: { voice: VoiceDetail }) {
  const navigate = useNavigate();
  const { feed, items } = useConversation(voice.id);
  const subtitle =
    voice.conversationState === 'READ_ONLY' ? 'Hanya baca' : `${items.length} pesan · aktif`;
  return (
    <LinkCard
      icon={<MessageCircle size={20} />}
      title="Percakapan"
      description={feed.isLoading ? 'Memuat…' : subtitle}
      trailing={<span className="link-card__cta">Buka Chat</span>}
      onClick={() => void navigate(`/voices/${voice.id}/chat`)}
    />
  );
}

function ReporterCard({ voice }: { voice: VoiceDetail }) {
  // The reporter block exists only where the contract grants it: the Union sees
  // the immutable consent snapshot (SHOW) as a card, or a per-Voice alias
  // inside the hero card (HIDE). Other audiences keep the surfaces unchanged.
  if (voice.audience === 'UNION_IDENTIFIED') {
    return (
      <Card className="voice-reporter" padding="md">
        <div className="voice-reporter__identity">
          <span className="voice-reporter__avatar" aria-hidden="true">
            <UserRound size={24} />
          </span>
          <div className="voice-reporter__who">
            <p className="voice-reporter__name">{voice.reporter.name}</p>
            <p className="voice-reporter__detail">No. Registrasi</p>
            <p className="voice-reporter__reg">{voice.reporter.noReg}</p>
            <p className="voice-reporter__detail">
              {voice.reporter.division} · {voice.reporter.department}
            </p>
          </div>
        </div>
      </Card>
    );
  }
  return null;
}

/**
 * Reporter-facing closure rating. Rating and the reopen decision leave in one
 * atomic mutation (PRD §17.3). For a timely low score the two submit actions
 * make the decision explicit: "Buka kembali" sends `reopen: true` immediately,
 * while "Kirim tanpa buka kembali" accepts the closure. After auto-acceptance
 * the card switches to the late-rating variant: feedback only, never reopen.
 */
function RatingCard({ voice }: { voice: VoiceDetail }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const rateKey = useMutationKey('rate');
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cycles = (voice.closureCycles ?? []) as ClosureCycle[];
  const latest = [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber).at(-1);
  const autoAccepted = latest?.reviewState === 'ACCEPTED' && !latest.rating;
  const deadline = autoAccepted ? null : (latest?.reviewDeadline ?? null);
  const deadlineMs = deadline ? new Date(deadline).getTime() : Number.NaN;
  const [reviewWindowOpen, setReviewWindowOpen] = useState(
    () => Number.isFinite(deadlineMs) && deadlineMs >= Date.now(),
  );

  useEffect(() => {
    if (!Number.isFinite(deadlineMs)) {
      setReviewWindowOpen(false);
      return;
    }
    const remaining = deadlineMs - Date.now();
    setReviewWindowOpen(remaining >= 0);
    if (remaining < 0) return;
    let timer: number | undefined;
    const refreshAtDeadline = () => {
      const nextRemaining = deadlineMs - Date.now();
      if (nextRemaining < 0) {
        setReviewWindowOpen(false);
        return;
      }
      timer = window.setTimeout(refreshAtDeadline, Math.min(nextRemaining + 1, 2_147_483_647));
    };
    timer = window.setTimeout(refreshAtDeadline, Math.min(remaining + 1, 2_147_483_647));
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [deadlineMs]);

  const rate = useMutation({
    mutationFn: (body: { score: number; feedback?: string; reopen: boolean }) =>
      api.rate(voice.id, body, rateKey.key()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', voice.id) });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: rateKey.reset,
  });

  const needsFeedback = score !== null && score <= 2;
  const canSubmit = score !== null && (!needsFeedback || feedback.trim().length > 0);
  const submitRating = (reopen: boolean) => {
    if (score === null) return;
    setError(null);
    if (reopen && (!reviewWindowOpen || deadlineMs < Date.now())) {
      setReviewWindowOpen(false);
      setError(
        'Jendela buka kembali baru saja berakhir. Penilaian belum dikirim; periksa kembali pilihan Anda.',
      );
      return;
    }
    const trimmed = feedback.trim();
    rate.mutate({
      score,
      reopen,
      ...(trimmed ? { feedback: trimmed } : {}),
    });
  };

  return (
    <Card padding="md" className="rating-card">
      <Stack gap="md">
        <h3 className="rating-card__question">Bagaimana hasil tindak lanjutnya?</h3>
        {autoAccepted && latest ? (
          <p className="rating-card__notice" role="note">
            <Info size={16} aria-hidden="true" />
            <span>
              Voice diterima otomatis {formatDateTime(latest.reviewResolvedAt)} karena tidak ada
              penilaian dalam 2 hari. Anda masih dapat memberikan penilaian sebagai masukan.
            </span>
          </p>
        ) : deadline ? (
          <p className="rating-card__notice" role="note">
            <Clock size={16} aria-hidden="true" />
            <span>
              Beri penilaian dalam {formatRemaining(deadline)} — setelah itu Voice diterima
              otomatis.
            </span>
          </p>
        ) : null}
        {error ? (
          <p className="rating-card__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="rating-card__field">
          <span className="rating-card__label">Beri rating</span>
          <RatingInput
            label="Beri rating"
            {...(score === null ? {} : { value: score })}
            onValueChange={setScore}
            disabled={rate.isPending}
          />
        </div>
        <Textarea
          label="Umpan balik"
          hideLabel
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Tulis umpan balik"
          aria-label="Tulis umpan balik"
          counter={`${feedback.length}/2000`}
          {...(needsFeedback ? { helperText: 'Feedback wajib untuk rating 1–2.' } : {})}
        />
        {needsFeedback && !autoAccepted && reviewWindowOpen ? (
          <div className="rating-card__decision">
            <p className="rating-card__reopen-note">
              Masalah belum selesai? Rating dan reopen akan dikirim bersamaan.
            </p>
            <div className="rating-card__actions">
              <Button
                variant="secondary"
                onClick={() => submitRating(false)}
                loading={rate.isPending}
                disabled={!canSubmit}
              >
                Kirim tanpa buka kembali
              </Button>
              <Button
                onClick={() => submitRating(true)}
                loading={rate.isPending}
                disabled={!canSubmit}
              >
                Buka kembali
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={() => submitRating(false)}
            loading={rate.isPending}
            disabled={!canSubmit}
          >
            Kirim penilaian
          </Button>
        )}
      </Stack>
    </Card>
  );
}

/** Latest closure is featured; older cycles collapse behind a row. */
function ClosureSection({ cycles }: { cycles: ClosureCycle[] }) {
  if (!cycles.length) return null;
  const sorted = [...cycles].sort((a, b) => a.cycleNumber - b.cycleNumber);
  const latest = sorted[sorted.length - 1];
  if (!latest) return null;
  const previous = sorted.slice(0, -1);
  return (
    <Stack gap="md">
      <Card padding="md" className="closure-featured">
        <Stack gap="md">
          <h3 className="section-title">Penyelesaian</h3>
          <p className="closure-featured__note">{latest.note}</p>
          {latest.evidence?.length ? (
            <MediaGallery attachments={latest.evidence as Attachment[]} label="Bukti penutupan" />
          ) : null}
          {latest.rating ? (
            <div className="closure-featured__rating">
              <RatingInput label="Rating Anda" value={latest.rating.score} readOnly />
              {latest.rating.feedback ? (
                <p className="closure-featured__feedback">“{latest.rating.feedback}”</p>
              ) : null}
              {latest.rating.reopen ? (
                <Badge tone="warning">Ditolak · dibuka kembali</Badge>
              ) : (
                <Badge tone="success">Diterima</Badge>
              )}
            </div>
          ) : latest.reviewState === 'ACCEPTED' ? (
            <div className="closure-featured__rating">
              <Badge tone="success">Diterima otomatis</Badge>
              <p className="closure-featured__feedback">
                Tidak ada penilaian dalam 2 hari; penyelesaian diterima otomatis.
              </p>
            </div>
          ) : (
            <div className="closure-featured__rating">
              <Badge tone="warning">{CLOSURE_REVIEW_LABELS.PENDING}</Badge>
              {latest.reviewDeadline ? (
                <p className="closure-featured__feedback">
                  Otomatis diterima {formatDateTime(latest.reviewDeadline)} tanpa penilaian.
                </p>
              ) : null}
            </div>
          )}
          <p className="closure-featured__meta">
            Ditutup {formatDateTime(latest.closedAt)}
            {latest.reopenedAt ? ` · dibuka kembali ${formatDateTime(latest.reopenedAt)}` : ''}
          </p>
        </Stack>
      </Card>
      {previous.map((cycle) => (
        <DisclosureRow
          key={cycle.id}
          title={`Siklus penutupan #${cycle.cycleNumber}`}
          description={`Ditutup ${formatDate(cycle.closedAt)}`}
        >
          <Stack gap="sm">
            <p className="closure-featured__note">{cycle.note}</p>
            {cycle.rating ? (
              <DotLabel tone={cycle.rating.reopen ? 'warning' : 'neutral'}>
                Rating {cycle.rating.score}/5{cycle.rating.reopen ? ' · Ditolak' : ''}
              </DotLabel>
            ) : null}
            {cycle.evidence?.length ? (
              <MediaGallery attachments={cycle.evidence as Attachment[]} label="Bukti penutupan" />
            ) : null}
            {cycle.rating?.feedback ? (
              <p className="closure-featured__feedback">“{cycle.rating.feedback}”</p>
            ) : null}
          </Stack>
        </DisclosureRow>
      ))}
    </Stack>
  );
}

function Timeline({ voiceId }: { voiceId: string }) {
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const feed = useCursorFeed<TimelineEvent>({
    queryKey: voiceQuery(sessionId, 'voice', voiceId, 'timeline'),
    fetchPage: (cursor) =>
      api.voiceTimeline(voiceId, {
        limit: 30,
        order: 'desc',
        ...(cursor ? { cursor } : {}),
      }),
    enabled: !!session,
    refetchInterval: 3000,
    resetKey: voiceId,
  });

  const count = feed.items.length;
  const subtitle = feed.isLoading
    ? 'Memuat…'
    : count
      ? `${count}${feed.canLoadMore ? '+' : ''} pembaruan`
      : 'Belum ada pembaruan';

  return (
    <DisclosureRow
      className="link-disclosure"
      icon={<Clock size={20} />}
      title="Timeline"
      description={subtitle}
      open={open}
      onOpenChange={setOpen}
    >
      <Stack gap="md">
        <ol className="care-timeline" role="list">
          {feed.items.map((event) => (
            <li className="care-timeline__item" key={event.id}>
              <span className="care-timeline__marker" aria-hidden="true" />
              <div className="care-timeline__body">
                <strong className="care-timeline__title">
                  {VOICE_ACTION_LABELS[event.type] ?? event.type}
                </strong>
                <time className="care-timeline__time" dateTime={event.occurredAt}>
                  {formatDateTime(event.occurredAt)}
                </time>
              </div>
            </li>
          ))}
        </ol>
        {feed.canLoadMore ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => feed.loadMore()}
            loading={feed.isFetching}
          >
            Muat lebih
          </Button>
        ) : null}
      </Stack>
    </DisclosureRow>
  );
}
