import { Card } from '@care/ui';
import { ChevronRight, Info, MinusCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type AttentionRow = {
  key: string;
  icon: ReactNode;
  label: string;
  description?: string | undefined;
  value?: ReactNode;
  /** Value emphasis tone; defaults to neutral ink. */
  tone?: 'brand' | 'danger' | 'neutral';
  onClick?: (() => void) | undefined;
};

/**
 * Icon-row list card (screens 20/25): "Area yang perlu perhatian",
 * "Kategori utama", and "Perlu perhatian" all reuse this pattern of tinted
 * icon plate + label + right-aligned value. Rows become buttons when they
 * carry an onClick (e.g. applying a category filter).
 */
export function AttentionCard({
  title,
  rows,
  caption,
  footer,
  ariaLabel,
}: {
  title: string;
  rows: AttentionRow[];
  caption?: string;
  footer?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Card className="attention-card" padding="md" aria-label={ariaLabel}>
      <h3 className="attention-card__title">{title}</h3>
      {rows.length ? (
        <ul className="attention-card__list" role="list">
          {rows.map((row) => {
            const content = (
              <>
                <span className="attention-card__plate" data-tone={row.tone} aria-hidden="true">
                  {row.icon}
                </span>
                <span className="attention-card__label">
                  <span className="attention-card__name">{row.label}</span>
                  {row.description ? (
                    <span className="attention-card__description">{row.description}</span>
                  ) : null}
                </span>
                {row.value !== undefined ? (
                  <span className="attention-card__value" data-tone={row.tone}>
                    {row.value}
                  </span>
                ) : null}
                {row.onClick ? (
                  <ChevronRight size={18} className="attention-card__chevron" aria-hidden="true" />
                ) : null}
              </>
            );
            return (
              <li className="attention-card__item" key={row.key}>
                {row.onClick ? (
                  <button
                    type="button"
                    className="attention-card__row attention-card__row--link"
                    onClick={row.onClick}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="attention-card__row">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="attention-card__empty">
          <MinusCircle size={16} aria-hidden="true" /> Belum ada data pada rentang ini.
        </p>
      )}
      {caption ? (
        <p className="attention-card__caption">
          <Info size={14} aria-hidden="true" /> {caption}
        </p>
      ) : null}
      {footer}
    </Card>
  );
}
