import { Button } from '@care/ui';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

const storageKey = (id: string) => `care-admin-summary:${id}`;

function readOpen(id: string) {
  try {
    return window.localStorage.getItem(storageKey(id)) !== 'closed';
  } catch {
    return true;
  }
}

function writeOpen(id: string, open: boolean) {
  try {
    window.localStorage.setItem(storageKey(id), open ? 'open' : 'closed');
  } catch {
    /* The choice is a convenience; the summary still works without storage. */
  }
}

export type SummaryChip = {
  value: string;
  label: string;
  tone?: 'danger' | 'warning' | 'success' | 'info' | undefined;
};

/**
 * A page summary that slides up into one line of key numbers, so the list
 * below gets the room. The open/closed choice is remembered per page.
 */
export function AdminSummary({
  id,
  title,
  meta,
  chips,
  children,
}: {
  id: string;
  title: string;
  meta?: string | undefined;
  chips: SummaryChip[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(() => readOpen(id));
  const bodyId = useId();
  const toggle = () => {
    setOpen(!open);
    writeOpen(id, !open);
  };
  return (
    <section className="admin-card admin-summary" data-open={open} aria-label={title}>
      <div className="admin-summary__head">
        <h2 className="admin-summary__title">
          <BarChart3 size={16} aria-hidden="true" /> {title}
        </h2>
        {open ? (
          meta ? (
            <span className="admin-summary__meta">{meta}</span>
          ) : (
            <span className="admin-summary__meta" />
          )
        ) : (
          <span className="admin-summary__chips">
            {chips.map((chip) => (
              <span
                key={chip.label}
                className="admin-summary__chip"
                {...(chip.tone ? { 'data-tone': chip.tone } : {})}
              >
                <b className="admin-nums">{chip.value}</b> {chip.label}
              </span>
            ))}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
        >
          {open ? (
            <ChevronUp size={15} aria-hidden="true" />
          ) : (
            <ChevronDown size={15} aria-hidden="true" />
          )}
          {open ? 'Sembunyikan' : 'Tampilkan'}
        </Button>
      </div>
      <div className="admin-summary__fold" id={bodyId} inert={!open || undefined}>
        <div className="admin-summary__body">{children}</div>
      </div>
    </section>
  );
}

/** Horizontal bars for one breakdown (category, severity, role…). */
export function AdminBars({
  title,
  rows,
  onPick,
  active,
}: {
  title: string;
  rows: {
    key: string;
    label: string;
    value: number;
    display?: string | undefined;
    share?: number | undefined;
    tone?: 'danger' | 'warning' | 'success' | 'info' | undefined;
  }[];
  onPick?: ((key: string) => void) | undefined;
  active?: string | undefined;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="admin-bars">
      <h3 className="admin-bars__title">{title}</h3>
      {rows.length ? (
        <ul>
          {rows.map((row) => {
            const width = `${Math.round((row.share ?? row.value / max) * 100)}%`;
            const content = (
              <>
                <span className="admin-bars__label">{row.label}</span>
                <span className="admin-bars__track" aria-hidden="true">
                  <span style={{ width }} {...(row.tone ? { 'data-tone': row.tone } : {})} />
                </span>
                <b className="admin-bars__value admin-nums">
                  {row.display ?? row.value.toLocaleString('id-ID')}
                </b>
              </>
            );
            return (
              <li key={row.key}>
                {onPick ? (
                  <button
                    type="button"
                    aria-pressed={active === row.key}
                    onClick={() => onPick(row.key)}
                  >
                    {content}
                  </button>
                ) : (
                  <div>{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="admin-meta--xs">Tidak ada data.</p>
      )}
    </div>
  );
}

/**
 * "5 jam 12 mnt", "3,4 hari": the shortest readable form of a duration.
 * `short` ("5j 12m", "3,4 hr") fits KPI tiles and summary chips.
 */
export function formatDuration(seconds: number | null | undefined, short = false) {
  if (seconds === null || seconds === undefined) return '–';
  const minutes = Math.round(seconds / 60);
  const [m, h, d] = short ? ['m', 'j', 'hr'] : [' mnt', ' jam', ' hari'];
  if (minutes < 60) return `${minutes}${m}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${h} ${minutes % 60}${m}`;
  return `${(seconds / 86_400).toLocaleString('id-ID', { maximumFractionDigits: 1 })}${d}`;
}

export const formatCount = (value: number) => value.toLocaleString('id-ID');
