import { Button, Dialog, Input, Skeleton } from '@care/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Search, Trophy, UsersRound } from 'lucide-react';
import { Fragment, useState, type ReactNode } from 'react';
import { useApi, useSessionId, voiceQuery } from '../../lib/query';
import type { DashboardHandlers, DashboardParticipation } from '../../workforce-api';

export type HandlerPerformance = DashboardHandlers['items'][number];
export type MemberParticipation = DashboardParticipation['members'][number];
type Query = Record<string, string | undefined>;

const ROLE_LABELS = {
  GROUP_LEADER: 'Group Leader',
  SECTION_HEAD: 'Section Head',
  MANAGER: 'Manager',
} as const;
const ROLE_ORDER = ['MANAGER', 'SECTION_HEAD', 'GROUP_LEADER'] as const;
const PREVIEW = 4;

function useHandlers(query: Query) {
  const api = useApi();
  const sessionId = useSessionId();
  return useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'handlers', query),
    queryFn: ({ signal }) => api.dashboardHandlers(query as never, signal),
    staleTime: 30000,
  });
}
function useParticipation(query: Query) {
  const api = useApi();
  const sessionId = useSessionId();
  return useQuery({
    queryKey: voiceQuery(sessionId, 'dashboard', 'participation', query),
    queryFn: ({ signal }) => api.dashboardParticipation(query as never, signal),
    staleTime: 30000,
  });
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
export function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} mnt`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} jam`;
  return `${(seconds / 86400).toFixed(1)} hari`;
}
const percent = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`);
function daysAgo(iso: string | null) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
  return days <= 0 ? 'hari ini' : days === 1 ? 'kemarin' : `${days} hari lalu`;
}
// Best handler first: most punctual, then fewest escalations, then most work.
function bestFirst(a: HandlerPerformance, b: HandlerPerformance) {
  return (
    (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1) ||
    a.autoEscalated - b.autoEscalated ||
    b.held - a.held
  );
}

function SearchSheet<T extends { name: string }>({
  open,
  onOpenChange,
  title,
  items,
  itemKey,
  render,
  tabs,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: T[];
  itemKey: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  tabs?: ReactNode;
}) {
  const [term, setTerm] = useState('');
  const shown = items.filter((item) => item.name.toLowerCase().includes(term.trim().toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} mobileSheet>
      <div className="ops-sheet">
        {tabs}
        <Input
          label="Cari nama"
          hideLabel
          placeholder="Cari nama"
          leading={<Search size={16} />}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <ul className="ops-list" role="list">
          {shown.map((item) => (
            <Fragment key={itemKey(item)}>{render(item, items.indexOf(item))}</Fragment>
          ))}
        </ul>
        {shown.length === 0 ? <p className="ops-empty">Tidak ada nama yang cocok.</p> : null}
      </div>
    </Dialog>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string; count?: number }[];
}) {
  return (
    <div className="ops-segmented ops-segmented--small" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.id}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          <span>{option.label}</span>
          {option.count !== undefined ? <span className="ops-count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function ResponderRow({ person, top }: { person: HandlerPerformance; top: boolean }) {
  return (
    <li className="ops-person" data-top={top || undefined}>
      <span className="ops-avatar" aria-hidden="true">
        {initials(person.name)}
      </span>
      <span className="ops-person__who">
        <span className="ops-person__name">
          <strong>{person.name}</strong>
          {top ? (
            <span className="ops-badge ops-badge--top">
              <Trophy size={11} aria-hidden="true" /> Top
            </span>
          ) : null}
        </span>
        <small>
          {ROLE_LABELS[person.role]} · {person.unitLabel}
        </small>
      </span>
      <span className="ops-person__figures">
        <span>
          <strong>{person.held}</strong>
          <small>Voice</small>
        </span>
        <span>
          <strong>{formatDuration(person.averageResponseSeconds)}</strong>
          <small>Respons</small>
        </span>
        <span>
          <strong>{percent(person.onTimeRate)}</strong>
          <small>Tepat waktu</small>
        </span>
        <span data-alert={person.autoEscalated > 0 || undefined}>
          <strong>{person.autoEscalated}</strong>
          <small>Naik otomatis</small>
        </span>
      </span>
    </li>
  );
}

/** Voice Untuk Saya: how the leaders below the viewer handle their Voices. */
export function ResponderPerformanceCard({ query }: { query: Query }) {
  const result = useHandlers(query);
  const items = result.data?.items ?? [];
  const roles = ROLE_ORDER.filter((role) => items.some((item) => item.role === role));
  const [picked, setPicked] = useState<HandlerPerformance['role']>();
  const role = picked && roles.includes(picked) ? picked : roles[0];
  const list = items.filter((item) => item.role === role).sort(bestFirst);
  const [sheet, setSheet] = useState(false);
  const tabs =
    roles.length > 1 ? (
      <Segmented
        label="Peran responder"
        value={role!}
        onChange={setPicked}
        options={roles.map((id) => ({
          id,
          label: ROLE_LABELS[id],
          count: items.filter((item) => item.role === id).length,
        }))}
      />
    ) : null;
  const render = (person: HandlerPerformance, index: number) => (
    <ResponderRow person={person} top={index === 0 && (person.onTimeRate ?? 0) > 0} />
  );
  // A unit without Section Heads or Group Leaders has nobody to compare.
  if (result.data && items.length === 0) return null;
  return (
    <section className="ops-card" aria-labelledby="ops-responders">
      <div className="ops-card__head">
        <h2 id="ops-responders">Performa Responder</h2>
        {result.data ? <span className="ops-chip">{items.length} orang</span> : null}
      </div>
      {result.isError ? (
        <p className="ops-empty">Performa belum tersedia.</p>
      ) : !result.data ? (
        <Skeleton label="Memuat performa responder" />
      ) : (
        <>
          {tabs}
          <ul className="ops-list" role="list">
            {list.slice(0, PREVIEW).map((person, index) => (
              <Fragment key={person.accountId}>{render(person, index)}</Fragment>
            ))}
          </ul>
          {list.length > PREVIEW ? (
            <Button variant="ghost" className="ops-more" onClick={() => setSheet(true)}>
              Lihat semua {role ? ROLE_LABELS[role] : ''} ({list.length})
            </Button>
          ) : null}
          <SearchSheet
            open={sheet}
            onOpenChange={setSheet}
            title="Performa Responder"
            items={list}
            itemKey={(person) => person.accountId}
            tabs={tabs}
            render={render}
          />
        </>
      )}
    </section>
  );
}

/** Voice Tim Saya: how many members have used CARE at all. */
export function ParticipationSummaryCard({ query }: { query: Query }) {
  const result = useParticipation(query);
  const members = result.data?.members ?? [];
  const total = result.data?.memberCount ?? 0;
  const active = members.filter((m) => m.voiceCount > 0).length;
  const share = total ? Math.round((active / total) * 100) : 0;
  return (
    <section className="ops-card" aria-labelledby="ops-participation">
      <div className="ops-card__head">
        <h2 id="ops-participation">Partisipasi Anggota</h2>
        {result.data ? <span className="ops-chip ops-chip--accent">{share}% aktif</span> : null}
      </div>
      {result.isError ? (
        <p className="ops-empty">Partisipasi belum tersedia.</p>
      ) : !result.data ? (
        <Skeleton label="Memuat partisipasi anggota" />
      ) : (
        <div className="ops-panel ops-participation">
          <div className="ops-participation__top">
            <span className="ops-participation__total">
              <UsersRound size={18} aria-hidden="true" />
              <strong>{total}</strong>
              <small>anggota</small>
            </span>
            <span className="ops-participation__split">
              <span>
                <strong className="ops-ink-accent">{active}</strong>
                <small>Pernah kirim</small>
              </span>
              <span>
                <strong className="ops-ink-alert">{total - active}</strong>
                <small>Belum kirim</small>
              </span>
            </span>
          </div>
          <div
            className="ops-meter"
            role="img"
            aria-label={`${active} dari ${total} anggota pernah mengirim Voice`}
          >
            <span style={{ width: `${share}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

