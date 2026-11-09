import type { ReactNode } from 'react';
import { IconButton } from '@care/ui';
import { RefreshCw } from 'lucide-react';
import { useEmbedded } from './AdminSections';

/**
 * Premium page header used by every Admin page: blue uppercase eyebrow,
 * bold slate title, gray description, and an optional right-side meta slot
 * (e.g. "Diperbarui …" + refresh action from the design targets).
 * Inside a tab of another page it becomes a section header: no eyebrow, an h2
 * title, and the same actions.
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
  const embedded = useEmbedded();
  return (
    <div className={embedded ? 'admin-pagehead admin-pagehead--section' : 'admin-pagehead'}>
      <div className="admin-pagehead__main">
        {embedded ? (
          <h2 className="admin-pagehead__title">{title}</h2>
        ) : (
          <>
            <p className="admin-pagehead__eyebrow">{eyebrow}</p>
            <h1 className="admin-pagehead__title">{title}</h1>
          </>
        )}
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
