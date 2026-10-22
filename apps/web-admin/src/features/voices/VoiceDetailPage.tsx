import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert } from '@care/ui';
import { ArrowLeft, Check, Lock, Paperclip, Star } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi } from '../../admin-api';
import { remainingTime } from './voice-time';

const STATUS = ['OPEN', 'RESPONDED', 'IN_PROGRESS', 'CLOSED'] as const;
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Terbuka',
  RESPONDED: 'Direspon',
  IN_PROGRESS: 'Diproses',
  CLOSED: 'Selesai',
};
const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritis',
};
const LEVEL_LABELS: Record<string, string> = {
  GROUP_LEADER: 'Group Leader',
  SECTION_HEAD: 'Section Head',
  MANAGER: 'Department Head',
  DIVISION: 'Division Head',
};
const STAGE_LABELS: Record<string, string> = {
  DONE: 'Selesai',
  LATE: 'Terlewat',
  CURRENT: 'Sedang memegang',
  NEXT: 'Berikutnya',
  APPROVED: 'Disetujui',
  PENDING: 'Menunggu',
};
const TARGET_LABELS: Record<string, string> = {
  ON_TRACK: 'Sesuai jadwal',
  OVERDUE: 'Terlambat',
  COMPLETED_ON_TIME: 'Selesai tepat waktu',
  COMPLETED_LATE: 'Selesai terlambat',
  SPECIAL: 'Penanganan Khusus',
};
const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: 'Diajukan',
  RESPONDED: 'Direspon',
  ASKED_REPORTER: 'Menanyakan pelapor',
  MESSAGE_SENT: 'Pesan terkirim',
  ASSIGNED: 'Ditugaskan',
  REASSIGNED: 'Dialihkan',
  HANDOVER_COMPLETED: 'Dihandover',
  ESCALATED: 'Dinaikkan ke atasan',
  SEVERITY_CHANGED: 'Severity diubah',
  REMINDED: 'Diingatkan',
  TARGET_SET: 'Target ditetapkan',
  TARGET_OVERDUE: 'Target terlewati',
  PROCEEDED: 'Diproses',
  CLOSED: 'Ditutup',
  CLOSURE_REPORTED: 'Dilaporkan selesai',
  CLOSURE_APPROVED: 'Penyelesaian disetujui',
  CLOSURE_RETURNED: 'Dikembalikan ke PIC',
  RATED: 'Dinilai',
  REOPENED: 'Dibuka kembali',
  AUTO_ACCEPTED: 'Diterima otomatis',
  DEADLINE_MISSED: 'Batas waktu terlewati',
};

const dateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–';

type Named = { id: string; displayName: string };
type FullDetail = {
  id: string;
  displayId: string;
  audience: string;
  visibility: 'GENERAL' | 'PRIVATE';
  title: string;
  detail: string;
  status: string;
  severity: string;
  area: string;
  locationDetail: string;
  categoryNameSnapshot?: string | null;
  category?: string | null;
  submittedAt: string;
  updatedAt: string;
  tierDueAt?: string | null;
  routeOwner?: Named;
  currentHandler?: Named | null;
  shopLocation?: { department: string } | null;
  attachments?: { id: string; state: string; mimeType?: string }[];
  reporter?: {
    name?: string;
    noReg?: string;
    division?: string;
    department?: string;
    section?: string | null;
    position?: string | null;
  };
  tierStages?: { level: string; state: string; names: string[] }[];
  participants?: { id: string; displayName: string; role: string }[];
  handlingCycleNumber?: number;
  handlingTargets?: {
    cycleNumber: number;
    kind?: string;
    days: number | null;
    setAt: string;
    dueAt: string | null;
    specialReason?: string | null;
    state?: string;
  }[];
  closureApproval?: {
    reportedAt: string;
    reportedBy?: string | null;
    note?: string | null;
    steps: { level: string; names: string[]; state: string; dueAt: string | null; late: boolean }[];
  } | null;
  closureCycles?: {
    id: string;
    cycleNumber: number;
    note: string;
    closedAt: string;
    reopenedAt?: string | null;
    reviewState?: string | null;
    actor?: { displayName: string } | null;
    rating?: { score: number; feedback?: string | null; createdAt?: string } | null;
  }[];
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="admin-card admin-vd-card" aria-label={title}>
      <h2 className="admin-card__title">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="admin-kv__row">
      <span className="admin-kv__label">{label}</span>
      <span className="admin-kv__value">{children}</span>
    </div>
  );
}

