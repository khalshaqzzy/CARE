import { useQuery } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert } from '@care/ui';
import { CircleDashed, LogIn, UserCheck, UserMinus, UserX, Users } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { createAdminApi } from '../../admin-api';
import { AdminBars, AdminSummary, formatCount } from '../../components/AdminSummary';
import { AdminSkeleton } from '../../components/AdminSkeleton';

export type AccountSummaryFilters = {
  search?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  responderLevel?: string | undefined;
  division?: string | undefined;
  department?: string | undefined;
  section?: string | undefined;
  loggedIn?: 'true' | 'false' | undefined;
};

const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

function Kpi({
  icon,
  tone,
  value,
  label,
  sub,
  pressed,
  onClick,
}: {
  icon: ReactNode;
  tone?: 'danger' | 'warning' | 'success' | 'info' | undefined;
  value: number;
  label: string;
  sub?: string | undefined;
  pressed?: boolean | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="admin-kpi admin-kpi--button"
      aria-pressed={pressed}
      onClick={onClick}
    >
      <span className="admin-kpi__icon" data-tone={tone ?? 'brand'} aria-hidden="true">
        {icon}
      </span>
      <span className="admin-kpi__body">
        <strong className="admin-kpi__value" {...(tone ? { 'data-tone': tone } : {})}>
          {formatCount(value)}
        </strong>
        <span className="admin-kpi__label">{label}</span>
        {sub ? <span className="admin-kpi__sub">{sub}</span> : null}
      </span>
    </button>
  );
}

/**
 * Ringkasan Akun: every account the list's filters select, by status, kind
 * and role, with login adoption per role and per unit one level below the
 * chosen division / department. Picking a number filters the list to it.
 */
export function AccountsSummary({
  filters,
  onFilter,
  onPickLogin,
  onPickGroup,
}: {
  filters: AccountSummaryFilters;
  onFilter: (values: Record<string, string>) => void;
  onPickLogin: (value: '' | 'true' | 'false') => void;
  onPickGroup: (name: string) => void;
}) {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const summary = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'accounts', 'summary', filters),
    queryFn: () => api.accountSummary(filters as never),
    enabled: !!session,
    placeholderData: (previous) => previous,
  });
  const login = useQuery({
    queryKey: careQueryKey(
      session?.sessionId ?? 'anon',
      'accounts',
      'login',
      filters.division ?? '',
      filters.department ?? '',
    ),
    queryFn: () =>
      api.loginSummary({
        ...(filters.division ? { division: filters.division } : {}),
        ...(filters.department ? { department: filters.department } : {}),
      }),
    enabled: !!session,
  });
  const data = summary.data;
  const statusCount = (key: string) => data?.status.find((row) => row.key === key)?.total ?? 0;
  const status = filters.status ?? '';
  const pickStatus = (key: string) => onFilter({ status: status === key ? '' : key });
  const level = login.data?.department ? 'seksi' : login.data?.division ? 'departemen' : 'divisi';

  return (
    <AdminSummary
      id="accounts"
      title="Ringkasan Akun"
      meta={`Mengikuti filter · ${filters.section ?? filters.department ?? filters.division ?? 'semua divisi'}`}
      chips={
        data
          ? [
              { value: formatCount(data.total), label: 'akun' },
              { value: formatCount(statusCount('ACTIVE')), label: 'aktif', tone: 'success' },
              {
                value: formatCount(statusCount('LEGACY_HANDLER')),
                label: 'legacy',
                tone: 'warning',
              },
              { value: formatCount(statusCount('INACTIVE')), label: 'nonaktif', tone: 'danger' },
              {
                value: `${percent(data.loggedIn, data.total)}%`,
                label: 'sudah login',
                tone: 'success',
              },
              {
                value: formatCount(data.total - data.loggedIn),
                label: 'belum login',
                tone: 'warning',
              },
            ]
          : []
      }
    >
      {summary.error ? (
        <Alert tone="danger" title="Ringkasan gagal dimuat">
          {String((summary.error as Error).message)}
        </Alert>
      ) : !data ? (
        <AdminSkeleton lines={3} label="Memuat ringkasan" />
      ) : (
        <>
          <div className="admin-kpi-strip">
            <Kpi
              icon={<Users size={18} />}
              value={data.total}
              label="Total akun"
              pressed={!status && !filters.loggedIn}
              onClick={() => onFilter({ status: '', loggedIn: '' })}
            />
            <Kpi
              icon={<UserCheck size={18} />}
              tone="success"
              value={statusCount('ACTIVE')}
              label="Aktif"
              pressed={status === 'ACTIVE'}
              onClick={() => pickStatus('ACTIVE')}
            />
            <Kpi
              icon={<UserMinus size={18} />}
              tone="warning"
              value={statusCount('LEGACY_HANDLER')}
              label="Legacy handler"
              pressed={status === 'LEGACY_HANDLER'}
              onClick={() => pickStatus('LEGACY_HANDLER')}
            />
            <Kpi
              icon={<UserX size={18} />}
              tone="danger"
              value={statusCount('INACTIVE')}
              label="Nonaktif"
              pressed={status === 'INACTIVE'}
              onClick={() => pickStatus('INACTIVE')}
            />
            <Kpi
              icon={<LogIn size={18} />}
              tone="success"
              value={data.loggedIn}
              label="Sudah login"
              sub={`${percent(data.loggedIn, data.total)}% dari akun`}
              pressed={filters.loggedIn === 'true'}
              onClick={() => onPickLogin(filters.loggedIn === 'true' ? '' : 'true')}
            />
            <Kpi
              icon={<CircleDashed size={18} />}
              tone="warning"
              value={data.total - data.loggedIn}
              label="Belum login"
              pressed={filters.loggedIn === 'false'}
              onClick={() => onPickLogin(filters.loggedIn === 'false' ? '' : 'false')}
            />
          </div>
          <div className="admin-summary__grid">
            <AdminBars
              title="Peran · sudah login"
              rows={data.role.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.total,
                share: row.total ? row.loggedIn / row.total : 0,
                display: `${formatCount(row.loggedIn)}/${formatCount(row.total)}`,
                tone: 'success',
              }))}
              active={filters.responderLevel}
              onPick={(key) =>
                key === 'MEMBER'
                  ? undefined
                  : onFilter({ responderLevel: filters.responderLevel === key ? '' : key })
              }
            />
            <AdminBars
              title="Jenis akun"
              rows={data.kind.map((row) => ({
                key: row.key,
                label: row.label,
                value: row.total,
              }))}
              active={filters.kind}
              onPick={(key) => onFilter({ kind: filters.kind === key ? '' : key })}
            />
            <AdminBars
              title={`Login per ${level}`}
              rows={(login.data?.groups ?? []).map((group) => {
                const share = group.total ? group.loggedIn / group.total : 0;
                return {
                  key: group.name,
                  label: group.name,
                  value: group.total,
                  share,
                  display: `${percent(group.loggedIn, group.total)}%`,
                  tone: share >= 0.6 ? ('success' as const) : ('warning' as const),
                };
              })}
              onPick={onPickGroup}
            />
          </div>
        </>
      )}
    </AdminSummary>
  );
}
