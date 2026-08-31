import { statusDistribution } from '../lib/dashboard-math';
import type { Bucket } from '../lib/dashboard-math';
import { STATUS_LABELS } from '../lib/formatters';

/**
 * Single stacked status bar with a four-cell legend (screens 20/25). The bar
 * is decorative; the legend text carries the counts and shares accessibly.
 */
export function StatusDistribution({
  buckets,
  ariaLabel = 'Distribusi status',
}: {
  buckets: Bucket[];
  ariaLabel?: string;
}) {
  const distribution = statusDistribution(buckets);
  const total = distribution.reduce((sum, slice) => sum + slice.value, 0);
  return (
    <div className="distribution" aria-label={ariaLabel}>
      {total > 0 ? (
        <div className="distribution__bar" role="presentation">
          {distribution.map((slice) => (
            <span
              key={slice.label}
              style={{ flexGrow: slice.value, background: slice.color }}
              aria-hidden="true"
            />
          ))}
        </div>
      ) : (
        <p className="distribution__empty">Belum ada Voice pada rentang ini.</p>
      )}
      <ul className="distribution__legend" role="list">
        {distribution.map((slice) => (
          <li className="distribution__cell" key={slice.label}>
            <span className="distribution__name">
              <i style={{ background: slice.color }} aria-hidden="true" />
              {STATUS_LABELS[slice.label] ?? slice.label}
            </span>
            <span className="distribution__value">
              {slice.value} ({slice.percent}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
