import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { animate, useReducedMotion } from 'motion/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Skeleton } from './feedback.js';
import { Surface } from './primitives.js';
import { durationTokens } from './tokens.js';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
};
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  sort,
  onSortChange,
  selectable,
  selected = [],
  onSelectionChange,
  caption,
  virtualize = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  empty?: ReactNode;
  sort?: { key: string; direction: 'asc' | 'desc' };
  onSortChange?: (sort: { key: string; direction: 'asc' | 'desc' }) => void;
  selectable?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
  caption?: string;
  virtualize?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: virtualize && !loading ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 8,
  });
  const toggle = (id: string) =>
    onSelectionChange?.(
      selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id],
    );
  const virtualRows = rowVirtualizer.getVirtualItems();
  const visibleRows = virtualize
    ? virtualRows.map((item) => ({ row: rows[item.index]!, start: item.start, end: item.end }))
    : rows.map((row) => ({ row, start: 0, end: 0 }));
  const topPad = virtualRows[0]?.start ?? 0;
  const bottomPad = virtualRows.length
    ? rowVirtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0)
    : 0;
  const columnsCount = columns.length + (selectable ? 1 : 0);
  return (
    <div
      ref={scrollRef}
      className="care-table-wrap"
      data-virtualized={virtualize || undefined}
      aria-busy={loading || undefined}
    >
      <table className="care-table">
        <caption className="care-sr-only">{caption ?? 'Tabel data'}</caption>
        <thead>
          <tr>
            {selectable ? (
              <th scope="col">
                <span className="care-sr-only">Pilih</span>
              </th>
            ) : null}
            {columns.map((column) => (
              <th key={column.key} scope="col" style={{ width: column.width }}>
                {column.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSortChange({
                        key: column.key,
                        direction:
                          sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc',
                      })
                    }
                  >
                    {column.header}
                    {sort?.key === column.key ? (
                      sort.direction === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ChevronsUpDown size={14} />
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }, (_, index) => (
              <tr key={index}>
                {selectable ? (
                  <td>
                    <Skeleton />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td key={column.key}>
                    <Skeleton />
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <>
              {topPad ? (
                <tr aria-hidden="true">
                  <td colSpan={columnsCount} style={{ height: topPad, padding: 0 }} />
                </tr>
              ) : null}
              {visibleRows.map(({ row }) => {
                const id = rowKey(row);
                return (
                  <tr key={id} data-selected={selected.includes(id) || undefined}>
                    {selectable ? (
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pilih baris ${id}`}
                          checked={selected.includes(id)}
                          onChange={() => toggle(id)}
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={column.key}>{column.cell(row)}</td>
                    ))}
                  </tr>
                );
              })}
              {bottomPad ? (
                <tr aria-hidden="true">
                  <td colSpan={columnsCount} style={{ height: bottomPad, padding: 0 }} />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
      {!loading && !rows.length ? (
        <div className="care-table__empty">{empty ?? 'Belum ada data.'}</div>
      ) : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  description,
  icon,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  description?: string;
  icon?: ReactNode;
  tone?: 'default' | 'brand' | 'success' | 'warning';
}) {
  return (
    <Surface variant="raised" className="care-stat" data-tone={tone}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      {icon ? (
        <span className="care-stat__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
    </Surface>
  );
}

export function Timeline({
  items,
}: {
  items: { id: string; title: string; description?: string; timestamp: string; icon?: ReactNode }[];
}) {
  return (
    <ol className="care-timeline">
      {items.map((item) => (
        <li key={item.id}>
          <span className="care-timeline__marker" aria-hidden="true">
            {item.icon}
          </span>
          <div>
            <strong>{item.title}</strong>
            {item.description ? <p>{item.description}</p> : null}
            <time>{item.timestamp}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function Avatar({
  name,
  src,
  size = 'md',
}: {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span className={`care-avatar care-avatar--${size}`}>
      {src ? <img src={src} alt={name} /> : <span aria-label={name}>{initials}</span>}
    </span>
  );
}

export function AnimatedNumber({ value, label }: { value: number; label: string }) {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      previous.current = value;
      return;
    }
    const controls = animate(previous.current, value, {
      duration: durationTokens.slow / 1000,
      onUpdate: (next) => setDisplay(Math.round(next)),
    });
    previous.current = value;
    return () => controls.stop();
  }, [reduce, value]);
  return <span aria-label={`${label}: ${value}`}>{display.toLocaleString('id-ID')}</span>;
}
