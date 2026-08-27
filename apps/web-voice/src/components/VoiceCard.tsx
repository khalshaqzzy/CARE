import { Button, Card, SeverityBadge, StatusBadge } from '@care/ui';
import { ChevronRight } from 'lucide-react';
import type { VoiceListItem } from '../workforce-api';
import {
  AREA_LABELS,
  CATEGORY_LABELS,
  formatRelative,
  severityRank,
  VISIBILITY_LABELS,
} from '../lib/formatters';

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
      <div className="voice-card__top">
        <div className="voice-card__meta">
          <span className="voice-card__id">{voice.displayId}</span>
          <span className="voice-card__vis">
            {VISIBILITY_LABELS[voice.visibility] ?? voice.visibility}
          </span>
        </div>
        <SeverityBadge severity={voice.severity} />
      </div>
      {voice.category ? (
        <p className="voice-card__category">{CATEGORY_LABELS[voice.category] ?? voice.category}</p>
      ) : null}
      <h3 className="voice-card__title">{voice.title}</h3>
      <div className="voice-card__foot">
        <span className="voice-card__area">{AREA_LABELS[voice.area] ?? voice.area}</span>
        <StatusBadge status={voice.status} />
      </div>
      <div className="voice-card__bottom">
        <span className="voice-card__time">Diperbarui {formatRelative(voice.updatedAt)}</span>
        {onOpen ? (
          <Button variant="ghost" size="sm" onClick={onOpen} aria-label={`Buka ${voice.displayId}`}>
            Detail <ChevronRight size={16} />
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
