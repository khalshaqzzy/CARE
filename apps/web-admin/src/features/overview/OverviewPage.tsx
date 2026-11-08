import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Button, Stack } from '@care/ui';
import {
  AlarmClock,
  ArrowRight,
  Bell,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  CircleDot,
  CloudUpload,
  FileSearch,
  GitPullRequestArrow,
  Inbox,
  LoaderCircle,
  LogIn,
  Route as RouteIcon,
  ShieldCheck,
  ShieldAlert,
  Timer,
  UserCheck,
  UsersRound,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminKpi } from '../../components/AdminKpi';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { AdminBars, formatCount, formatDuration } from '../../components/AdminSummary';
import { createAdminApi } from '../../admin-api';

const IMPORT_STATUS_LABELS: Record<string, string> = {
  PREVIEWED: 'Siap divalidasi',
  QUEUED: 'Dalam antrean',
  PROCESSING: 'Diproses',
  CONFIRMED: 'Berhasil',
  FAILED: 'Gagal',
  EXPIRED: 'Kedaluwarsa',
};

/** First day of the current WIB month, as the Voice Explorer date filter value. */
function wibMonthStart(now = new Date()) {
  const wib = new Date(now.getTime() + 7 * 3_600_000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function CardHead({
  icon,
  title,
  meta,
  action,
}: {
  icon: ReactNode;
  title: string;
  meta?: string | undefined;
  action?: ReactNode | undefined;
}) {
  return (
    <div className="admin-overview__head">
      <h2 className="admin-card__title" style={{ margin: 0 }}>
        {icon} {title}
      </h2>
      {meta ? <span className="admin-meta--xs">{meta}</span> : null}
      {action ? <span className="admin-overview__action">{action}</span> : null}
    </div>
  );
}

/**
 * CARE Admin home: this month's Voices, what needs the Admin now, account
 * adoption and system state, each linking to the page that holds the detail.
 */
export function OverviewPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const navigate = useNavigate();
  const monthStart = wibMonthStart();
  const sid = session?.sessionId ?? 'anon';
  const overview = useQuery({
    queryKey: careQueryKey(sid, 'overview'),
    queryFn: api.overview,
    enabled: !!session,
    staleTime: 30_000,
  });
  const month = useQuery({
    queryKey: careQueryKey(sid, 'overview', 'voices-month', monthStart),
    queryFn: () => api.voiceSummary({ origin: 'CARE', from: `${monthStart}T00:00:00.000+07:00` }),
    enabled: !!session,
    staleTime: 30_000,
  });
  const accounts = useQuery({
    queryKey: careQueryKey(sid, 'overview', 'accounts'),
    queryFn: () => api.accountSummary({ kind: 'WORKFORCE', status: 'ACTIVE' }),
    enabled: !!session,
    staleTime: 60_000,
  });
  const login = useQuery({
    queryKey: careQueryKey(sid, 'accounts', 'login', '', ''),
    queryFn: () => api.loginSummary({}),
    enabled: !!session,
    staleTime: 60_000,
  });
  const handovers = useQuery({
    queryKey: careQueryKey(sid, 'admin-handovers', 'menu-count'),
    queryFn: () => api.adminHandovers(),
    enabled: !!session,
    staleTime: 60_000,
  });
  const ready = useQuery({ queryKey: ['ready'], queryFn: api.ready, enabled: !!session });
  const release = useQuery({ queryKey: ['release'], queryFn: api.release, enabled: !!session });

  const data = overview.data;
  const voices = month.data;
  const count = (key: string) => voices?.status.find((row) => row.key === key)?.value ?? 0;
  const readyOk = ready.data?.status === 'ready';
  const latestImport = data?.latestImport ?? null;
  const pendingHandovers = handovers.data?.items.length ?? 0;
  const lastUpdated = Math.max(
    overview.dataUpdatedAt,
    month.dataUpdatedAt,
    accounts.dataUpdatedAt,
    ready.dataUpdatedAt,
  );
  const refetchAll = () =>
    void Promise.all([
      overview.refetch(),
      month.refetch(),
      accounts.refetch(),
      login.refetch(),
      handovers.refetch(),
      ready.refetch(),
      release.refetch(),
    ]);

  const attention: {
    key: string;
    icon: ReactNode;
    label: string;
    value: string;
    tone: 'danger' | 'warning' | 'success';
    to: string;
  }[] = [
    {
      key: 'handovers',
      icon: <GitPullRequestArrow size={16} />,
      label: 'Handover menunggu keputusan',
      value: `${pendingHandovers}${handovers.data?.nextCursor ? '+' : ''}`,
      tone: pendingHandovers ? 'danger' : 'success',
      to: '/voices?tab=handovers',
    },
    {
      key: 'overdue',
      icon: <AlarmClock size={16} />,
      label: 'Voice terlambat bulan ini',
      value: formatCount(voices?.overdue ?? 0),
      tone: voices?.overdue ? 'danger' : 'success',
      to: `/voices?dateFrom=${monthStart}`,
    },
    {
      key: 'critical',
      icon: <ShieldAlert size={16} />,
      label: 'Voice Critical belum selesai',
      value: formatCount(data?.voices.critical ?? 0),
      tone: data?.voices.critical ? 'danger' : 'success',
      to: '/voices?severity=CRITICAL',
    },
    {
      key: 'remediation',
      icon: <RouteIcon size={16} />,
      label: 'Remediation route terbuka',
      value: formatCount(data?.openRemediation ?? 0),
      tone: data?.openRemediation ? 'warning' : 'success',
      to: '/remediation',
    },
    {
      key: 'committee',
      icon: <ShieldCheck size={16} />,
      label: 'Akun Komite',
      value: data?.unionSlots ? 'Lengkap' : 'Belum ada',
      tone: data?.unionSlots ? 'success' : 'danger',
      to: '/union',
    },
    ...(data?.failedAudits
      ? [
          {
            key: 'audit',
            icon: <CircleAlert size={16} />,
            label: 'Audit gagal',
            value: formatCount(data.failedAudits),
            tone: 'warning' as const,
            to: '/audit',
          },
        ]
      : []),
  ];

  const divisions = [...(login.data?.groups ?? [])]
    .filter((group) => group.total > 0)
    .sort((a, b) => a.loggedIn / a.total - b.loggedIn / b.total)
    .slice(0, 6);

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Ringkasan"
        title="Overview"
        description="Voice bulan ini, hal yang perlu tindakan, dan adopsi akun."
        updatedLabel={lastUpdated ? new Date(lastUpdated).toLocaleString('id-ID') : undefined}
        onRefresh={refetchAll}
        refreshing={overview.isFetching || month.isFetching}
      />
      {overview.error ? (
        <Alert tone="danger" title="Gagal memuat overview">
          {String((overview.error as Error).message)}
        </Alert>
      ) : null}

      <section className="admin-card" aria-label="Voice bulan ini">
        <CardHead
          icon={<FileSearch size={18} aria-hidden="true" />}
          title="Voice bulan ini"
          meta={`Sejak ${new Date(`${monthStart}T00:00:00+07:00`).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}`}
          action={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void navigate(`/voices?dateFrom=${monthStart}`)}
            >
              Buka Voice Explorer <ArrowRight size={14} aria-hidden="true" />
            </Button>
          }
        />
        {voices ? (
          <div className="admin-kpi-strip">
            <AdminKpi
              icon={<Inbox size={18} />}
              value={formatCount(voices.total)}
              label="Voice masuk"
            />
            <AdminKpi
              icon={<CircleDot size={18} />}
              iconTone="warning"
              valueTone="warning"
              value={formatCount(count('OPEN') + count('RESPONDED'))}
              label="Terbuka / direspon"
            />
            <AdminKpi
              icon={<LoaderCircle size={18} />}
              iconTone="info"
              valueTone="info"
              value={formatCount(count('IN_PROGRESS'))}
              label="Diproses"
            />
            <AdminKpi
              icon={<CheckCircle2 size={18} />}
              iconTone="success"
              valueTone="success"
              value={formatCount(count('CLOSED'))}
              label="Selesai"
              sub={`${percent(count('CLOSED'), voices.total)}%`}
            />
            <AdminKpi
              icon={<AlarmClock size={18} />}
              iconTone="danger"
              valueTone={voices.overdue ? 'danger' : undefined}
              value={formatCount(voices.overdue)}
              label="Terlambat"
            />
            <AdminKpi
              icon={<Timer size={18} />}
              value={formatDuration(voices.averageResponseSeconds, true)}
              label="Rata-rata respon"
              sub={`Selesai ${formatDuration(voices.averageCompletionSeconds, true)}`}
            />
          </div>
        ) : (
          <AdminSkeleton lines={2} label="Memuat Voice bulan ini" />
        )}
      </section>

      <div className="admin-overview__split">
        <section className="admin-card" aria-label="Perlu tindakan">
          <CardHead icon={<Bell size={18} aria-hidden="true" />} title="Perlu tindakan" />
          {data ? (
            <ul className="admin-attention">
              {attention.map((item) => (
                <li key={item.key}>
                  <button type="button" onClick={() => void navigate(item.to)}>
                    <span
                      className="admin-attention__icon"
                      data-tone={item.tone}
                      aria-hidden="true"
                    >
                      {item.icon}
                    </span>
                    <span className="admin-attention__label">{item.label}</span>
                    <b className="admin-nums" data-tone={item.tone}>
                      {item.value}
                    </b>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <AdminSkeleton lines={4} label="Memuat tindakan" />
          )}
        </section>

        <section className="admin-card" aria-label="Akun workforce">
          <CardHead
            icon={<UsersRound size={18} aria-hidden="true" />}
            title="Akun workforce aktif"
            action={
              <Button variant="ghost" size="sm" onClick={() => void navigate('/accounts')}>
                Buka Akun <ArrowRight size={14} aria-hidden="true" />
              </Button>
            }
          />
          {accounts.data ? (
            <Stack gap="md">
              <div className="admin-kpi-strip">
                <AdminKpi
                  icon={<UserCheck size={18} />}
                  iconTone="success"
                  value={formatCount(accounts.data.total)}
                  label="Aktif"
                />
                <AdminKpi
                  icon={<LogIn size={18} />}
                  iconTone="success"
                  valueTone="success"
                  value={`${percent(accounts.data.loggedIn, accounts.data.total)}%`}
                  label="Sudah login"
                />
                <AdminKpi
                  icon={<CircleDashed size={18} />}
                  iconTone="warning"
                  valueTone="warning"
                  value={formatCount(accounts.data.total - accounts.data.loggedIn)}
                  label="Belum login"
                />
              </div>
              <AdminBars
                title="Login terendah per divisi"
                rows={divisions.map((group) => {
                  const share = group.loggedIn / group.total;
                  return {
                    key: group.name,
                    label: group.name,
                    value: group.total,
                    share,
                    display: `${percent(group.loggedIn, group.total)}%`,
                    tone: share >= 0.6 ? ('success' as const) : ('warning' as const),
                  };
                })}
                onPick={(name) => void navigate(`/accounts?division=${encodeURIComponent(name)}`)}
              />
            </Stack>
          ) : (
            <AdminSkeleton lines={4} label="Memuat akun" />
          )}
        </section>
      </div>

      <section className="admin-card admin-card--subtle" style={{ padding: 0 }}>
        <div className="admin-status-strip" aria-label="Status sistem">
          <span className="admin-inline-icon">
            {readyOk ? (
              <CheckCircle2 size={14} aria-hidden="true" color="var(--state-success)" />
            ) : (
              <CircleAlert size={14} aria-hidden="true" color="var(--state-danger)" />
            )}
            Sistem <b data-tone={readyOk ? 'success' : 'danger'}>{readyOk ? 'Siap' : 'Periksa'}</b>
          </span>
          <span className="admin-inline-icon">
            <CloudUpload size={14} aria-hidden="true" /> Impor organisasi terakhir{' '}
            <b>
              {latestImport
                ? `${IMPORT_STATUS_LABELS[latestImport.status] ?? latestImport.status} · ${new Date(
                    latestImport.createdAt,
                  ).toLocaleDateString('id-ID')}`
                : 'Belum ada'}
            </b>
          </span>
          <span>
            Release <b className="admin-nums">{release.data?.releaseSha.slice(0, 7) ?? '–'}</b>
          </span>
          <Button variant="ghost" size="sm" onClick={() => void navigate('/system')}>
            Status Sistem <ArrowRight size={14} aria-hidden="true" />
          </Button>
        </div>
      </section>
    </Stack>
  );
}
