import type { ReactNode } from 'react';

/**
 * KPI mini-stat with a pastel icon circle, matching the design targets
 * (icon plate + big value + gray label, hairline dividers between cells).
 */
export function AdminKpi({
  icon,
  iconTone = 'brand',
  value,
  label,
  sub,
  valueTone,
}: {
  icon: ReactNode;
  iconTone?: 'brand' | 'danger' | 'warning' | 'success' | 'info' | undefined;
  value: ReactNode;
  label: string;
  sub?: string | undefined;
  valueTone?: 'danger' | 'warning' | 'success' | 'info' | undefined;
}) {
  return (
    <div className="admin-kpi">
      <span className="admin-kpi__icon" data-tone={iconTone} aria-hidden="true">
        {icon}
      </span>
      <span className="admin-kpi__body">
        <strong className="admin-kpi__value" {...(valueTone ? { 'data-tone': valueTone } : {})}>
          {value}
        </strong>
        <span className="admin-kpi__label">{label}</span>
        {sub ? <span className="admin-kpi__sub">{sub}</span> : null}
      </span>
    </div>
  );
}
