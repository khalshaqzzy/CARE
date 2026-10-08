import { Alert, Skeleton } from '@care/ui';
import type { components } from '@care/contracts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Building2,
  ChevronRight,
  Lock,
  CircleCheck,
  RefreshCw,
  ShieldCheck,
  Star,
  Timer,
  UserRound,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { bucketValue } from '../../lib/dashboard-math';
import { formatCategoryName, SEVERITY_LABELS, STATUS_LABELS } from '../../lib/formatters';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import { NotificationBellButton } from '../notifications/NotificationBell';
import type { DashboardPreview } from '../../workforce-api';
import { ActionSummaryCard, type ActionKind } from './ActionSummary';
import {
  formatDuration,
  initials,
  MemberActivityCard,
  ParticipationSummaryCard,
  ResponderPerformanceCard,
  useHandlers,
  useMyPerformance,
} from './DashboardPeople';

type View = components['schemas']['DashboardView'];
type Bucket = { id?: string; key?: string; name?: string; label: string; value: number };
type MemberDashboard = components['schemas']['MemberDashboard'];
type ViewExtras = Partial<View>;
type Basis = 'HANDLING' | 'REPORTER';

const STATUSES = ['OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED'] as const;
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export type OpsDashboardProps = {
  name: string;
  role: string;
  greeting: string;
  basis: Basis;
  counts: Partial<Record<Basis, number>>;
  onBasis: (basis: Basis) => void;
  scopeLabel?: string | undefined;
  hasOrganizationChoice: boolean;
  onOrganization: () => void;
  organizationDialog: ReactNode;
  filterRow: ReactNode;
  online: boolean;
  onRefresh: () => void;
  data?: (View & ViewExtras) | undefined;
  loadError: ReactNode;
  inbox: { preview: DashboardPreview | undefined; isError: boolean };
  onOpenAction: (kind: ActionKind) => void;
  onOpenRange: (from: string, to: string) => void;
  onOpenVoice: (id: string) => void;
  onOpenList: () => void;
  peopleQuery: Record<string, string | undefined>;
  peopleInsights: boolean;
  /** Department, Section, or Division: the viewer's own unit level. */
  unitLabel: string;
  /** Division leadership reads General Voices without acting on them. */
  readOnlyLabel?: string | undefined;
};

function splitDuration(seconds: number | null) {
  const text = formatDuration(seconds);
  const [value, ...unit] = text.split(' ');
  return { value: value ?? '—', unit: unit.join(' ') };
}

function Comparison({ now, before }: { now: number | null; before: number | null | undefined }) {
  if (now === null || before === null || before === undefined || before === 0) return null;
  const change = Math.round(((now - before) / before) * 100);
  if (change === 0) return <span className="ops-compare">Sama dengan periode lalu</span>;
  const faster = change < 0;
  return (
    <span
      className="ops-compare"
      data-tone={faster ? 'good' : 'bad'}
      title="Dibanding periode sebelumnya dengan durasi sama"
    >
      {faster ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
      {Math.abs(change)}% {faster ? 'lebih cepat' : 'lebih lambat'}
    </span>
  );
}

function useMine() {
  const api = useApi();
  const sessionId = useSessionId();
  return useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'member'),
    queryFn: () => api.dashboardMember(),
    staleTime: 15000,
  });
}

/** Version B: one quiet line under the switcher, only what needs the reporter. */
function MineLine({ mine }: { mine: MemberDashboard | undefined }) {
  const navigate = useNavigate();
  if (!mine) return null;
  const active = mine.counts.OPEN + mine.counts.RESPONDED + mine.counts.IN_PROGRESS;
  return (
    <button type="button" className="ops-mine" onClick={() => void navigate('/history')}>
      <UserRound size={15} aria-hidden="true" />
      <span className="ops-mine__label">Voice saya</span>
      <span className="ops-mine__facts">
        <span>{active} aktif</span>
        {mine.closedPendingReview ? (
          <span className="ops-mine__alert">{mine.closedPendingReview} menunggu rating</span>
        ) : null}
      </span>
      <ChevronRight size={15} aria-hidden="true" />
    </button>
  );
}

