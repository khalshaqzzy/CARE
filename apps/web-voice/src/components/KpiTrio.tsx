import { Card } from '@care/ui';
import { Activity, AlertTriangle, Clock3, Layers3 } from 'lucide-react';
import type { ReactNode } from 'react';
import { activeCount, bucketValue } from '../lib/dashboard-math';
import type { Bucket } from '../lib/dashboard-math';

type KpiTone = 'brand' | 'danger' | 'neutral';

export type KpiItem = {
  key: string;
  icon: ReactNode;
  value: number;
  label: string;
  tone?: KpiTone;
};

/**
 * Total / Aktif / Kritis trio derived from one aggregate (screens 17/20/25);
 * Union passes explicit items so the third cell becomes "Menunggu penugasan".
 */
export function KpiTrio({
  items,
  ariaLabel = 'Ringkasan Voice',
}: {
  items: KpiItem[];
  ariaLabel?: string;
}) {
  return (
    <Card className="kpi-trio" padding="none" aria-label={ariaLabel}>
      {items.map((item) => (
        <div className="kpi-trio__cell" key={item.key}>
          <span className="kpi-trio__plate" data-tone={item.tone} aria-hidden="true">
            {item.icon}
          </span>
          <span className="kpi-trio__measure">
            <strong>{item.value}</strong>
            <small>{item.label}</small>
          </span>
        </div>
      ))}
    </Card>
  );
}

/** Shared Total/Aktif/Kritis trio for General aggregates. */
export function generalKpiItems(buckets: Bucket[], total: number): KpiItem[] {
  const critical = bucketValue(buckets, 'CRITICAL');
  return [
    { key: 'total', icon: <Layers3 />, value: total, label: 'Total', tone: 'brand' },
    {
      key: 'aktif',
      icon: <Activity />,
      value: activeCount(buckets),
      label: 'Aktif',
      tone: 'brand',
    },
    {
      key: 'kritis',
      icon: <AlertTriangle />,
      value: critical,
      label: 'Kritis',
      tone: critical > 0 ? 'danger' : 'neutral',
    },
  ];
}

/** Union Private trio: Total / Aktif / Menunggu penugasan (screen 21). */
export function unionKpiItems(
  buckets: Bucket[],
  total: number,
  pendingAssignment?: number,
): KpiItem[] {
  return [
    { key: 'total', icon: <Layers3 />, value: total, label: 'Total', tone: 'brand' },
    {
      key: 'aktif',
      icon: <Activity />,
      value: activeCount(buckets),
      label: 'Aktif',
      tone: 'brand',
    },
    {
      key: 'pending',
      icon: <Clock3 />,
      value: pendingAssignment ?? 0,
      label: 'Menunggu penugasan',
      tone: 'neutral',
    },
  ];
}
