import { Card } from '@care/ui';
import { ClipboardList } from 'lucide-react';
import type { MemberDashboard } from '../workforce-api';
import { STATUS_LABELS } from '../lib/formatters';

const ORDER = ['OPEN', 'IN_VERIFICATION', 'IN_PROGRESS', 'CLOSED'] as const;
const SEGMENTS = 24;

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
  const filled = Math.round((pct / 100) * SEGMENTS);
  return (
    <section className="status-summary" aria-label="Ringkasan status Voice">
      <div className="status-summary__panelhead">
        <span className="status-summary__title">Status Voice Anda</span>
        <span className="status-summary__pill">
          {dashboard.total} total{cached ? ' · usang' : ''}
        </span>
      </div>
      <Card className="status-summary__card">
        <div className="status-summary__cardhead">
          <ClipboardList size={18} aria-hidden="true" />
          <strong>{dashboard.total} Voice</strong>
        </div>
        <div className="status-summary__measure">
          <span className="status-summary__fraction">
            <strong>{active}</strong>
            <span>/{dashboard.total} aktif</span>
          </span>
          <span className="status-summary__pct">{pct}%</span>
        </div>
        <div
          className="status-summary__segments"
          role="progressbar"
          aria-label="Persentase Voice aktif"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          {Array.from({ length: SEGMENTS }, (_, index) => (
            <i key={index} data-filled={index < filled} aria-hidden="true" />
          ))}
        </div>
        <div className="status-summary__legend">
          {ORDER.map((key) => (
            <div className="status-summary__cell" key={key}>
              <span className="status-summary__num">{dashboard.counts[key]}</span>
              <span className="status-summary__name">{STATUS_LABELS[key]}</span>
            </div>
          ))}
        </div>
        <p className="status-summary__note">
          {active} Voice sedang ditindaklanjuti{cached ? ' · diperbarui terakhir saat online' : ''}
        </p>
      </Card>
    </section>
  );
}