/** Admin read-only Voice page with everything a responder sees. */
export function VoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const key = (...parts: string[]) =>
    careQueryKey(session?.sessionId ?? 'anon', 'voice', id ?? '', ...parts);
  const detail = useQuery({
    queryKey: key('detail'),
    queryFn: () => api.voice(id!),
    enabled: !!id,
  });
  const timeline = useQuery({
    queryKey: key('timeline'),
    queryFn: () => api.voiceTimeline(id!, { limit: 100, order: 'asc' }),
    enabled: !!id,
  });
  const messages = useQuery({
    queryKey: key('messages'),
    queryFn: () => api.voiceMessages(id!, { limit: 100, order: 'asc' }),
    enabled: !!id,
  });
  // Handover history is for the CARE Admin, who also routes Admin handovers.
  const careAdmin = !!session?.capabilities.includes('CARE_ADMIN');
  const general = detail.data?.visibility === 'GENERAL';
  const adminHandovers = useQuery({
    queryKey: key('admin-handovers'),
    queryFn: () => api.adminHandoverHistory(id!),
    enabled: !!id && careAdmin && general,
  });
  const directHandovers = useQuery({
    queryKey: key('direct-handovers'),
    queryFn: () => api.directHandoverHistory(id!),
    enabled: !!id && careAdmin && general,
  });
  if (detail.isLoading) return <AdminSkeleton lines={6} label="Memuat detail Voice" />;
  if (!detail.data)
    return (
      <Alert tone="danger" title="Voice tidak tersedia">
        {String((detail.error as Error | null)?.message ?? '')}
      </Alert>
    );
  const voice = detail.data as unknown as FullDetail;
  const statusIndex = STATUS.indexOf(voice.status as (typeof STATUS)[number]);
  const target = voice.handlingTargets?.find(
    (item) => item.cycleNumber === (voice.handlingCycleNumber ?? 1),
  );
  const remaining = remainingTime({
    status: voice.status,
    targetDueAt: target?.dueAt ?? null,
    tierDueAt: voice.tierDueAt ?? null,
    specialHandling: target?.kind === 'SPECIAL',
  });
  const lastCycle = voice.closureCycles?.at(-1);
  const reporterId = voice.participants?.find((person) => person.role === 'REPORTER')?.id;
  const handovers = [
    ...(adminHandovers.data?.items ?? []).map((item) => ({
      id: item.id,
      at: item.createdAt,
      title: `Manager → Admin · ${
        item.status === 'PENDING'
          ? 'Menunggu'
          : item.status === 'ROUTED'
            ? 'Diteruskan'
            : 'Dikembalikan'
      }`,
      detail: [
        `${item.managerName}: ${item.managerDetail}`,
        item.adminDetail ? `${item.adminName ?? 'Admin'}: ${item.adminDetail}` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    })),
    ...(directHandovers.data?.items ?? []).map((item) => ({
      id: item.id,
      at: item.createdAt,
      title: `${item.from.pic.displayName} → ${item.to.pic.displayName}`,
      detail: item.detail ?? '',
    })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <div className="admin-vd">
      <Link to="/voices" className="admin-vd__back">
        <ArrowLeft size={14} aria-hidden="true" /> Voice Explorer
      </Link>
      <header className="admin-vd__head">
        <div>
          <span className="admin-id admin-nums">{voice.displayId}</span>
          <h1>{voice.title}</h1>
          <div className="admin-vd__pills">
            <span className="admin-pill" data-tone="info">
              {STATUS_LABELS[voice.status] ?? voice.status}
            </span>
            <span
              className="admin-pill"
              data-tone={['HIGH', 'CRITICAL'].includes(voice.severity) ? 'danger' : 'warning'}
            >
              {SEVERITY_LABELS[voice.severity] ?? voice.severity}
            </span>
            <span className="admin-pill" data-tone="neutral">
              {voice.categoryNameSnapshot ?? voice.category ?? '–'}
            </span>
            {voice.visibility === 'PRIVATE' ? (
              <span className="admin-pill" data-tone="warning">
                <Lock size={12} aria-hidden="true" /> Private · dibaca diaudit
              </span>
            ) : null}
          </div>
        </div>
        <div className="admin-vd__dates admin-meta--xs">
          <span>Diajukan {dateTime(voice.submittedAt)}</span>
          <span>Diperbarui {dateTime(voice.updatedAt)}</span>
        </div>
      </header>

      <ol className="admin-vd__progress" aria-label="Status">
        {STATUS.map((status, index) => (
          <li
            key={status}
            data-state={index < statusIndex ? 'done' : index === statusIndex ? 'current' : 'next'}
          >
            <span aria-hidden="true">{index < statusIndex ? <Check size={12} /> : index + 1}</span>
            {STATUS_LABELS[status]}
          </li>
        ))}
      </ol>

      <div className="admin-vd__facts">
        <div>
          <span className="admin-kv__label">Severity</span>
          <strong data-tone={['HIGH', 'CRITICAL'].includes(voice.severity) ? 'danger' : undefined}>
            {SEVERITY_LABELS[voice.severity] ?? voice.severity}
          </strong>
        </div>
        <div>
          <span className="admin-kv__label">Kategori</span>
          <strong>{voice.categoryNameSnapshot ?? voice.category ?? '–'}</strong>
        </div>
        <div>
          <span className="admin-kv__label">Sisa waktu</span>
          <strong data-tone={remaining.tone}>{remaining.label}</strong>
        </div>
        <div>
          <span className="admin-kv__label">PIC</span>
          <strong>{voice.currentHandler?.displayName ?? 'Belum ada'}</strong>
        </div>
      </div>

      <div className="admin-vd__grid">
        <div className="admin-vd__main">
          <Card title="Detail Voice">
            <p className="admin-vd__text">{voice.detail}</p>
            <div className="admin-kv">
              <Row label="Area">{voice.area}</Row>
              <Row label="Lokasi">{voice.locationDetail}</Row>
              {voice.shopLocation ? <Row label="Shop">{voice.shopLocation.department}</Row> : null}
              <Row label="Lampiran">
                {voice.attachments?.length ? (
                  <span className="admin-vd__files">
                    {voice.attachments.map((file, index) => (
                      <a
                        key={file.id}
                        href={`/api/v1/media/${file.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Paperclip size={12} aria-hidden="true" /> Lampiran {index + 1}
                      </a>
                    ))}
                  </span>
                ) : (
                  'Tidak ada'
                )}
              </Row>
            </div>
          </Card>

          <Card title="Penanganan">
            <div className="admin-kv">
              <Row label="Penanggung jawab rute">{voice.routeOwner?.displayName ?? '–'}</Row>
              <Row label="PIC">{voice.currentHandler?.displayName ?? 'Belum ada'}</Row>
              <Row label="Target">
                {target
                  ? target.kind === 'SPECIAL'
                    ? `Penanganan Khusus — ${target.specialReason ?? ''}`
                    : `${target.days} hari · batas ${dateTime(target.dueAt)} · ${TARGET_LABELS[target.state ?? ''] ?? ''}`
                  : 'Belum ditetapkan'}
              </Row>
            </div>
            {voice.tierStages?.length ? (
              <>
                <h3 className="admin-vd__sub">Tahap penanganan</h3>
                <ul className="admin-vd__stages">
                  {voice.tierStages.map((stage) => (
                    <li key={stage.level} data-state={stage.state}>
                      <strong>{LEVEL_LABELS[stage.level] ?? stage.level}</strong>
                      <span>{stage.names.join(', ') || '–'}</span>
                      <span
                        className="admin-pill"
                        data-tone={
                          stage.state === 'LATE'
                            ? 'danger'
                            : stage.state === 'CURRENT'
                              ? 'info'
                              : 'neutral'
                        }
                      >
                        {STAGE_LABELS[stage.state] ?? stage.state}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {voice.closureApproval ? (
              <>
                <h3 className="admin-vd__sub">
                  Persetujuan penutupan · dilaporkan {dateTime(voice.closureApproval.reportedAt)}
                </h3>
                {voice.closureApproval.note ? (
                  <p className="admin-vd__quote">{voice.closureApproval.note}</p>
                ) : null}
                <ul className="admin-vd__stages">
                  {voice.closureApproval.steps.map((step) => (
                    <li key={step.level} data-state={step.state}>
                      <strong>{LEVEL_LABELS[step.level] ?? step.level}</strong>
                      <span>
                        {step.names.join(', ')} · batas {dateTime(step.dueAt)}
                      </span>
                      <span
                        className="admin-pill"
                        data-tone={
                          step.late ? 'danger' : step.state === 'APPROVED' ? 'success' : 'neutral'
                        }
                      >
                        {step.late ? 'Terlambat' : (STAGE_LABELS[step.state] ?? step.state)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>

          <Card title="Percakapan">
            {messages.data?.items.length ? (
              <ul className="admin-vd__chat">
                {messages.data.items.map((message) => {
                  const sender = message.sender as {
                    kind: string;
                    alias?: string;
                    displayName?: string;
                  };
                  const fromReporter = !!message.senderId && message.senderId === reporterId;
                  return (
                    <li
                      key={message.id}
                      data-from={fromReporter ? 'reporter' : 'responder'}
                      data-kind={(message as { kind?: string }).kind}
                    >
                      <span className="admin-vd__chat-meta">
                        <strong>{sender.displayName ?? sender.alias ?? sender.kind}</strong>{' '}
                        {dateTime(message.createdAt)}
                      </span>
                      <span>{message.text}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="admin-meta--xs">Belum ada percakapan.</p>
            )}
          </Card>
          <Card title="Komentar responder & rating">
            {voice.closureApproval?.note ? (
              <div className="admin-vd__cycle">
                <span className="admin-meta--xs">
                  Dilaporkan selesai {dateTime(voice.closureApproval.reportedAt)}
                  {voice.closureApproval.reportedBy ? ` · ${voice.closureApproval.reportedBy}` : ''}
                </span>
                <p className="admin-vd__quote">{voice.closureApproval.note}</p>
              </div>
            ) : null}
            {voice.closureCycles?.length ? (
              voice.closureCycles.map((cycle) => (
                <div key={cycle.id} className="admin-vd__cycle">
                  <span className="admin-meta--xs">
                    {cycle.actor?.displayName ?? 'PIC'} · ditutup {dateTime(cycle.closedAt)}
                    {cycle.reopenedAt ? ` · dibuka kembali ${dateTime(cycle.reopenedAt)}` : ''}
                  </span>
                  <p className="admin-vd__quote">{cycle.note}</p>
                  {cycle.rating ? (
                    <div className="admin-vd__rating">
                      <span aria-label={`Rating ${cycle.rating.score} dari 5`}>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            aria-hidden="true"
                            data-on={star <= cycle.rating!.score || undefined}
                          />
                        ))}
                      </span>
                      {cycle.rating.feedback ? <q>{cycle.rating.feedback}</q> : null}
                    </div>
                  ) : (
                    <span className="admin-meta--xs">Belum ada rating pelapor.</span>
                  )}
                </div>
              ))
            ) : voice.closureApproval?.note ? null : (
              <p className="admin-meta--xs">
                {lastCycle ? '' : 'Belum ada komentar penyelesaian dan rating.'}
              </p>
            )}
          </Card>
        </div>

        <aside className="admin-vd__side">
          <Card title="Pelapor">
            {voice.reporter?.name ? (
              <div className="admin-kv">
                <Row label="Nama">{voice.reporter.name}</Row>
                <Row label="No. Reg">{voice.reporter.noReg}</Row>
                <Row label="Divisi">{voice.reporter.division}</Row>
                <Row label="Departemen">{voice.reporter.department}</Row>
                <Row label="Seksi">{voice.reporter.section ?? '–'}</Row>
                <Row label="Posisi">{voice.reporter.position ?? '–'}</Row>
              </div>
            ) : (
              <p className="admin-meta--xs">Identitas pelapor tidak ditampilkan.</p>
            )}
          </Card>
          <Card title="Riwayat">
            <ol className="admin-vd__timeline">
              {(timeline.data?.items ?? []).map((event) => {
                const actorName = (event as { actorName?: string }).actorName;
                return (
                  <li key={event.id}>
                    <strong>{EVENT_LABELS[event.type] ?? event.type}</strong>
                    <span className="admin-meta--xs">
                      {dateTime(event.occurredAt)}
                      {actorName ? ` · ${actorName}` : ''}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
          {handovers.length ? (
            <Card title="Riwayat handover">
              <ol className="admin-vd__timeline">
                {handovers.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span className="admin-meta--xs">{dateTime(item.at)}</span>
                    {item.detail ? <span>{item.detail}</span> : null}
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
