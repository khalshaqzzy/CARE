import { Button, Skeleton } from '@care/ui';
import { ChevronRight, Clock3 } from 'lucide-react';
import { remainingTime } from '../../lib/deadline';
import type { DashboardPreview } from '../../workforce-api';

/** What the Voice needs next from the viewer, and the urgency markers. */
export type ActionKind =
  'open' | 'responded' | 'inProgress' | 'approve' | 'closed' | 'overdue' | 'soon' | 'critical';
export type AttentionKind = 'overdue' | 'soon' | 'critical';
type Item = DashboardPreview['items'][number];

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** The Voice Member list of every Voice waiting for the viewer. */
export const ACTION_LIST: Record<string, string> = { tab: 'me', view: 'ACTIVE', action: 'me' };

/** Search parameters of the Voice Member list behind each summary count. */
export const ACTION_FILTERS: Record<ActionKind, Record<string, string>> = {
  open: { ...ACTION_LIST, view: 'OPEN' },
  responded: { ...ACTION_LIST, view: 'RESPONDED' },
  inProgress: { ...ACTION_LIST, view: 'IN_PROGRESS' },
  approve: { ...ACTION_LIST, action: 'approve' },
  closed: { tab: 'me', view: 'CLOSED', action: 'closed' },
  overdue: { ...ACTION_LIST, due: 'OVERDUE' },
  soon: { ...ACTION_LIST, due: 'SOON' },
  critical: { ...ACTION_LIST, severity: 'CRITICAL' },
};

/** Status Voice "Perlu perhatian": the same urgency over the whole unit. */
export const ATTENTION_FILTERS: Record<AttentionKind, Record<string, string>> = {
  overdue: { view: 'ACTIVE', due: 'OVERDUE' },
  soon: { view: 'ACTIVE', due: 'SOON' },
  critical: { view: 'ACTIVE', severity: 'CRITICAL' },
};

export const URGENCY_LABELS: Record<AttentionKind, string> = {
  overdue: 'Lewat batas',
  soon: 'Batas < 24 jam',
  critical: 'Kritis',
};

/** "Batas < 24 jam" drops "Batas" on phones so the three chips share one row. */
function UrgencyText({ kind }: { kind: AttentionKind }) {
  return kind === 'soon' ? (
    <span aria-hidden="true">
      <span className="ops-urgency__wide">Batas </span>&lt; 24 jam
    </span>
  ) : (
    <span aria-hidden="true">{URGENCY_LABELS[kind]}</span>
  );
}

/**
 * "Butuh Tindakan Saya": the Voices waiting for the viewer at their own level,
 * split by the next step so the counts add up to the total, how many the
 * viewer closed, the urgent ones among them, and the single most urgent Voice.
 */
