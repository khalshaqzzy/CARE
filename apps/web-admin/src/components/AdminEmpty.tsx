import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

/**
 * Illustrated empty state for admin-web tables and panels.
 */
export function AdminEmpty({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode | undefined;
  icon?: ReactNode | undefined;
}) {
  return (
    <div className="admin-empty">
      <span className="admin-empty__icon" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}
