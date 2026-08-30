import {
  Badge,
  Button,
  Card,
  DotLabel,
  DisclosureRow,
  EmptyState,
  IconButton,
  RatingInput,
  Skeleton,
  Stack,
  Textarea,
} from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ClipboardList,
  Clock,
  MapPin,
  UserRound,
} from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@care/frontend-core';
import { ActionPanel } from '../../components/ActionPanel';
import { ConversationPanel } from '../../components/ConversationPanel';
import { MediaGallery } from '../../components/MediaGallery';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDate,
  formatDateTime,
  SEVERITY_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
  VOICE_ACTION_LABELS,
} from '../../lib/formatters';
import { useApi, useMutationKey, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorFeed } from '../../lib/useCursorFeed';
import type { Attachment, TimelineEvent, VoiceDetail } from '../../workforce-api';

type ClosureCycle = {
  id: string;
  cycleNumber: number;
  note: string;
  closedAt: string;
  reopenedAt: string | null;
  evidence: { id: string; purpose: string }[];
  rating: { score: number; feedback: string | null; reopen: boolean } | null;
};

/** Status flag colors inside the cobalt hero; labels stay full white for AA. */
const HERO_FLAG_TONES: Record<string, string> = {
  OPEN: 'open',
  IN_VERIFICATION: 'verification',
  IN_PROGRESS: 'progress',
  CLOSED: 'closed',
};

const SEVERITY_FLAG_TONES: Record<string, string> = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