export function ActionSummaryCard({
  preview,
  isError,
  onPick,
  onOpenVoice,
  onMore,
  active,
}: {
  preview: DashboardPreview | undefined;
  isError?: boolean;
  onPick: (kind: ActionKind) => void;
  /** The count filtering the list below; `undefined` where nothing is filtered. */
  active?: ActionKind | null;
  onOpenVoice: (id: string) => void;
  onMore?: () => void;
}) {
  const summary = preview?.summary;
  const next = [...(preview?.actionItems ?? [])]
    .filter((item: Item) => item.status !== 'CLOSED')
    .sort(
      (a: Item, b: Item) =>
        (a.tierDueAt ? Date.parse(a.tierDueAt) : Infinity) -
          (b.tierDueAt ? Date.parse(b.tierDueAt) : Infinity) ||
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
    )[0];
  const due = next ? remainingTime(next.tierDueAt) : null;
  const tiles: [ActionKind, string, number][] = summary
    ? [
        ['open', 'Perlu Direspon', summary.open],
        ['responded', 'Perlu Diproses', summary.responded],
        ['inProgress', 'Perlu Diselesaikan', summary.inProgress],
        // Only leaders someone can report done to (ADR-0069).
        ...(summary.approves
          ? ([['approve', 'Perlu Disetujui', summary.toApprove]] as [ActionKind, string, number][])
          : []),
        ['closed', 'Selesai oleh saya', summary.closedByMe],
      ]
    : [];
  const urgent: [AttentionKind, number][] = summary
    ? (
        [
          ['overdue', summary.overdue],
          ['soon', summary.dueSoon],
          ['critical', summary.critical],
        ] as [AttentionKind, number][]
      ).filter(([, value]) => value > 0)
    : [];
  return (
    <section className="ops-card ops-actions ops-span-2" aria-labelledby="ops-actions">
      <div className="ops-card__head">
        <h2 id="ops-actions">Butuh Tindakan Saya</h2>
        {summary ? <span className="ops-chip">{summary.total} Voice</span> : null}
      </div>
      {isError ? (
        <p className="ops-empty">Ringkasan belum tersedia.</p>
      ) : !summary ? (
        <Skeleton label="Memuat Voice yang butuh tindakan" />
      ) : (
        <>
          <div className="ops-actions__tiles" data-count={tiles.length}>
            {tiles.map(([kind, label, value]) => (
              <button
                type="button"
                className="ops-tile ops-actions__tile"
                data-kind={kind}
                data-zero={value === 0 || undefined}
                key={kind}
                aria-label={`${label}: ${value} Voice`}
                {...(active !== undefined ? { 'aria-pressed': active === kind } : {})}
                onClick={() => onPick(kind)}
              >
                <strong>{value}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          {urgent.length ? (
            <div className="ops-urgency" role="group" aria-label="Mendesak">
              {urgent.map(([kind, value]) => (
                <button
                  type="button"
                  className="ops-urgency__chip"
                  data-kind={kind}
                  key={kind}
                  aria-label={`${value} ${URGENCY_LABELS[kind]}`}
                  {...(active !== undefined ? { 'aria-pressed': active === kind } : {})}
                  onClick={() => onPick(kind)}
                >
                  <strong>{value}</strong> <UrgencyText kind={kind} />
                </button>
              ))}
            </div>
          ) : null}
          {summary.total === 0 ? (
            <p className="ops-empty">Tidak ada Voice yang menunggu Anda.</p>
          ) : next ? (
            <button
              type="button"
              className="ops-actions__next"
              onClick={() => onOpenVoice(next.id)}
            >
              <span className="ops-actions__next-label">Paling mendesak</span>
              <strong>{next.title}</strong>
              {due ? (
                <span className="ops-due" data-urgent={due.urgent || undefined}>
                  <Clock3 size={13} aria-hidden="true" />
                  {due.text}
                </span>
              ) : null}
              <ChevronRight size={15} aria-hidden="true" className="ops-actions__chevron" />
            </button>
          ) : null}
        </>
      )}
      {onMore ? (
        <Button variant="secondary" size="sm" className="ops-actions__more" onClick={onMore}>
          Lihat selengkapnya di Voice Member
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}

/** Status Voice "Perlu perhatian": urgent active Voices of the whole unit. */
export function AttentionRow({
  attention,
  onPick,
}: {
  attention: DashboardPreview['summary']['attention'];
  onPick: (kind: AttentionKind) => void;
}) {
  const items: [AttentionKind, number][] = [
    ['overdue', attention.overdue],
    ['soon', attention.dueSoon],
    ['critical', attention.critical],
  ];
  return (
    <div className="ops-urgency ops-urgency--unit" role="group" aria-label="Perlu perhatian">
      <span className="ops-urgency__label">Perlu perhatian</span>
      {items.map(([kind, value]) => (
        <button
          type="button"
          className="ops-urgency__chip"
          data-kind={kind}
          data-zero={value === 0 || undefined}
          key={kind}
          onClick={() => onPick(kind)}
        >
          <strong>{value}</strong> {URGENCY_LABELS[kind]}
        </button>
      ))}
    </div>
  );
}
