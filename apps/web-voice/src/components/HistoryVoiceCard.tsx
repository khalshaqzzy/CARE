import { ChevronRight } from 'lucide-react';
import { DotLabel } from '@care/ui';
import type { VoiceListItem } from '../workforce-api';
import {
  formatRelative,
  SEVERITY_LABELS,
  VISIBILITY_LABELS,
  voiceStatusDisplay,
} from '../lib/formatters';

/** Compact status-first list card for Voice Saya (history) — screen 12. */
function statusTone(
  status: string,
  reviewState?: string | null,
): 'info' | 'brand' | 'success' | 'warning' | 'neutral' {
  if (status === 'CLOSED' && reviewState === 'PENDING') return 'warning';
  if (status === 'IN_VERIFICATION' && reviewState === 'REJECTED') return 'warning';
  if (status === 'CLOSED') return 'success';
  return (
    (
      {
        OPEN: 'warning',
        IN_VERIFICATION: 'info',
        IN_PROGRESS: 'brand',
      } as const
    )[status] ?? 'neutral'
  );
}

const SEVERITY_TONES: Record<string, 'neutral' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

export function HistoryVoiceCard({ voice, onOpen }: { voice: VoiceListItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="history-card"
      data-status={voice.status}
      onClick={onOpen}
      aria-label={`Buka ${voice.displayId}`}
    >
      <span className="history-card__body">
        <span className="history-card__meta">
          <span className="history-card__id">{voice.displayId}</span>
          <span className="history-card__vis" data-visibility={voice.visibility}>
            {VISIBILITY_LABELS[voice.visibility] ?? voice.visibility}
          </span>
        </span>
        <span className="history-card__title">{voice.title}</span>
        <span className="history-card__flags">
          <DotLabel tone={SEVERITY_TONES[voice.severity] ?? 'neutral'}>
            {SEVERITY_LABELS[voice.severity] ?? voice.severity}
          </DotLabel>
          <span className="history-card__divider" aria-hidden="true" />
          <DotLabel tone={statusTone(voice.status, voice.closureReviewState)}>
            {voiceStatusDisplay(voice.status, voice.closureReviewState)}
          </DotLabel>
        </span>
        <span className="history-card__time">Diperbarui {formatRelative(voice.updatedAt)}</span>
      </span>
      <ChevronRight size={20} className="history-card__chevron" aria-hidden="true" />
    </button>
  );
}
