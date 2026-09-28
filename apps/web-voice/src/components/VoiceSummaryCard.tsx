import type { ReactNode } from 'react';
import { STATUS_LABELS } from '../lib/formatters';

const ORDER = ['OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED'] as const;

export type VoiceSummaryStatus = (typeof ORDER)[number];

/**
 * White "Ringkasan Voice" card shared by the Member and dashboard heroes: a
 * Total chip beside the heading and the four status counts below it.
 */
export function VoiceSummaryCard({
  total,
  count,
  fallback,
}: {
  /** Undefined while loading; the chip and grid render only with data. */
  total: number | undefined;
  count: (status: VoiceSummaryStatus) => number;
  fallback?: ReactNode;
}) {
  return (
    <div className="dashboard-summary" aria-label="Ringkasan Voice">
      <div className="dashboard-summary__head">
        <h2>Ringkasan Voice</h2>
        {total !== undefined ? (
          <span className="dashboard-summary__total">
            Total <strong>{total}</strong>
          </span>
        ) : null}
      </div>
      {total !== undefined ? (
        <div className="dashboard-summary__grid" data-total={total}>
          {ORDER.map((status) => (
            <div className="dashboard-summary__metric" data-status={status} key={status}>
              <strong>{count(status)}</strong>
              <span>{STATUS_LABELS[status]}</span>
            </div>
          ))}
        </div>
      ) : (
        fallback
      )}
    </div>
  );
}