/** Calendar span behind one trend bucket, as Voice Member date filters. */
function bucketRange(label: string, grain: string | undefined) {
  const start = new Date(`${label}T00:00:00Z`);
  const end = new Date(start);
  if (grain === 'week') end.setUTCDate(end.getUTCDate() + 6);
  else if (grain === 'month') end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { from: label, to: end.toISOString().slice(0, 10) };
}

function TrendMini({
  data,
  onOpenRange,
}: {
  data: View & ViewExtras;
  onOpenRange?: ((from: string, to: string) => void) | undefined;
}) {
  const points = data.trend;
  const [picked, setPicked] = useState<number>();
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 300;
  const h = 72;
  const top = (value: number) => ((h - (value / max) * (h - 6) - 3) / h) * 100;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * w, (top(p.value) / 100) * h]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x!.toFixed(1)},${y!.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const change =
    data.previousTotal !== null && data.previousTotal > 0
      ? Math.round(((data.total - data.previousTotal) / data.previousTotal) * 100)
      : null;
  const fmt = (label: string) => {
    const date = new Date(`${label}T00:00:00`);
    if (Number.isNaN(date.getTime())) return label;
    return data.trendGrain === 'month'
      ? date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })
      : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };
  const grain =
    data.trendGrain === 'day' ? 'hari' : data.trendGrain === 'week' ? 'minggu' : 'bulan';
  const period = (label: string) =>
    data.trendGrain === 'week' ? `Minggu ${fmt(label)}` : fmt(label);
  // Until a bucket is picked, read out the peak.
  const peak = points.reduce((best, p, i) => (p.value >= points[best]!.value ? i : best), 0);
  const index = picked !== undefined && picked < points.length ? picked : peak;
  const selected = points[index]!;
  // Values sit above the dots while they stay readable; otherwise tap to read.
  const labelled = points.length <= 12;
  return (
    <div className="ops-trend">
      <div className="ops-trend__head">
        <h3>Tren</h3>
        {change !== null ? (
          <span className="ops-compare" data-tone={change > 0 ? 'bad' : 'good'}>
            {change > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(change)}% vs periode lalu
          </span>
        ) : null}
        <span className="ops-trend__max">
          puncak {max}/{grain}
        </span>
      </div>
      <div className="ops-trend__pick" aria-live="polite">
        <span>{period(selected.label)}</span>
        <strong>{selected.value} Voice</strong>
        {onOpenRange && selected.value > 0 ? (
          <button
            type="button"
            className="ops-text-button"
            onClick={() => {
              const range = bucketRange(selected.label, data.trendGrain);
              onOpenRange(range.from, range.to);
            }}
          >
            Lihat Voice <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="ops-trend__plot" data-labelled={labelled || undefined}>
        <svg
          className="ops-trend__chart"
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={area} className="ops-trend__area" />
          <path d={line} className="ops-trend__line" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="ops-trend__points" role="group" aria-label={`Tren Voice per ${grain}`}>
          {points.map((point, i) => (
            <button
              type="button"
              key={point.label}
              className="ops-trend__point"
              style={{
                left: `${(i / (points.length - 1)) * 100}%`,
                width: `${100 / (points.length - 1)}%`,
                ['--y' as string]: `${top(point.value)}%`,
              }}
              aria-pressed={i === index}
              aria-label={`${period(point.label)}: ${point.value} Voice`}
              onClick={() => setPicked(i)}
            >
              <span className="ops-trend__dot" aria-hidden="true" />
              {labelled ? (
                <span className="ops-trend__value" aria-hidden="true">
                  {point.value}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="ops-trend__axis" aria-hidden="true">
        <span>{fmt(points[0]!.label)}</span>
        <span>{fmt(points[Math.floor(points.length / 2)]!.label)}</span>
        <span>{fmt(points[points.length - 1]!.label)}</span>
      </div>
    </div>
  );
}

function ProfileCard(props: OpsDashboardProps & { mineLine?: ReactNode }) {
  return (
    <section className="ops-card ops-profile ops-span-2" aria-label="Profil dan filter">
      <div className="ops-profile__top">
        <span className="ops-profile__avatar" aria-hidden="true">
          {initials(props.name)}
        </span>
        <span className="ops-profile__who">
          <small>{props.greeting}</small>
          <h1>{props.name}</h1>
          <span className="ops-profile__role">{props.role}</span>
        </span>
        <span className="ops-profile__bell">
          <NotificationBellButton />
        </span>
      </div>
      {props.readOnlyLabel ? (
        <span className="ops-readonly">
          <Lock size={12} aria-hidden="true" /> {props.readOnlyLabel}
        </span>
      ) : null}
      <div className="ops-segmented" role="group" aria-label="Basis dashboard">
        {(
          [
            ['HANDLING', 'Voice Untuk Saya'],
            ['REPORTER', 'Voice Tim Saya'],
          ] as const
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={props.basis === id}
            onClick={() => props.onBasis(id)}
          >
            <span>{label}</span>
            {props.counts[id] !== undefined ? (
              <span className="ops-count">{props.counts[id]}</span>
            ) : null}
          </button>
        ))}
      </div>
      {props.mineLine}
      <div className="ops-filters">
        {props.hasOrganizationChoice ? (
          <button
            type="button"
            className="ops-filter-chip"
            aria-label="Filter organisasi"
            aria-haspopup="dialog"
            onClick={props.onOrganization}
          >
            <Building2 size={14} aria-hidden="true" />
            <span>{props.scopeLabel ?? 'Organisasi'}</span>
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : props.scopeLabel ? (
          <span className="ops-filter-chip ops-filter-chip--static">
            <Building2 size={14} aria-hidden="true" />
            <span>{props.scopeLabel}</span>
          </span>
        ) : null}
        {props.filterRow}
        <button
          type="button"
          className="ops-icon-button"
          aria-label="Refresh"
          disabled={!props.online}
          onClick={props.onRefresh}
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </div>
      {props.organizationDialog}
    </section>
  );
}

function StatusCard({
  data,
  team,
  onOpenRange,
}: {
  data: View & ViewExtras;
  team: boolean;
  onOpenRange?: ((from: string, to: string) => void) | undefined;
}) {
  const total = data.total;
  return (
    <section className="ops-card" aria-labelledby="ops-status">
      <div className="ops-card__head">
        <h2 id="ops-status">{team ? 'Status Voice Tim' : 'Status Voice'}</h2>
        <span className="ops-chip">Total {total}</span>
      </div>
      <div className="ops-status" data-total={total}>
        {STATUSES.map((status) => {
          const today = data.statusToday ? bucketValue(data.statusToday, status) : null;
          return (
            <div className="ops-tile ops-status__tile" data-status={status} key={status}>
              <span className="ops-status__label">{STATUS_LABELS[status]}</span>
              <strong>{bucketValue(data.status, status)}</strong>
              {today !== null ? (
                <small data-zero={today === 0 || undefined}>+{today} hari ini</small>
              ) : null}
            </div>
          );
        })}
      </div>
      {total > 0 ? (
        <div className="ops-stack" aria-hidden="true">
          {STATUSES.map((status) => (
            <span
              key={status}
              data-status={status}
              style={{ width: `${(bucketValue(data.status, status) / total) * 100}%` }}
            />
          ))}
        </div>
      ) : null}
      <TrendMini data={data} onOpenRange={onOpenRange} />
    </section>
  );
}

type SpeedFigures = {
  responseSeconds: number | null | undefined;
  completionSeconds: number | null | undefined;
  onTime: { onTime: number; total: number } | null | undefined;
  rating: number | null | undefined;
  ratingCount: number;
};

/**
 * Kecepatan Respons & Penanganan. Leaders with responders below switch
 * between their unit and themselves ("Diri Saya"); the smallest responder sees
 * only their own figures, titled "… Saya".
 */
function SpeedCard({
  data,
  team,
  self,
  query,
}: {
  data: View & ViewExtras;
  team: boolean;
  /** Absent on Voice Tim Saya; otherwise the unit label and whether a toggle shows. */
  self?: { unitLabel: string; toggle: boolean } | undefined;
  query?: Record<string, string | undefined>;
}) {
  const [picked, setPicked] = useState<'unit' | 'self'>('unit');
  const mode = !self ? 'unit' : self.toggle ? picked : 'self';
  const mine = useMyPerformance(query ?? {}, Boolean(self) && mode === 'self');
  const unit: SpeedFigures = {
    responseSeconds: data.performance.averageResponseSeconds,
    completionSeconds: data.performance.averageCompletionSeconds,
    onTime: data.onTime,
    rating: data.performance.averageFeedbackScore,
    ratingCount: data.performance.feedbackSampleCount,
  };
  const own: SpeedFigures | null = mine.data
    ? {
        responseSeconds: mine.data.averageResponseSeconds,
        completionSeconds: mine.data.averageCompletionSeconds,
        onTime: { onTime: mine.data.onTime, total: mine.data.held },
        rating: mine.data.averageRating,
        ratingCount: mine.data.ratingCount,
      }
    : null;
  const figures = mode === 'self' ? own : unit;
  const response = splitDuration(figures?.responseSeconds ?? null);
  const completion = splitDuration(figures?.completionSeconds ?? null);
  const onTime = figures?.onTime;
  const compare = mode === 'unit';
  return (
    <section className="ops-card" aria-labelledby="ops-speed">
      <div className="ops-card__head ops-speed__head">
        <h2 id="ops-speed" data-long={(self && !self.toggle) || undefined}>
          {self && !self.toggle
            ? 'Kecepatan Respons & Penanganan Saya'
            : 'Kecepatan Respons & Penanganan'}
        </h2>
        {self?.toggle ? (
          <div
            className="ops-segmented ops-segmented--small ops-speed__toggle"
            role="group"
            aria-label="Cakupan kecepatan"
          >
            {(
              [
                ['unit', self.unitLabel],
                ['self', 'Diri Saya'],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={picked === id}
                onClick={() => setPicked(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {mode === 'self' && mine.isError ? (
        <p className="ops-empty">Performa Anda belum tersedia.</p>
      ) : mode === 'self' && !own ? (
        <Skeleton label="Memuat performa Anda" />
      ) : (
        <>
          <div className="ops-pair">
            <div className="ops-tile ops-metric">
              <span className="ops-metric__label">
                <Timer size={14} aria-hidden="true" /> {team ? 'Avg respons PIC' : 'Avg respons'}
              </span>
              <span className="ops-metric__value">
                <strong>{response.value}</strong>
                <small>{response.unit}</small>
              </span>
              {compare ? (
                <Comparison
                  now={data.performance.averageResponseSeconds}
                  before={data.previousPerformance?.averageResponseSeconds}
                />
              ) : null}
            </div>
            <div className="ops-tile ops-metric">
              <span className="ops-metric__label">
                <CircleCheck size={14} aria-hidden="true" />{' '}
                {team ? 'Avg selesai PIC' : 'Avg selesai'}
              </span>
              <span className="ops-metric__value">
                <strong>{completion.value}</strong>
                <small>{completion.unit}</small>
              </span>
              {compare ? (
                <Comparison
                  now={data.performance.averageCompletionSeconds}
                  before={data.previousPerformance?.averageCompletionSeconds}
                />
              ) : null}
            </div>
          </div>
          <div className="ops-pair">
            <div className="ops-tile ops-stat">
              <span className="ops-metric__label">
                <ShieldCheck size={14} aria-hidden="true" /> Tepat waktu
              </span>
              <span className="ops-stat__value">
                <strong>
                  {onTime && onTime.total
                    ? `${Math.round((onTime.onTime / onTime.total) * 100)}%`
                    : '—'}
                </strong>
                {onTime ? (
                  <small>
                    {onTime.onTime}/{onTime.total} tepat
                  </small>
                ) : null}
              </span>
            </div>
            <div className="ops-tile ops-stat">
              <span className="ops-metric__label">
                <Star size={14} aria-hidden="true" className="ops-ink-star" /> Rating
              </span>
              <span className="ops-stat__value">
                <strong>{figures?.rating?.toFixed(1) ?? '—'}</strong>
                <small>/ 5 · {figures?.ratingCount ?? 0} ulasan</small>
              </span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function OrganizationBars({ buckets }: { buckets: Bucket[] }) {
  const total = buckets.reduce((sum, b) => sum + b.value, 0);
  return (
    <ul className="ops-bars" role="list">
      {buckets.map((bucket) => (
        <li key={bucket.id ?? bucket.key ?? bucket.label}>
          <span className="ops-bars__row">
            <span>{bucket.name ?? bucket.label}</span>
            <strong>
              {bucket.value}{' '}
              <small>({total ? Math.round((bucket.value / total) * 100) : 0}%)</small>
            </strong>
          </span>
          <span className="ops-bars__track">
            <span style={{ width: `${total ? (bucket.value / total) * 100 : 0}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function CategoryTiles({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="ops-categories">
      {buckets.map((bucket) => {
        const key = bucket.key ?? bucket.id ?? bucket.label;
        return (
          <div
            className="ops-tile ops-category"
            data-zero={bucket.value === 0 || undefined}
            key={key}
          >
            <strong>{bucket.value}</strong>
            <span>{formatCategoryName(key, bucket.name ?? bucket.label) ?? bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SeverityTiles({ buckets }: { buckets: Bucket[] }) {
  return (
    <div className="ops-severities">
      {SEVERITIES.map((severity) => (
        <div className="ops-tile ops-severity" data-severity={severity} key={severity}>
          <span>
            <i aria-hidden="true" />
            {SEVERITY_LABELS[severity]}
          </span>
          <strong>{bucketValue(buckets, severity)}</strong>
        </div>
      ))}
    </div>
  );
}

function SpreadCard(props: OpsDashboardProps & { data: View & ViewExtras }) {
  const { data } = props;
  const level = data.level;
  return (
    <section className="ops-card" aria-labelledby="ops-spread">
      <div className="ops-card__head">
        <h2 id="ops-spread">Sebaran Voice Masuk</h2>
        <span className="ops-chip">{data.total} Voice</span>
      </div>
      <div className="ops-block">
        <h3>Kategori</h3>
        <CategoryTiles buckets={data.category} />
      </div>
      <div className="ops-block">
        <h3>Severity</h3>
        <SeverityTiles buckets={data.severity} />
      </div>
      {data.reporterOrigins?.length ? (
        <div className="ops-block">
          <h3>Asal pengirim</h3>
          <div className="ops-origins">
            {data.reporterOrigins.map((origin) => (
              <span className="ops-origin" key={origin.label}>
                <strong>{origin.value}</strong> {origin.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div className="ops-block">
        <h3>Penanganan per {level === 'section' ? 'section' : level}</h3>
        <OrganizationBars buckets={data.organization} />
      </div>
    </section>
  );
}

function TeamSpreadCard(props: OpsDashboardProps & { data: View & ViewExtras }) {
  const { data } = props;
  const [tab, setTab] = useState<'category' | 'severity' | 'unit'>('category');
  const severityBuckets = SEVERITIES.map((s) => ({
    label: SEVERITY_LABELS[s] ?? s,
    value: bucketValue(data.severity, s),
  }));
  const categoryBuckets = data.category.map((bucket) => {
    const key = bucket.key ?? bucket.id ?? bucket.label;
    return {
      ...bucket,
      name: formatCategoryName(key, bucket.name ?? bucket.label) ?? bucket.label,
    };
  });
  return (
    <section className="ops-card" aria-labelledby="ops-team-spread">
      <div className="ops-card__head">
        <h2 id="ops-team-spread">Sebaran Voice Tim</h2>
        <span className="ops-chip">{data.total} Voice</span>
      </div>
      <div className="ops-segmented ops-segmented--small" role="group" aria-label="Jenis sebaran">
        {(
          [
            ['category', 'Kategori'],
            ['severity', 'Severity'],
            ['unit', 'Unit pengirim'],
          ] as const
        ).map(([id, label]) => (
          <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'category' ? (
        <OrganizationBars buckets={categoryBuckets} />
      ) : tab === 'severity' ? (
        <OrganizationBars buckets={severityBuckets} />
      ) : (
        <OrganizationBars buckets={data.organization} />
      )}
    </section>
  );
}

export function OpsDashboard(props: OpsDashboardProps) {
  const team = props.basis === 'REPORTER';
  const { data } = props;
  const mine = useMine().data;
  // Leaders compare their unit with themselves; the smallest responder
  // (Group Leader, or a Section Head without one) sees their own figures.
  // Fetched once the dashboard has loaded, as Performa Responder always did, so
  // it never competes with the first metadata and aggregate requests.
  const responders = useHandlers(props.peopleQuery, props.peopleInsights && Boolean(data));
  // Managers and division leaders always see their unit; a Section Head is the
  // smallest responder when no Group Leader sits below them (e.g. non-shop).
  const hasResponders =
    props.peopleInsights &&
    (props.unitLabel !== 'Section' || (responders.data?.items.length ?? 1) > 0);
  return (
    <div className={team ? 'ops ops--team' : 'ops ops--handling'}>
      <ProfileCard {...props} mineLine={<MineLine mine={mine} />} />
      {!team && data ? (
        <ActionSummaryCard
          preview={props.inbox.preview}
          isError={props.inbox.isError}
          onPick={props.onOpenAction}
          onOpenVoice={props.onOpenVoice}
          onMore={props.onOpenList}
        />
      ) : null}
      {!props.online ? (
        <div className="ops-span-2">
          <Alert tone="warning" title="Anda sedang offline">
            Data terakhir mungkin sudah usang.
          </Alert>
        </div>
      ) : null}
      {props.loadError ? (
        <div className="ops-span-2">{props.loadError}</div>
      ) : !data ? (
        <div className="ops-card ops-span-2">
          <Skeleton label="Memuat dashboard organisasi" />
        </div>
      ) : (
        <>
          {team && data.teamOverdue ? (
            <div className="ops-strip ops-span-2" role="status">
              <BellRing size={17} aria-hidden="true" />
              <span>{data.teamOverdue} Voice tim lewat batas waktu</span>
              <button type="button" onClick={props.onOpenList}>
                Pantau
              </button>
            </div>
          ) : null}
          {team ? (
            <>
              <div className="ops-column">
                <StatusCard data={data} team={team} />
                {props.peopleInsights ? (
                  <ParticipationSummaryCard query={props.peopleQuery} />
                ) : null}
                {props.peopleInsights ? <MemberActivityCard query={props.peopleQuery} /> : null}
              </div>
              <div className="ops-column">
                <SpeedCard data={data} team={team} />
                <TeamSpreadCard {...props} data={data} />
              </div>
            </>
          ) : (
            <>
              <div className="ops-column">
                <StatusCard data={data} team={team} onOpenRange={props.onOpenRange} />
                <SpreadCard {...props} data={data} />
              </div>
              <div className="ops-column">
                <SpeedCard
                  data={data}
                  team={team}
                  self={{ unitLabel: props.unitLabel, toggle: hasResponders }}
                  query={props.peopleQuery}
                />
                {props.peopleInsights ? (
                  <ResponderPerformanceCard query={props.peopleQuery} />
                ) : null}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
