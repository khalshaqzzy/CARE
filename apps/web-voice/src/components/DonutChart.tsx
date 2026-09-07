import { donutSegments } from '../lib/dashboard-math';
import type { Bucket } from '../lib/dashboard-math';
import { STATUS_LABELS } from '../lib/formatters';

const SIZE = 132;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Status donut (screen 17): cobalt/amber/blue/green arcs with the aggregate
 * total in the center. The visible legend carries the accessible values, so
 * the SVG itself is decorative except for its labelled group summary.
 */
export function DonutChart({
  buckets,
  ariaLabel = 'Distribusi status Voice',
}: {
  buckets: Bucket[];
  ariaLabel?: string;
}) {
  const segments = donutSegments(buckets);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  let offset = 0;
  return (
    <div className="donut" role="img" aria-label={`${ariaLabel}: total ${total} Voice`}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut__chart" aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--raw-neutral-200)"
          strokeWidth={STROKE}
        />
        {segments.map((segment) => {
          const dash = segment.fraction * CIRCUMFERENCE;
          const element = (
            <circle
              key={segment.label}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={segment.color}
              strokeWidth={STROKE}
              strokeDasharray={`${Math.max(dash - 2, 0)} ${CIRCUMFERENCE - Math.max(dash - 2, 0)}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return element;
        })}
      </svg>
      <span className="donut__center">
        <strong>{total}</strong>
        <small>Total</small>
      </span>
    </div>
  );
}

/** Legend rows pairing the donut: dot + label + count + share. */
export function DonutLegend({ buckets }: { buckets: Bucket[] }) {
  const segments = donutSegments(buckets);
  if (!segments.length) return <p className="donut-legend__empty">Belum ada Voice.</p>;
  return (
    <ul className="donut-legend" role="list">
      {segments.map((segment) => (
        <li className="donut-legend__row" key={segment.label}>
          <span className="donut-legend__name">
            <i style={{ background: segment.color }} aria-hidden="true" />
            {STATUS_LABELS[segment.label] ?? segment.label}
          </span>
          <span className="donut-legend__value">
            <strong>{segment.value}</strong>
            <small>({segment.percent}%)</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
