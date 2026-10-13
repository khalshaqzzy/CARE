import { Button, Skeleton } from '@care/ui';
import { ChevronRight, Clock3 } from 'lucide-react';
import { remainingTime } from '../../lib/deadline';
import type { DashboardPreview } from '../../workforce-api';

export type ActionKind = 'overdue' | 'soon' | 'open' | 'critical';
type Item = DashboardPreview['items'][number];

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** The Voice Member list of every Voice waiting for the viewer. */
export const ACTION_LIST: Record<string, string> = { view: 'ACTIVE', action: 'me' };

/** Search parameters of the Voice Member list behind each summary tile. */
export const ACTION_FILTERS: Record<ActionKind, Record<string, string>> = {
  overdue: { ...ACTION_LIST, due: 'OVERDUE' },
  soon: { ...ACTION_LIST, due: 'SOON' },
  open: { ...ACTION_LIST, view: 'OPEN' },
  critical: { ...ACTION_LIST, severity: 'CRITICAL' },
};

/**
 * "Butuh Tindakan Saya": how many active Voices wait for the viewer at their
 * own level, each count opening the matching Voice Member list, and the single
 * most urgent of them.
 */
export function ActionSummaryCard({
  preview,
  isError,
  onPick,
  onOpenVoice,
  onMore,
}: {
  preview: DashboardPreview | undefined;
  isError?: boolean;
  onPick: (kind: ActionKind) => void;
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
        ['overdue', 'Lewat batas', summary.overdue],
        ['soon', 'Batas < 24 jam', summary.dueSoon],
        ['open', 'Belum direspons', summary.open],
        ['critical', 'Kritis', summary.critical],
      ]
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
      ) : summary.total === 0 ? (
        <p className="ops-empty">Tidak ada Voice yang menunggu Anda.</p>
      ) : (
        <>
          <div className="ops-actions__tiles">
            {tiles.map(([kind, label, value]) => (
              <button
                type="button"
                className="ops-tile ops-actions__tile"
                data-kind={kind}
                data-zero={value === 0 || undefined}
                key={kind}
                aria-label={`${label}: ${value} Voice`}
                onClick={() => onPick(kind)}
              >
                <strong>{value}</strong>
                <span>{label}</span>
              </button>
            ))}
          </div>
          {next ? (
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
