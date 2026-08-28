import { Card } from '@care/ui';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Layers3,
  MessagesSquare,
} from 'lucide-react';
import type { DashboardAggregate } from '../workforce-api';
import { formatRelative } from '../lib/formatters';
import { DashboardChartCard } from './DashboardChartCard';

function valueOf(data: Array<{ label: string; value: number }>, label: string) {
  return data.find((bucket) => bucket.label === label)?.value ?? 0;
}

export function DashboardOverview({
  data,
  organizationLevel,
}: {
  data: DashboardAggregate;
  organizationLevel: 'division' | 'department';
}) {
  const open = valueOf(data.status, 'OPEN');
  const verification = valueOf(data.status, 'IN_VERIFICATION');
  const progress = valueOf(data.status, 'IN_PROGRESS');
  const closed = valueOf(data.status, 'CLOSED');
  const critical = valueOf(data.severity, 'CRITICAL');
  const active = open + verification + progress;
  const organization = organizationLevel === 'division' ? data.division : data.department;

  return (
    <section className="dashboard-overview" aria-labelledby="dashboard-overview-title">
      <div className="home-section__head">
        <div>
          <p className="care-eyebrow">General Voice</p>
          <h2 className="home-section__title" id="dashboard-overview-title">
            Ringkasan organisasi
          </h2>
        </div>
        <span className="dashboard-updated">Diperbarui {formatRelative(data.generatedAt)}</span>
      </div>

      <div className="dashboard-kpis">
        <Metric icon={<Layers3 />} label="Total Voice" value={data.total} />
        <Metric icon={<Activity />} label="Aktif" value={active} tone="brand" />
        <Metric icon={<MessagesSquare />} label="Verifikasi" value={verification} tone="warning" />
        <Metric icon={<Clock3 />} label="Dalam proses" value={progress} tone="info" />
        <Metric icon={<CheckCircle2 />} label="Selesai" value={closed} tone="success" />
        <Metric icon={<AlertTriangle />} label="Critical" value={critical} tone="danger" />
      </div>

      <div className="dashboard-chart-grid">
        <TrendChart buckets={data.trend} />
        <DashboardChartCard title="Distribusi status" buckets={data.status} total={data.total} />
        <DashboardChartCard title="Severity" buckets={data.severity} />
        <DashboardChartCard title="Kategori" buckets={data.category} />
        <div className="dashboard-chart-grid__wide">
          <DashboardChartCard
            title={organizationLevel === 'division' ? 'Breakdown divisi' : 'Breakdown department'}
            buckets={organization}
            {...(data.suppression.enabled
              ? {
                  caption: `Kelompok di bawah ambang ${data.suppression.threshold} digabung untuk menjaga privasi.`,
                }
              : {})}
          />
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'neutral' | 'brand' | 'info' | 'warning' | 'success' | 'danger';
}) {
  return (
    <Card className="dashboard-kpi" data-tone={tone}>
      <span className="dashboard-kpi__icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </Card>
  );
}

function TrendChart({ buckets }: { buckets: DashboardAggregate['trend'] }) {
  const width = 640;
  const height = 190;
  const inset = 16;
  const max = Math.max(...buckets.map((bucket) => bucket.value), 1);
  const points = buckets.map((bucket, index) => {
    const x =
      buckets.length <= 1
        ? width / 2
        : inset + (index / (buckets.length - 1)) * (width - inset * 2);
    const y = height - inset - (bucket.value / max) * (height - inset * 2);
    return { ...bucket, x, y };
  });
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');

  return (
    <Card className="trend-card dashboard-chart-grid__wide">
      <div className="chart-card__head">
        <h3>Trend Voice</h3>
        <span className="chart-card__total">
          {buckets.reduce((sum, item) => sum + item.value, 0)}
        </span>
      </div>
      {points.length ? (
        <>
          <svg
            className="trend-chart"
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`Trend Voice dari ${buckets[0]?.label} sampai ${buckets.at(-1)?.label}`}
          >
            <path
              className="trend-chart__area"
              d={`${path} L ${points.at(-1)?.x} ${height - inset} L ${points[0]?.x} ${height - inset} Z`}
            />
            <path className="trend-chart__line" d={path} />
            {points.map((point) => (
              <circle key={point.label} cx={point.x} cy={point.y} r="4">
                <title>{`${point.label}: ${point.value} Voice`}</title>
              </circle>
            ))}
          </svg>
          <div className="trend-card__axis" aria-hidden="true">
            <span>{buckets[0]?.label}</span>
            <span>{buckets.at(-1)?.label}</span>
          </div>
        </>
      ) : (
        <p className="chart-card__caption">Belum ada Voice pada rentang ini.</p>
      )}
    </Card>
  );
}