export function VoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const detail = useQuery({
    queryKey: voiceQuery(sessionId, 'voice', id),
    queryFn: () => api.voiceDetail(id!),
    enabled: !!id && !!session,
    refetchInterval: 3000,
  });
  const conversationState = detail.data?.conversationState;
  const previousConversationState = useRef(conversationState);
  useEffect(() => {
    if (previousConversationState.current === 'UNAVAILABLE' && conversationState === 'ACTIVE') {
      document
        .getElementById('voice-conversation')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    previousConversationState.current = conversationState;
  }, [conversationState]);

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
  const latestCycle = cycles.length
    ? cycles.reduce((latest, cycle) => (cycle.cycleNumber > latest.cycleNumber ? cycle : latest))
    : null;
  const closed = voice.status === 'CLOSED';
  const pic = voice.currentHandler?.displayName ?? voice.routeOwner?.displayName ?? '—';

  const back = () => {
    // Deep links have no in-app history to return to; land on the root instead.
    if (window.history.length > 1 && location.key !== 'default') void navigate(-1);
    else void navigate('/');
  };

  return (
    <Stack gap="lg">
      <div className="voice-backrow">
        <IconButton aria-label="Kembali" variant="ghost" onClick={back}>
          <ChevronLeft size={22} />
        </IconButton>
        <span className="voice-backrow__id">{voice.displayId}</span>
      </div>

      {closed ? (
        <section className="voice-hero voice-hero--closed" aria-label={voice.displayId}>
          <div className="voice-hero__closedhead">
            <span className="voice-hero__check" aria-hidden="true">
              <Check size={26} strokeWidth={3} />
            </span>
            <h1 className="voice-hero__title">{voice.title}</h1>
          </div>
          <div className="voice-hero__pills">
            <span className="voice-hero__pill">
              <i data-tone="closed" aria-hidden="true" />
              {STATUS_LABELS[voice.status] ?? voice.status}
            </span>
            <span className="voice-hero__pill">
              <i data-tone={SEVERITY_FLAG_TONES[voice.severity] ?? 'medium'} aria-hidden="true" />
              {SEVERITY_LABELS[voice.severity] ?? voice.severity}
            </span>
            {latestCycle ? (
              <span className="voice-hero__pill voice-hero__pill--plain">
                <CalendarDays size={15} aria-hidden="true" />
                Ditutup {formatDate(latestCycle.closedAt)}
              </span>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="voice-hero" aria-label={voice.displayId}>
          <h1 className="voice-hero__title">{voice.title}</h1>
          <div className="voice-hero__meta">
            <span className="voice-hero__item">
              <ClipboardList size={16} aria-hidden="true" />
              {VISIBILITY_LABELS[voice.visibility] ?? voice.visibility} Voice
            </span>
            <span className="voice-hero__sep" aria-hidden="true" />
            <span className="voice-hero__item">
              <i
                className="voice-hero__dot"
                data-tone={SEVERITY_FLAG_TONES[voice.severity] ?? 'medium'}
                aria-hidden="true"
              />
              {SEVERITY_LABELS[voice.severity] ?? voice.severity}
            </span>
            <span className="voice-hero__sep" aria-hidden="true" />
            <span className="voice-hero__item">
              <i
                className="voice-hero__dot"
                data-tone={HERO_FLAG_TONES[voice.status] ?? 'verification'}
                aria-hidden="true"
              />
              {STATUS_LABELS[voice.status] ?? voice.status}
            </span>
          </div>
          <div className="voice-hero__meta voice-hero__meta--secondary">
            <span className="voice-hero__item">
              <MapPin size={16} aria-hidden="true" />
              {AREA_LABELS[voice.area] ?? voice.area}
            </span>
            <span className="voice-hero__sep" aria-hidden="true" />
            <span className="voice-hero__item">
              <UserRound size={16} aria-hidden="true" />
              PIC: {pic}
            </span>
          </div>
        </section>
      )}

      <ReporterCard voice={voice} />

      <ActionPanel detail={voice} />

      <Card padding="md">
        <Stack gap="md">
          <h3 className="section-title">Detail</h3>
          <p className="voice-detail__body">{voice.detail}</p>
          <dl className="voice-meta">
            <div>
              <dt>Diajukan</dt>
              <dd>{formatDateTime(voice.submittedAt)}</dd>
            </div>
            <div>
              <dt>Diperbarui</dt>
              <dd>{formatDateTime(voice.updatedAt)}</dd>
            </div>
            <div>
              <dt>Sumber klasifikasi</dt>
              <dd>
                {voice.classificationSource === 'AI'
                  ? 'AI'
                  : voice.classificationSource
                    ? 'Manual Fallback'
                    : '—'}
              </dd>
            </div>
            {voice.category ? (
              <div>
                <dt>Kategori</dt>
                <dd>{CATEGORY_LABELS[voice.category] ?? voice.category}</dd>
              </div>
            ) : null}
            {voice.locationReview ? (
              <div>
                <dt>Kelengkapan lokasi</dt>
                <dd>
                  {voice.locationReview.completeness === 'INCOMPLETE'
                    ? 'Belum lengkap'
                    : voice.locationReview.completeness === 'COMPLETE'
                      ? 'Lengkap'
                      : 'Tidak diketahui'}
                </dd>
              </div>
            ) : null}
          </dl>
        </Stack>
      </Card>

      {voice.attachments?.length ? (
        <Card padding="md">
          <MediaGallery attachments={voice.attachments} variant="row" />
        </Card>
      ) : null}

      {voice.conversationState !== 'UNAVAILABLE' ? (
        <ConversationPanel voiceId={voice.id} state={voice.conversationState} />
      ) : null}

      <ClosureSection cycles={cycles} />

      {voice.availableActions?.includes('RATE') ? <RatingCard voice={voice} /> : null}

      <Timeline voiceId={voice.id} />
    </Stack>
  );
}

function ReporterCard({ voice }: { voice: VoiceDetail }) {
  // The reporter block exists only where the contract grants it: the Union sees
  // the immutable consent snapshot (SHOW) or a per-Voice alias (HIDE). Other
  // audiences keep the existing surfaces unchanged.
  if (voice.audience === 'UNION_IDENTIFIED') {
    return (
      <Card className="voice-reporter" padding="md">
        <div className="voice-reporter__head">
          <h3 className="section-title">Pelapor</h3>
          <Badge tone="info">Identitas ditampilkan</Badge>
        </div>
        <dl className="voice-meta">
          <div>
            <dt>Nama</dt>
            <dd>{voice.reporter.name}</dd>
          </div>
          <div>
            <dt>No. Reg</dt>
            <dd>{voice.reporter.noReg}</dd>
          </div>
          <div>
            <dt>Divisi</dt>
            <dd>{voice.reporter.division}</dd>
          </div>
          <div>
            <dt>Department</dt>
            <dd>{voice.reporter.department}</dd>
          </div>
        </dl>
      </Card>
    );
  }
  if (voice.audience === 'UNION_ANONYMOUS') {
    return (
      <Card className="voice-reporter" padding="md">
        <div className="voice-reporter__head">
          <h3 className="section-title">Pelapor</h3>
          <Badge tone="neutral">Identitas disembunyikan</Badge>
        </div>
        <p className="voice-reporter__alias">{voice.anonymousReporter.alias}</p>
        <p className="care-note">
          Alias hanya berlaku untuk Voice ini dan tidak dapat dikaitkan dengan Voice lain.
        </p>
      </Card>
    );
  }
  return null;
}

/**
 * Reporter-facing closure rating (screen 14). Rating and the reopen decision
 * leave in one atomic mutation (PRD §17.3): the "Buka kembali" outline toggle
 * only appears for low scores and simply flips the `reopen` flag that
 * "Kirim penilaian" submits.
 */
function RatingCard({ voice }: { voice: VoiceDetail }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const rateKey = useMutationKey('rate');
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [reopen, setReopen] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Card padding="md" className="rating-card">
      <Stack gap="md">
        <h3 className="rating-card__question">Bagaimana hasil tindak lanjutnya?</h3>
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
        {needsFeedback ? (
          <div className="rating-card__reopen">
            <button
              type="button"
              className="rating-card__reopen-toggle"
              aria-pressed={reopen}
              onClick={() => setReopen((current) => !current)}
              disabled={rate.isPending}
            >
              Buka kembali
            </button>
            <p className="rating-card__reopen-note">Masalah belum sepenuhnya selesai</p>
          </div>
        ) : null}
        <Button
          onClick={() => {
            if (score === null) return;
            const trimmed = feedback.trim();
            rate.mutate({
              score,
              reopen,
              ...(trimmed ? { feedback: trimmed } : {}),
            });
          }}
          loading={rate.isPending}
          disabled={!canSubmit}
        >
          Kirim penilaian
        </Button>
      </Stack>
    </Card>
  );
}

/** Latest closure is featured; older cycles collapse behind a row (screen 14). */
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
              {latest.rating.reopen ? <Badge tone="warning">Dibuka kembali</Badge> : null}
            </div>
          ) : null}
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
                Rating {cycle.rating.score}/5{cycle.rating.reopen ? ' · reopen' : ''}
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
      icon={<Clock size={16} />}
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
