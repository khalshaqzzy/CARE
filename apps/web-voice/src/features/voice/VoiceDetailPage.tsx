import { Badge, Button, Card, EmptyState, SeverityBadge, Skeleton, Stack } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { ActionPanel } from '../../components/ActionPanel';
import { ConversationPanel } from '../../components/ConversationPanel';
import { MediaGallery } from '../../components/MediaGallery';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatDateTime,
  STATUS_LABELS,
  VISIBILITY_LABELS,
  VOICE_ACTION_LABELS,
} from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { useCursorFeed } from '../../lib/useCursorFeed';
import type { Attachment, TimelineEvent, VoiceDetail } from '../../workforce-api';

export function VoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();

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
  const canMessage = voice.availableActions?.includes('MESSAGE') || voice.status !== 'CLOSED';

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">{voice.displayId}</p>
        <h1>{voice.title}</h1>
        <p>{AREA_LABELS[voice.area] ?? voice.area}</p>
      </header>

      <Card className="voice-detail__meta">
        <div className="voice-detail__badges">
          <Badge tone="neutral">{VISIBILITY_LABELS[voice.visibility] ?? voice.visibility}</Badge>
          {voice.category ? <Badge tone="info">{CATEGORY_LABELS[voice.category]}</Badge> : null}
          <SeverityBadge severity={voice.severity} />
        </div>
        <dl className="voice-detail__grid">
          <div>
            <dt>Status</dt>
            <dd>{STATUS_LABELS[voice.status] ?? voice.status}</dd>
          </div>
          <div>
            <dt>Diajukan</dt>
            <dd>{formatDateTime(voice.submittedAt)}</dd>
          </div>
          <div>
            <dt>Diperbarui</dt>
            <dd>{formatDateTime(voice.updatedAt)}</dd>
          </div>
          <div>
            <dt>Penanggung jawab</dt>
            <dd>{voice.currentHandler?.displayName ?? voice.routeOwner?.displayName ?? '—'}</dd>
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
      </Card>

      <ReporterCard voice={voice} />

      <ActionPanel detail={voice} />

      <Card>
        <Stack gap="md">
          <h3 className="section-title">Detail</h3>
          <p className="voice-detail__body">{voice.detail}</p>
        </Stack>
      </Card>

      {voice.attachments?.length ? <MediaGallery attachments={voice.attachments} /> : null}

      {canMessage ? <ConversationPanel voiceId={voice.id} /> : null}

      <ClosureCycles voice={voice} />

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
      <Card className="voice-reporter">
        <div className="voice-reporter__head">
          <h3 className="section-title">Pelapor</h3>
          <Badge tone="info">Identitas ditampilkan</Badge>
        </div>
        <dl className="voice-detail__grid">
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
      <Card className="voice-reporter">
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

function ClosureCycles({ voice }: { voice: { closureCycles: unknown[] } }) {
  const cycles = voice.closureCycles ?? [];
  if (!cycles.length) return null;
  return (
    <Card>
      <Stack gap="md">
        <h3 className="section-title">Siklus Penutupan</h3>
        {(
          cycles as Array<{
            id: string;
            cycleNumber: number;
            note: string;
            closedAt: string;
            reopenedAt: string | null;
            evidence: { id: string; purpose: string }[];
            rating: { score: number; feedback: string | null; reopen: boolean } | null;
          }>
        ).map((cycle) => (
          <div className="closure" key={cycle.id}>
            <div className="closure__head">
              <span className="closure__num">#{cycle.cycleNumber}</span>
              {cycle.reopenedAt ? <Badge tone="warning">Dibuka kembali</Badge> : null}
            </div>
            <p className="closure__note">{cycle.note}</p>
            <div className="closure__meta">
              <span>Ditutup {formatDateTime(cycle.closedAt)}</span>
              {cycle.rating ? (
                <span>
                  Rating {cycle.rating.score}/5
                  {cycle.rating.reopen ? ' · reopen' : ''}
                </span>
              ) : null}
            </div>
            {cycle.evidence?.length ? (
              <MediaGallery attachments={cycle.evidence as Attachment[]} label="Bukti penutupan" />
            ) : null}
            {cycle.rating?.feedback ? (
              <p className="closure__feedback">Umpan balik: {cycle.rating.feedback}</p>
            ) : null}
          </div>
        ))}
      </Stack>
    </Card>
  );
}

function Timeline({ voiceId }: { voiceId: string }) {
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
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

  if (feed.isLoading) return <Skeleton label="Memuat timeline" />;
  if (!feed.items.length) return null;
  return (
    <Card>
      <Stack gap="md">
        <h3 className="section-title">Timeline</h3>
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
    </Card>
  );
}
