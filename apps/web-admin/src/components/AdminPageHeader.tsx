import type { ReactNode } from 'react';
import { IconButton } from '@care/ui';
import { RefreshCw } from 'lucide-react';

/**
 * Premium page header used by every Admin page: blue uppercase eyebrow,
 * bold slate title, gray description, and an optional right-side meta slot
 * (e.g. "Diperbarui …" + refresh action from the design targets).
 */
export function AdminPageHeader({
  eyebrow,
  title,
  description,
  updatedLabel,
  onRefresh,
  refreshing,
  actions,
  badge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedLabel?: string | undefined;
  onRefresh?: () => void | undefined;
  refreshing?: boolean | undefined;
  actions?: ReactNode | undefined;
  badge?: ReactNode | undefined;
}) {
  return (
    <div className="admin-pagehead">
      <div className="admin-pagehead__main">
        <p className="admin-pagehead__eyebrow">{eyebrow}</p>
        <h1 className="admin-pagehead__title">{title}</h1>
        <p className="admin-pagehead__desc">{description}</p>
      </div>
      <div className="admin-pagehead__side">
        {updatedLabel ? (
          <span className="admin-pagehead__updated">
            {onRefresh ? (
              <IconButton aria-label="Segarkan data" onClick={onRefresh} disabled={refreshing}>
                <RefreshCw size={14} />
              </IconButton>
            ) : null}
            <span>
              Diperbarui: <strong>{updatedLabel}</strong>
            </span>
          </span>
        ) : null}
        {badge}
        {actions}
      </div>
    </div>
  );
}
