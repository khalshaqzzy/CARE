import type { ReactNode } from 'react';
import { Button } from '@care/ui';

/**
 * Premium filter toolbar card: grid of labeled controls, a result-count line
 * with active-filter pill, and an optional footer row. Keeps all controls
 * mounted (server-driven URL filters) while matching the design targets.
 */
export function AdminFilterBar({
  controls,
  resultCount,
  activeFilterPill,
  onReset,
  footer,
}: {
  controls: ReactNode;
  resultCount?: string | undefined;
  activeFilterPill?: ReactNode | undefined;
  onReset?: () => void | undefined;
  footer?: ReactNode | undefined;
}) {
  return (
    <section className="admin-filterbar" aria-label="Filter data">
      <div className="admin-filterbar__controls">{controls}</div>
      {resultCount || activeFilterPill || onReset ? (
        <div className="admin-filterbar__meta">
          {resultCount ? <span className="admin-filterbar__count">{resultCount}</span> : null}
          {activeFilterPill}
          {onReset ? (
            <Button variant="ghost" size="sm" onClick={onReset}>
              Bersihkan filter
            </Button>
          ) : null}
        </div>
      ) : null}
      {footer}
    </section>
  );
}
