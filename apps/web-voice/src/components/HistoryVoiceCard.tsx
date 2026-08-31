import { ChevronRight } from 'lucide-react';
import { DotLabel } from '@care/ui';
import type { VoiceListItem } from '../workforce-api';
import {
  formatRelative,
  SEVERITY_LABELS,
  STATUS_LABELS,
  VISIBILITY_LABELS,
} from '../lib/formatters';

/** Compact status-first list card for Voice Saya (history) — screen 12. */
const STATUS_TONES: Record<string, 'info' | 'brand' | 'success' | 'warning'> = {
  OPEN: 'warning',
  IN_VERIFICATION: 'info',
  IN_PROGRESS: 'brand',
  CLOSED: 'success',
};

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
          <DotLabel tone={STATUS_TONES[voice.status] ?? 'neutral'}>
            {STATUS_LABELS[voice.status] ?? voice.status}
          </DotLabel>
        </span>
        <span className="history-card__time">Diperbarui {formatRelative(voice.updatedAt)}</span>
      </span>
      <ChevronRight size={20} className="history-card__chevron" aria-hidden="true" />
    </button>
  );
}
