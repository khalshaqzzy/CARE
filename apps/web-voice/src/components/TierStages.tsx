import { Check } from 'lucide-react';
import type { VoiceDetail } from '../workforce-api';

const LEVEL_LABELS: Record<string, string> = {
  GROUP_LEADER: 'Group Leader',
  SECTION_HEAD: 'Section Head',
  MANAGER: 'Manager',
  DIVISION: 'DDH/DH',
};

/** Tahap penanganan (ADR-0059): who handled, who holds, and who is next. */
export function TierStages({ stages }: { stages: NonNullable<VoiceDetail['tierStages']> }) {
  return (
    <ol className="tier-timeline" aria-label="Tahap penanganan">
      {stages.map((stage) => (
        <li key={stage.level} data-state={stage.state}>
          <span className="tier-timeline__dot" aria-hidden="true">
            {stage.state === 'DONE' ? <Check size={12} /> : null}
          </span>
          <span className="tier-timeline__body">
            <strong>{LEVEL_LABELS[stage.level] ?? stage.level}</strong>
            {stage.names.length ? <small>{stage.names.join(', ')}</small> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
