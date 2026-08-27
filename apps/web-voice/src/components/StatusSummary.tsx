import { Card, Progress } from '@care/ui';
import type { MemberDashboard } from '../workforce-api';
import { STATUS_LABELS } from '../lib/formatters';

const ORDER = ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'] as const;

export function StatusSummary({
  dashboard,
  cached = false,
}: {
  dashboard: MemberDashboard;
  cached?: boolean;
}) {
  if (!dashboard) return null;
  const active =
    dashboard.counts.OPEN + dashboard.counts.IN_VERIFICATION + dashboard.counts.IN_PROGRESS;
  const total = Math.max(dashboard.total, 1);
  const pct = Math.round((active / total) * 100);
  return (
    <Card className="status-summary" data-tone="hero">
      <div className="status-summary__head">
        <span className="status-summary__label">Status Voice Anda</span>
        <span className="status-summary__total">
          {dashboard.total} total{cached ? ' · usang' : ''}
        </span>
      </div>
      <div className="status-summary__grid">
        {ORDER.map((key) => (
          <div className="status-summary__cell" key={key}>
            <span className="status-summary__num">{dashboard.counts[key]}</span>
            <span className="status-summary__name">{STATUS_LABELS[key]}</span>
          </div>
        ))}
      </div>
      <Progress
        value={pct}
        label={`${pct}% aktif`}
        description={`${active} Voice sedang ditindaklanjuti${cached ? ' · diperbarui terakhir saat online' : ''}`}
      />
    </Card>
  );
}
