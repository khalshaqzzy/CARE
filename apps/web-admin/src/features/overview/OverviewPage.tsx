import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Badge, Card, Loader, PageHeader, Stack, StatCard, Surface } from '@care/ui';
import {
  Activity,
  Archive,
  FileSearch,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createAdminApi } from '../../admin-api';

const SEGMENTS = 24;

const QUICK_ACTIONS = [
  { label: 'Import & Master Data', to: '/imports', icon: <Archive size={20} /> },
  { label: 'Remediation & Route', to: '/remediation', icon: <RouteIcon size={20} /> },
  { label: 'Union Accounts', to: '/union', icon: <ShieldCheck size={20} /> },
  { label: 'Accounts', to: '/accounts', icon: <UsersRound size={20} /> },
  { label: 'Voice Explorer', to: '/voices', icon: <FileSearch size={20} /> },
  { label: 'Audit', to: '/audit', icon: <Activity size={20} /> },
  { label: 'System Status', to: '/system', icon: <Settings size={20} /> },
];

export function OverviewPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const navigate = useNavigate();
  const overview = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'overview'),
    queryFn: api.overview,
    enabled: !!session,
    staleTime: 30_000,
  });
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, enabled: !!session });
  const ready = useQuery({ queryKey: ['ready'], queryFn: api.ready, enabled: !!session });
  const release = useQuery({ queryKey: ['release'], queryFn: api.release, enabled: !!session });
  const data = overview.data;
  const active = data?.accounts.active ?? 0;
  const legacy = data?.accounts.legacy ?? 0;
  const inactive = data?.accounts.inactive ?? 0;
  const totalAccounts = active + legacy + inactive;
  const activeShare = totalAccounts > 0 ? active / totalAccounts : 0;
  const pct = Math.round(activeShare * 100);
  const filled = Math.min(
    SEGMENTS,
    Math.max(Math.round(activeShare * SEGMENTS), active > 0 ? 1 : 0),
  );
  const healthOk = (health.data?.status ?? '') === 'ok';
  const readyOk = ready.data?.status === 'ready';
  const readyStatus = ready.data?.status ?? '-';
  const checks = ready.data?.checks;

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Operasional"
        title="Overview operasional"
        description="Ringkasan akun, import, remediation, dan kesehatan sistem."
      />
      {overview.isLoading ? <Loader label="Memuat overview" /> : null}
      {overview.error ? (
        <Alert tone="danger" title="Gagal memuat overview">
          {String((overview.error as Error).message)}
        </Alert>
      ) : null}
      {data ? (
        <Surface variant="raised" className="admin-pulse">
          <div className="admin-pulse__head">
            <span className="admin-pulse__icon" aria-hidden="true">
              <UsersRound size={16} />
            </span>
            <strong className="admin-pulse__title">Ringkasan akun</strong>
            <span className="admin-pulse__pill">{data.unionSlots}/3 Union slot</span>
          </div>
          <div className="admin-pulse__measure">
            <span className="admin-pulse__fraction">
              <strong>{active}</strong>
              <span>/{totalAccounts} aktif</span>
            </span>
            <span className="admin-pulse__pct">{pct}%</span>
          </div>
          <div
            className="admin-pulse__segments"
            role="progressbar"
            aria-label="Persentase akun aktif"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            {Array.from({ length: SEGMENTS }, (_, index) => (
              <i key={index} data-filled={index < filled} aria-hidden="true" />
            ))}
          </div>
          <div className="admin-pulse__legend">
            <div className="admin-pulse__cell">
              <span className="admin-pulse__num">{active}</span>
              <span className="admin-pulse__name">Aktif</span>
            </div>
            <div className="admin-pulse__cell">
              <span className="admin-pulse__num">{legacy}</span>
              <span className="admin-pulse__name">Legacy</span>
            </div>
            <div className="admin-pulse__cell">
              <span className="admin-pulse__num">{inactive}</span>
              <span className="admin-pulse__name">Nonaktif</span>
            </div>
            <div className="admin-pulse__cell">
              <span className="admin-pulse__num" data-tone="warning">
                {data.openRemediation}
              </span>
              <span className="admin-pulse__name">Remediation</span>
            </div>
          </div>
          <p className="admin-pulse__note">
            {data.openRemediation > 0
              ? `${data.openRemediation} isu remediation menunggu tindakan.`
              : 'Tidak ada isu remediation terbuka.'}
          </p>
        </Surface>
      ) : null}
      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1rem' }}
      >
        <StatCard
          label="Akun aktif"
          value={String(data?.accounts.active ?? 0)}
          description={`${data?.accounts.legacy ?? 0} legacy • ${data?.accounts.inactive ?? 0} inactive`}
          icon={<UsersRound size={18} />}
          tone="brand"
        />
        <StatCard
          label="Import terbaru"
          value={data?.latestImport?.status ?? '-'}
          description={
            data?.latestImport?.id ? `ID ${data.latestImport.id.slice(0, 8)}` : 'Belum ada import'
          }
          icon={<Archive size={18} />}
        />
        <StatCard
          label="Remediation terbuka"
          value={String(data?.openRemediation ?? 0)}
          description="Isu yang memerlukan tindakan"
          icon={<Activity size={18} />}
          tone={data?.openRemediation ? 'warning' : 'default'}
        />
        <StatCard
          label="Union slots"
          value={`${data?.unionSlots ?? 0}/3`}
          description={data?.unionSlots === 3 ? 'Lengkap' : 'Belum lengkap'}
          icon={<ShieldCheck size={18} />}
          tone={data?.unionSlots === 3 ? 'success' : 'warning'}
        />
      </div>
      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1rem' }}
      >
        <Card>
          <Stack gap="sm">
            <div className="admin-section__head">
              <strong>Kesehatan sistem</strong>
              <Badge tone={readyStatus === '-' ? 'neutral' : readyOk ? 'success' : 'warning'}>
                {readyStatus === '-' ? 'n/a' : readyStatus}
              </Badge>
            </div>
            <div className="admin-kv">
              <div className="admin-kv__row">
                <span className="admin-kv__label">Health</span>
                <span className="admin-kv__value" data-tone={healthOk ? 'success' : undefined}>
                  {health.data?.status ?? '-'}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Ready</span>
                <span className="admin-kv__value" data-tone={readyOk ? 'success' : undefined}>
                  {readyStatus}
                </span>
              </div>
              <div className="admin-kv__row">
                <span className="admin-kv__label">Release</span>
                <span className="admin-kv__value">
                  {release.data?.releaseSha?.slice(0, 7) ?? '-'}
                </span>
              </div>
            </div>
            {checks ? (
              <div className="admin-kv">
                {Object.entries(checks).map(([name, value]) => (
                  <div className="admin-kv__row" key={name}>
                    <span className="admin-kv__label">{name}</span>
                    <Badge tone={value === 'ok' ? 'success' : 'warning'}>{value}</Badge>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="admin-meta--xs">
              Validasi terakhir: {new Date().toLocaleString('id-ID')}
            </p>
          </Stack>
        </Card>
        <Card>
          <Stack gap="sm">
            <strong>Route & dependency</strong>
            <Alert tone="info" title="Admin selalu network-only">
              Tidak ada service worker, offline cache, atau persistent protected data.
            </Alert>
            <p className="admin-meta">
              Validasi konfigurasi dan release identity tersedia pada halaman System Status.
            </p>
          </Stack>
        </Card>
      </div>
      <section className="admin-quick" aria-label="Aksi cepat">
        <div className="admin-section__head">
          <h2 className="admin-section__title">Aksi cepat</h2>
        </div>
        <div className="admin-quick__grid">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="admin-quick__tile"
              onClick={() => void navigate(action.to)}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </Stack>
  );
}
