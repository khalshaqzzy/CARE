import { Alert, Button, Skeleton } from '@care/ui';
import type { components } from '@care/contracts';
import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  Building2,
  ChevronRight,
  Lock,
  CircleCheck,
  Clock3,
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
import {
  formatDuration,
  initials,
  MemberActivityCard,
  ParticipationSummaryCard,
  ResponderPerformanceCard,
} from './DashboardPeople';

type View = components['schemas']['DashboardView'];
type Bucket = { id?: string; key?: string; name?: string; label: string; value: number };
type ListItem = components['schemas']['VoiceListItem'];
type MemberDashboard = components['schemas']['MemberDashboard'];
type ViewExtras = Partial<View>;
type ItemExtras = Partial<ListItem>;
type Basis = 'HANDLING' | 'REPORTER';

const STATUSES = ['OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED'] as const;
const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const SEVERITY_RANK = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;

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
  levelTabs: ReactNode;
  widerLevel: ReactNode;
  inbox: { items: (ListItem & ItemExtras)[] | undefined; isError: boolean };
  onOpenVoice: (id: string) => void;
  onOpenList: () => void;
  peopleQuery: Record<string, string | undefined>;
  peopleInsights: boolean;
  /** Division leadership reads General Voices without acting on them. */
  readOnlyLabel?: string | undefined;
};

function splitDuration(seconds: number | null) {
  const text = formatDuration(seconds);
  const [value, ...unit] = text.split(' ');
  return { value: value ?? '—', unit: unit.join(' ') };
}

function remaining(dueAt: string | null | undefined) {
  if (!dueAt) return null;
  const ms = Date.parse(dueAt) - Date.now();
  const late = ms < 0;
  const minutes = Math.round(Math.abs(ms) / 60000);
  const text =
    minutes < 60
      ? `${minutes} mnt`
      : minutes < 1440
        ? `${Math.round(minutes / 60)} jam`
        : `${Math.round(minutes / 1440)} hari`;
  return {
    late,
    urgent: late || ms < 2 * 3600000,
    text: late ? `Terlambat ${text}` : `Sisa ${text}`,
  };
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

function TrendMini({ data }: { data: View & ViewExtras }) {
  const points = data.trend;
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.value));
  const w = 300;
  const h = 72;
  const xy = points.map((p, i) => [
    (i / (points.length - 1)) * w,
    h - (p.value / max) * (h - 6) - 3,
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x!.toFixed(1)},${y!.toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  const change =
    data.previousTotal !== null && data.previousTotal > 0
      ? Math.round(((data.total - data.previousTotal) / data.previousTotal) * 100)
      : null;
  const fmt = (label: string) => {
    const date = new Date(`${label}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? label
      : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };
  const grain =
    data.trendGrain === 'day' ? 'hari' : data.trendGrain === 'week' ? 'minggu' : 'bulan';
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
      <svg
        className="ops-trend__chart"
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Tren Voice, puncak ${max} per ${grain}`}
      >
        <path d={area} className="ops-trend__area" />
        <path d={line} className="ops-trend__line" vectorEffect="non-scaling-stroke" />
      </svg>
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

function StatusCard({ data, team }: { data: View & ViewExtras; team: boolean }) {
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
      <TrendMini data={data} />
    </section>
  );
}

function SpeedCard({ data, team }: { data: View & ViewExtras; team: boolean }) {
  const response = splitDuration(data.performance.averageResponseSeconds);
  const completion = splitDuration(data.performance.averageCompletionSeconds);
  const onTime = data.onTime;
  return (
    <section className="ops-card" aria-labelledby="ops-speed">
      <div className="ops-card__head">
        <h2 id="ops-speed">Kecepatan Respons &amp; Penanganan</h2>
      </div>
      <div className="ops-pair">
        <div className="ops-tile ops-metric">
          <span className="ops-metric__label">
            <Timer size={14} aria-hidden="true" /> {team ? 'Avg respons PIC' : 'Avg respons'}
          </span>
          <span className="ops-metric__value">
            <strong>{response.value}</strong>
            <small>{response.unit}</small>
          </span>
          <Comparison
            now={data.performance.averageResponseSeconds}
            before={data.previousPerformance?.averageResponseSeconds}
          />
        </div>
        <div className="ops-tile ops-metric">
          <span className="ops-metric__label">
            <CircleCheck size={14} aria-hidden="true" /> {team ? 'Avg selesai PIC' : 'Avg selesai'}
          </span>
          <span className="ops-metric__value">
            <strong>{completion.value}</strong>
            <small>{completion.unit}</small>
          </span>
          <Comparison
            now={data.performance.averageCompletionSeconds}
            before={data.previousPerformance?.averageCompletionSeconds}
          />
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
            <strong>{data.performance.averageFeedbackScore?.toFixed(1) ?? '—'}</strong>
            <small>/ 5 · {data.performance.feedbackSampleCount} ulasan</small>
          </span>
        </div>
      </div>
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
        <div className="ops-block__head">
          <h3>Penanganan per {level === 'section' ? 'section' : level}</h3>
          {props.levelTabs}
        </div>
        <OrganizationBars buckets={data.organization} />
        {props.widerLevel}
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
      <div className="ops-block__head ops-block__head--flush">{props.levelTabs}</div>
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
        <>
          <OrganizationBars buckets={data.organization} />
          {props.widerLevel}
        </>
      )}
    </section>
  );
}

