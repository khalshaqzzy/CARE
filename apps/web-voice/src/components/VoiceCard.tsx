import { Button, Card } from '@care/ui';
import { Activity, ArrowRight, Flag, Layers, MapPin } from 'lucide-react';
import type { ReactNode } from 'react';
import type { VoiceListItem } from '../workforce-api';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatRelative,
  severityRank,
  SEVERITY_LABELS,
  VISIBILITY_LABELS,
  voiceStatusDisplay,
} from '../lib/formatters';

function statusTone(status: string, reviewState?: string | null): string {
  if (status === 'CLOSED' && reviewState === 'PENDING') return 'warning';
  if (status === 'IN_VERIFICATION' && reviewState === 'REJECTED') return 'warning';
  return (
    { OPEN: 'info', IN_VERIFICATION: 'warning', IN_PROGRESS: 'brand', CLOSED: 'success' }[status] ??
    'neutral'
  );
}

const SEVERITY_TONES: Record<string, string> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
};

function ValueRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="voice-card__row">
      <span className="voice-card__rowlabel">
        {icon}
        {label}
      </span>
      <span className="voice-card__value" data-tone={tone}>
        <i className="voice-card__dot" aria-hidden="true" />
        {value}
      </span>
    </div>
  );
}

export function VoiceCard({
  voice,
  onOpen,
  onContinue,
  draggable = false,
}: {
  voice: VoiceListItem;
  onOpen?: () => void;
  onContinue?: () => void;
  draggable?: boolean;
}) {
  return (
    <Card className="voice-card" data-severity={voice.severity} interactive={draggable}>
      <div className="voice-card__meta">
        <span className="voice-card__id">{voice.displayId}</span>
        <span className="voice-card__vis">
          {VISIBILITY_LABELS[voice.visibility] ?? voice.visibility}
        </span>
      </div>
      <h3 className="voice-card__title">{voice.title}</h3>
      <div className="voice-card__panel">
        <ValueRow
          icon={<Activity size={15} aria-hidden="true" />}
          label="Status:"
          value={voiceStatusDisplay(voice.status, voice.closureReviewState)}
          tone={statusTone(voice.status, voice.closureReviewState)}
        />
        <ValueRow
          icon={<Flag size={15} aria-hidden="true" />}
          label="Prioritas:"
          value={SEVERITY_LABELS[voice.severity] ?? voice.severity}
          tone={SEVERITY_TONES[voice.severity] ?? 'neutral'}
        />
        <ValueRow
          icon={<MapPin size={15} aria-hidden="true" />}
          label="Area:"
          value={AREA_LABELS[voice.area] ?? voice.area}
          tone="neutral"
        />
        {voice.category ? (
          <ValueRow
            icon={<Layers size={15} aria-hidden="true" />}
            label="Kategori:"
            value={voice.categoryNameSnapshot ?? CATEGORY_LABELS[voice.category] ?? voice.category}
            tone="info"
          />
        ) : null}
      </div>
      <div className="voice-card__foot">
        <span className="voice-card__time">Diperbarui {formatRelative(voice.updatedAt)}</span>
        {onOpen ? (
          <Button
            variant="ghost"
            size="sm"
            className="voice-card__link"
            onClick={onOpen}
            aria-label={`Buka ${voice.displayId}`}
          >
            Lihat detail <ArrowRight size={16} />
          </Button>
        ) : null}
      </div>
      {onContinue ? (
        <Button variant="primary" size="sm" className="voice-card__continue" onClick={onContinue}>
          Lanjutkan
        </Button>
      ) : null}
    </Card>
  );
}

export function sortVoiceSeverityDesc(items: VoiceListItem[]): VoiceListItem[] {
  return [...items].sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}
