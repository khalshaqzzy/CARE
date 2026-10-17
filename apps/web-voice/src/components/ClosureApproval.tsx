import { Check, Clock3, Hourglass } from 'lucide-react';
import { formatRemaining } from '../lib/formatters';
import type { Attachment, VoiceDetail } from '../workforce-api';
import { MediaGallery } from './MediaGallery';

type Approval = NonNullable<VoiceDetail['closureApproval']>;

const LEVEL_LABELS: Record<string, string> = {
  SECTION_HEAD: 'Section Head',
  MANAGER: 'Manager',
  DIVISION: 'DDH/DH',
};

/**
 * Persetujuan penyelesaian: the PIC reported a Medium+ Voice done and each
 * level above approves in turn (2 working days each); the last one closes.
 * The reporter sees only that it waits.
 */
export function ClosureApproval({ approval }: { approval: Approval }) {
  if (!approval.steps.length)
    return (
      <p className="closure-approval__waiting" role="status">
        <Hourglass size={16} aria-hidden="true" />
        Menunggu persetujuan atasan
      </p>
    );
  const last = approval.steps.length - 1;
  return (
    <section className="closure-approval" aria-label="Persetujuan penyelesaian">
      <h3 className="section-title">Persetujuan penyelesaian</h3>
      {approval.note ? (
        <div className="closure-approval__report">
          {approval.reportedBy ? <small>Laporan {approval.reportedBy}</small> : null}
          <p>{approval.note}</p>
          {approval.evidence?.length ? (
            <MediaGallery
              attachments={approval.evidence as Attachment[]}
              label="Bukti penyelesaian"
            />
          ) : null}
        </div>
      ) : null}
      <ol className="tier-timeline tier-timeline--flat" aria-label="Tahap persetujuan">
        {approval.steps.map((step, index) => {
          const state =
            step.state === 'APPROVED'
              ? 'DONE'
              : step.state === 'PENDING'
                ? step.late
                  ? 'LATE'
                  : 'CURRENT'
                : 'NEXT';
          return (
            <li key={step.level} data-state={state}>
              <span className="tier-timeline__dot" aria-hidden="true">
                {state === 'DONE' ? <Check size={12} /> : null}
                {state === 'LATE' ? <Clock3 size={12} /> : null}
              </span>
              <span className="tier-timeline__body">
                <strong>
                  {LEVEL_LABELS[step.level] ?? step.level}
                  {index === last ? ' · menutup' : ''}
                </strong>
                {step.names.length ? <small>{step.names.join(', ')}</small> : null}
                {step.state === 'PENDING' ? (
                  step.late ? (
                    <span className="tier-timeline__late">Terlambat</span>
                  ) : (
                    <span className="closure-approval__due">{formatRemaining(step.dueAt)}</span>
                  )
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