function ActionTickets(props: OpsDashboardProps) {
  const items = [...(props.inbox.items ?? [])]
    .filter((item) => item.status !== 'CLOSED')
    .sort(
      (a, b) =>
        (a.tierDueAt ? Date.parse(a.tierDueAt) : Infinity) -
          (b.tierDueAt ? Date.parse(b.tierDueAt) : Infinity) ||
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
  const urgent = items.filter((item) => remaining(item.tierDueAt)?.urgent).length;
  return (
    <section className="ops-tickets ops-span-2" aria-labelledby="ops-actions">
      <div className="ops-tickets__head">
        <h2 id="ops-actions">Butuh Tindakan Saya</h2>
        {urgent ? <span className="ops-chip ops-chip--alert">{urgent} mendesak</span> : null}
        <Button variant="ghost" size="sm" className="ops-link" onClick={props.onOpenList}>
          Lihat semua
        </Button>
      </div>
      {props.inbox.isError ? (
        <p className="ops-empty">Daftar belum tersedia.</p>
      ) : !props.inbox.items ? (
        <Skeleton label="Memuat Voice yang butuh tindakan" />
      ) : items.length === 0 ? (
        <div className="ops-card">
          <p className="ops-empty">Tidak ada Voice yang menunggu Anda.</p>
        </div>
      ) : (
        <div className="ops-tickets__grid">
          {items.slice(0, 3).map((item) => {
            const due = remaining(item.tierDueAt);
            const category = item.category
              ? formatCategoryName(item.category, item.categoryNameSnapshot)
              : null;
            return (
              <article className="ops-card ops-ticket" key={item.id}>
                <div className="ops-ticket__chips">
                  <span className="ops-pill" data-severity={item.severity}>
                    <i aria-hidden="true" />
                    {SEVERITY_LABELS[item.severity]}
                  </span>
                  {category ? <span className="ops-pill">{category}</span> : null}
                  {due ? (
                    <span className="ops-due" data-urgent={due.urgent || undefined}>
                      <Clock3 size={13} aria-hidden="true" />
                      {due.text}
                    </span>
                  ) : null}
                </div>
                <h3>{item.title}</h3>
                <p className="ops-ticket__meta">
                  {item.reporterName ? `Dari: ${item.reporterName}` : item.displayId}
                  {item.reporterDepartment ? ` · ${item.reporterDepartment}` : ''}
                </p>
                <Button
                  size="sm"
                  className="ops-ticket__cta"
                  onClick={() => props.onOpenVoice(item.id)}
                >
                  Respons
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function OpsDashboard(props: OpsDashboardProps) {
  const team = props.basis === 'REPORTER';
  const { data } = props;
  const mine = useMine().data;
  return (
    <div className={team ? 'ops ops--team' : 'ops ops--handling'}>
      <ProfileCard {...props} mineLine={<MineLine mine={mine} />} />
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
                <StatusCard data={data} team={team} />
                <SpreadCard {...props} data={data} />
              </div>
              <div className="ops-column">
                <SpeedCard data={data} team={team} />
                {props.peopleInsights ? (
                  <ResponderPerformanceCard query={props.peopleQuery} />
                ) : null}
              </div>
              <ActionTickets {...props} />
            </>
          )}
        </>
      )}
    </div>
  );
}
