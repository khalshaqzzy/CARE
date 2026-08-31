import { Card } from '@care/ui';
import type { ReactNode } from 'react';

export type HeroStat = {
  key: string;
  icon: ReactNode;
  value: number | string;
  label: string;
  tone?: 'brand' | 'danger' | 'neutral';
};

/**
 * Full-bleed cobalt page band (screens 18/22/25): eyebrow, title, optional
 * read-only chip, a stats strip of icon plates, and an optional inset white
 * card. The shared topbar stays above it on every route.
 */
export function HeroBand({
  eyebrow,
  title,
  description,
  chip,
  stats = [],
  inset,
  updated,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  chip?: ReactNode;
  stats?: HeroStat[];
  inset?: ReactNode;
  updated?: string | undefined;
}) {
  return (
    <section className="hero-band">
      <header className="hero-band__head">
        <div className="hero-band__titles">
          {eyebrow ? <p className="hero-band__eyebrow">{eyebrow}</p> : null}
          <h1 className="hero-band__title">{title}</h1>
          {description ? <p className="hero-band__description">{description}</p> : null}
        </div>
        <div className="hero-band__aside">
          {chip}
          {updated ? <span className="hero-band__updated">{updated}</span> : null}
        </div>
      </header>
      {stats.length ? (
        <div className="hero-band__stats" role="list" aria-label="Ringkasan antrean">
          {stats.map((stat) => (
            <div className="hero-band__stat" role="listitem" key={stat.key} data-tone={stat.tone}>
              <span className="hero-band__plate" aria-hidden="true">
                {stat.icon}
              </span>
              <span className="hero-band__measure">
                <strong>{stat.value}</strong>
                <small>{stat.label}</small>
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {inset}
    </section>
  );
}

/** Read-only disclosure chip used by Leadership/Union surfaces. */
export function HeroChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="hero-band__chip">
      {icon}
      {label}
    </span>
  );
}

/** Inset white summary card rendered inside a hero band or hero. */
export function HeroInset({
  title,
  children,
  watermark,
  ariaLabel,
}: {
  title: string;
  children: ReactNode;
  watermark?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Card className="hero-inset" aria-label={ariaLabel}>
      <div className="hero-inset__head">
        <h2 className="hero-inset__title">{title}</h2>
        {watermark ? (
          <span className="hero-inset__watermark" aria-hidden="true">
            {watermark}
          </span>
        ) : null}
      </div>
      {children}
    </Card>
  );
}