function MemberRow({ member, rank }: { member: MemberParticipation; rank: number }) {
  const sent = member.voiceCount > 0;
  return (
    <li className="ops-person ops-person--member">
      <span className="ops-avatar" data-muted={!sent || undefined} aria-hidden="true">
        {initials(member.name)}
      </span>
      <span className="ops-person__who">
        <span className="ops-person__name">
          <strong>{member.name}</strong>
          {sent && rank === 0 ? (
            <span className="ops-badge ops-badge--top">
              <Trophy size={11} aria-hidden="true" /> Top Contributor
            </span>
          ) : null}
        </span>
        <small>
          {member.unitLabel}
          {sent && member.lastSubmittedAt ? ` · Terakhir ${daysAgo(member.lastSubmittedAt)}` : ''}
        </small>
      </span>
      {sent ? (
        <span className="ops-person__count">
          <strong>{member.voiceCount} Voice</strong>
        </span>
      ) : (
        <span className="ops-badge" data-tone={member.activated ? 'neutral' : 'warning'}>
          {member.activated ? 'Belum kirim' : 'Belum aktivasi'}
        </span>
      )}
    </li>
  );
}

/** Voice Tim Saya: who reports most, and who has never reported. */
export function MemberActivityCard({ query }: { query: Query }) {
  const result = useParticipation(query);
  const members = result.data?.members ?? [];
  const active = members
    .filter((m) => m.voiceCount > 0)
    .sort((a, b) => b.voiceCount - a.voiceCount);
  const none = members
    .filter((m) => m.voiceCount === 0)
    .sort((a, b) => Number(a.activated) - Number(b.activated) || a.name.localeCompare(b.name));
  const [tab, setTab] = useState<'active' | 'none'>('active');
  const [sheet, setSheet] = useState(false);
  const list = tab === 'active' ? active : none;
  const tabs = (
    <Segmented
      label="Daftar anggota"
      value={tab}
      onChange={setTab}
      options={[
        { id: 'active', label: 'Top kontributor', count: active.length },
        { id: 'none', label: 'Belum kirim', count: none.length },
      ]}
    />
  );
  const render = (member: MemberParticipation, index: number) => (
    <MemberRow member={member} rank={tab === 'active' ? index : -1} />
  );
  return (
    <section className="ops-card" aria-labelledby="ops-members">
      <div className="ops-card__head">
        <h2 id="ops-members">Aktivitas Anggota</h2>
        {result.data ? <span className="ops-chip">{result.data.memberCount} anggota</span> : null}
      </div>
      {result.isError ? (
        <p className="ops-empty">Aktivitas belum tersedia.</p>
      ) : !result.data ? (
        <Skeleton label="Memuat aktivitas anggota" />
      ) : (
        <>
          {tabs}
          {tab === 'none' && none.length ? (
            <p className="ops-split">
              <span>
                <strong>{none.filter((m) => !m.activated).length}</strong> belum aktivasi
              </span>
              <span>
                <strong>{none.filter((m) => m.activated).length}</strong> aktif, belum kirim
              </span>
            </p>
          ) : null}
          {list.length === 0 ? (
            <p className="ops-empty">
              {tab === 'active'
                ? 'Belum ada anggota yang mengirim Voice.'
                : 'Semua anggota sudah mengirim Voice.'}
            </p>
          ) : (
            <ul className="ops-list" role="list">
              {list.slice(0, PREVIEW).map((member, index) => (
                <Fragment key={member.id}>{render(member, index)}</Fragment>
              ))}
            </ul>
          )}
          {list.length > PREVIEW ? (
            <Button variant="ghost" className="ops-more" onClick={() => setSheet(true)}>
              Lihat semua ({list.length}) <ArrowUpRight size={14} aria-hidden="true" />
            </Button>
          ) : null}
          <SearchSheet
            open={sheet}
            onOpenChange={setSheet}
            title="Aktivitas Anggota"
            items={list}
            itemKey={(member) => member.id}
            tabs={tabs}
            render={render}
          />
        </>
      )}
    </section>
  );
}
