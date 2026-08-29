import { Card } from '@care/ui';
import { CATEGORY_LABELS, SEVERITY_LABELS, STATUS_LABELS } from '../lib/formatters';

type Bucket = { label: string; value: number };

/** Raw enum bucket labels rendered in Bahasa Indonesia; unknown labels pass through. */
const BUCKET_LABELS: Record<string, string> = {
  ...STATUS_LABELS,
  ...SEVERITY_LABELS,
  ...CATEGORY_LABELS,
  NONE: 'Tanpa kategori',
  OTHER_SUPPRESSED: 'Kelompok lain (digabung)',
};

function barColor(label: string): string {
  if (label === 'CRITICAL') return 'var(--danger)';
  if (label === 'HIGH') return 'var(--warning)';
  if (label === 'IN_PROGRESS') return 'var(--action-accent-bg)';
  if (label === 'CLOSED') return 'var(--success)';
  if (label === 'WORK_DIFFICULTY') return 'var(--action-accent-bg)';
  if (label === 'ENVIRONMENT') return 'var(--success)';
  return 'var(--action-primary-bg)';
}

export function DashboardChartCard({
  title,
  buckets,
  total,
  caption,
}: {
  title: string;
  buckets: Bucket[];
  total?: number;
  caption?: string;
}) {
  const max = Math.max(...buckets.map((b) => b.value), 1);
  return (
    <Card className="chart-card" padding="md">
      <div className="chart-card__head">
        <h3>{title}</h3>
        {total !== undefined ? <span className="chart-card__total">{total}</span> : null}
      </div>
      <ul className="chart-card__list" role="list">
        {buckets.map((bucket) => (
          <li className="chart-card__row" key={bucket.label}>
            <span className="chart-card__name" title={BUCKET_LABELS[bucket.label] ?? bucket.label}>
              {BUCKET_LABELS[bucket.label] ?? bucket.label}
            </span>
            <span className="chart-card__bar">
              <span
                className="chart-card__fill"
                style={{
                  width: `${Math.round((bucket.value / max) * 100)}%`,
                  background: barColor(bucket.label),
                }}
              />
            </span>
            <span className="chart-card__value">{bucket.value}</span>
          </li>
        ))}
      </ul>
      {caption ? <p className="chart-card__caption">{caption}</p> : null}
    </Card>
  );
}
