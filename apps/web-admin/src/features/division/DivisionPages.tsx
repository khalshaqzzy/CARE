import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Button } from '@care/ui';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Download,
  Inbox,
  Lock,
  MessageSquareReply,
  Wrench,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { createAdminApi, type DivisionExportQuery, type DivisionOverview } from '../../admin-api';

const number = (value: number) => value.toLocaleString('id-ID');

export function useDivisionOverview() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  return useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'division', 'overview'),
    queryFn: () => api.divisionOverview(),
    enabled: !!session?.capabilities.includes('DIVISION_ADMIN'),
  });
}

/** "Unduh Excel": every General Voice of the division matching the filter, with chat. */
export function ExportButton({
  query,
}: {
  query: { [K in keyof DivisionExportQuery]?: string | undefined };
}) {
  const { transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const download = async () => {
    setPending(true);
    setError('');
    try {
      const file = await api.divisionExport(query as never);
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unduhan gagal.');
    } finally {
      setPending(false);
    }
  };
  return (
    <span className="admin-export">
      <Button variant="secondary" size="sm" loading={pending} onClick={() => void download()}>
        <Download size={14} aria-hidden="true" /> Unduh Excel
      </Button>
      {error ? (
        <span role="alert" className="admin-meta--xs admin-export__error">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export type DivisionTile = 'open' | 'responded' | 'inProgress' | 'closed' | 'overdue' | 'soon';

/** Status tiles, then how many active Voices are late or due within 24 hours. */
export function DivisionKpis({
  overview,
  current,
  onPick,
}: {
  overview: DivisionOverview;
  current?: DivisionTile | null;
  onPick: (tile: DivisionTile) => void;
}) {
  const { general } = overview;
  const tiles: {
    id: DivisionTile;
    label: string;
    value: number;
    tone: string;
    icon: ReactElement;
  }[] = [
    {
      id: 'open',
      label: 'Terbuka',
      value: general.open,
      tone: 'warning',
      icon: <Inbox size={18} />,
    },
    {
      id: 'responded',
      label: 'Direspon',
      value: general.responded,
      tone: 'info',
      icon: <MessageSquareReply size={18} />,
    },
    {
      id: 'inProgress',
      label: 'Diproses',
      value: general.inProgress,
      tone: 'info',
      icon: <Wrench size={18} />,
    },
    {
      id: 'closed',
      label: 'Selesai',
      value: general.closed,
      tone: 'success',
      icon: <CheckCircle2 size={18} />,
    },
  ];
  const due: { id: DivisionTile; label: string; value: number }[] = [
    { id: 'overdue', label: 'terlambat', value: general.overdue },
    { id: 'soon', label: '< 24 jam', value: general.dueSoon },
  ];
  return (
    <div className="admin-division-kpis">
      {tiles.map((tile) => (
        <button
          key={tile.id}
          type="button"
          className="admin-division-kpi"
          aria-pressed={current === tile.id}
          onClick={() => onPick(tile.id)}
        >
          <span className="admin-kpi__icon" data-tone={tile.tone} aria-hidden="true">
            {tile.icon}
          </span>
          <span className="admin-kpi__body">
            <span className="admin-kpi__value">{number(tile.value)}</span>
            <span className="admin-kpi__label">{tile.label}</span>
          </span>
        </button>
      ))}
      <p className="admin-division-due">
        {due.map((item) => (
          <button
            key={item.id}
            type="button"
            className="admin-pill"
            data-tone={item.value ? (item.id === 'overdue' ? 'danger' : 'warning') : 'neutral'}
            aria-pressed={current === item.id}
            onClick={() => onPick(item.id)}
          >
            <CircleDot size={12} aria-hidden="true" /> {number(item.value)} {item.label}
          </button>
        ))}
        <span className="admin-division-private">
          <Lock size={12} aria-hidden="true" /> Private {number(overview.private.total)} (
          {number(overview.private.active)} aktif) · ditangani Komite
        </span>
      </p>
    </div>
  );
}

/** Voice list query for a tile or a due chip. */
export function tileParams(tile: DivisionTile): Record<string, string> {
  if (tile === 'overdue') return { due: 'OVERDUE' };
  if (tile === 'soon') return { due: 'SOON' };
  return {
    status: { open: 'OPEN', responded: 'RESPONDED', inProgress: 'IN_PROGRESS', closed: 'CLOSED' }[
      tile
    ],
  };
}

const SUMMARY_KEY = 'care-admin:division-summary';
function readOpen() {
  try {
    return localStorage.getItem(SUMMARY_KEY) !== 'closed';
  } catch {
    return true;
  }
}

const weekLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

function TopList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; detail?: string; value: string }[];
  empty: string;
}) {
  return (
    <div className="admin-division-panel">
      <h3>{title}</h3>
      {rows.length ? (
        <ol className="admin-division-top">
          {rows.slice(0, 3).map((row) => (
            <li key={`${row.name}-${row.detail ?? ''}`}>
              <span className="admin-division-top__name" title={row.detail}>
                {row.name}
              </span>
              <span className="admin-nums">{row.value}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="admin-meta--xs">{empty}</p>
      )}
    </div>
  );
}

/** Compact division summary above the Voice list; collapsible so the list stays in view. */
export function DivisionSummary({ overview }: { overview: DivisionOverview }) {
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem(SUMMARY_KEY, open ? 'closed' : 'open');
    } catch {
      /* Storage may be unavailable; the toggle still works for this visit. */
    }
  };
  const peak = Math.max(1, ...overview.trend.map((week) => week.count));
  const thisWeek = overview.trend.at(-1)?.count ?? 0;
  const severities = [
    { key: 'critical', label: 'Kritis', value: overview.severity.critical },
    { key: 'high', label: 'Tinggi', value: overview.severity.high },
    { key: 'medium', label: 'Sedang', value: overview.severity.medium },
    { key: 'low', label: 'Rendah', value: overview.severity.low },
  ];
  const severityTotal = severities.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="admin-division-summary">
      <button
        type="button"
        className="admin-division-summary__toggle"
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? (
          <ChevronUp size={14} aria-hidden="true" />
        ) : (
          <ChevronDown size={14} aria-hidden="true" />
        )}
        {open ? 'Sembunyikan ringkasan' : 'Tampilkan ringkasan'}
      </button>
      {open ? (
        <div className="admin-division-panels">
          <div className="admin-division-panel">
            <h3>Tren 8 minggu</h3>
            <div
              className="admin-division-trend"
              role="img"
              aria-label={`Voice per minggu: ${overview.trend.map((week) => `${weekLabel(week.weekStart)} ${week.count}`).join(', ')}`}
            >
              {overview.trend.map((week) => (
                <span
                  key={week.weekStart}
                  title={`${weekLabel(week.weekStart)}: ${week.count} Voice`}
                  style={{ height: `${Math.max(4, (week.count / peak) * 100)}%` }}
                  data-empty={week.count === 0 || undefined}
                />
              ))}
            </div>
            <p className="admin-meta--xs">{number(thisWeek)} minggu ini</p>
          </div>
          <div className="admin-division-panel">
            <h3>Tingkat</h3>
            <div className="admin-division-severity" aria-hidden="true">
              {severities.map((item) =>
                item.value ? (
                  <span
                    key={item.key}
                    data-severity={item.key}
                    title={`${item.label}: ${item.value}`}
                    style={{ flexGrow: item.value }}
                  />
                ) : null,
              )}
              {severityTotal ? null : <span data-severity="none" style={{ flexGrow: 1 }} />}
            </div>
            <ul className="admin-division-legend">
              {severities.map((item) => (
                <li key={item.key}>
                  <i data-severity={item.key} aria-hidden="true" /> {item.label}{' '}
                  <span className="admin-nums">{number(item.value)}</span>
                </li>
              ))}
            </ul>
          </div>
          <TopList
            title="Tujuan"
            rows={overview.destinations.map((item) => ({
              name: item.department ?? 'Belum tercatat',
              value: number(item.count),
            }))}
            empty="Belum ada Voice."
          />
          <TopList
            title="Top kontributor"
            rows={overview.topReporters.map((item) => ({
              name: item.name,
              ...(item.department ? { detail: item.department } : {}),
              value: number(item.count),
            }))}
            empty="Belum ada Voice."
          />
          <TopList
            title="Top responder"
            rows={overview.topResponders.map((item) => ({
              name: item.name,
              value: `${number(item.count)} · ${number(item.closed)} selesai`,
            }))}
            empty="Belum ada PIC."
          />
        </div>
      ) : null}
    </div>
  );
}
