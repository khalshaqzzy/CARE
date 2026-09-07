import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Row card with a leading icon plate, title/description, and an optional
 * trailing link-style label before the chevron — the language of the
 * "Percakapan / Buka Chat" and "Timeline" rows on the redesigned detail.
 */
export function LinkCard({
  icon,
  title,
  description,
  trailing,
  onClick,
  className,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  onClick: () => void;
  className?: string | undefined;
}) {
  return (
    <button
      type="button"
      className={`link-card${className ? ` ${className}` : ''}`}
      onClick={onClick}
    >
      <span className="link-card__plate" aria-hidden="true">
        {icon}
      </span>
      <span className="link-card__text">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      {trailing ? <span className="link-card__trailing">{trailing}</span> : null}
      <ChevronRight size={18} className="link-card__chevron" aria-hidden="true" />
    </button>
  );
}
