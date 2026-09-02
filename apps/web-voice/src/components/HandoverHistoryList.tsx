import { Card } from '@care/ui';
import { ArrowRight, Building2, LockKeyhole, MapPinned } from 'lucide-react';
import { formatDate } from '../lib/formatters';
import type { HandoverHistoryItem } from '../workforce-api';

export function HandoverHistoryList({ items }: { items: HandoverHistoryItem[] }) {
  return (
    <div className="handover-history-list">
      {items.map((item) => (
        <Card key={item.id} padding="md" className="handover-record">
          <div className="handover-record__topline">
            <span>Handover #{item.sequence}</span>
            <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
          </div>
          <div className="handover-record__route">
            <RouteSide value={item.from} />
            <ArrowRight size={18} aria-label="ke" />
            <RouteSide value={item.to} reporter={item.isReporterDepartment} />
          </div>
          {item.detail ? (
            <div className="handover-record__note">
              <span>
                <LockKeyhole size={14} aria-hidden="true" /> Detail privat
              </span>
              <p>{item.detail}</p>
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

function RouteSide({
  value,
  reporter = false,
}: {
  value: HandoverHistoryItem['from'];
  reporter?: boolean;
}) {
  return (
    <div className="handover-record__side">
      <strong>{value.category.name ?? value.category.key ?? 'Kategori'}</strong>
      <span>
        <Building2 size={14} aria-hidden="true" /> {value.department.department ?? '—'}
      </span>
      <small>{value.pic.displayName}</small>
      {reporter ? (
        <em>
          <MapPinned size={12} aria-hidden="true" /> Department Reporter
        </em>
      ) : null}
    </div>
  );
}
