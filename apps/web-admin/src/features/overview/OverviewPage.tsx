import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Badge, Button, Stack } from '@care/ui';
import {
  Activity,
  Archive,
  ArrowRight,
  BellRing,
  CheckCircle2,
  CircleAlert,
  CircleGauge,
  CloudUpload,
  FileSearch,
  Info,
  Route as RouteIcon,
  Settings,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminKpi } from '../../components/AdminKpi';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSegmentBar } from '../../components/AdminSegmentBar';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi } from '../../admin-api';

const QUICK_ACTIONS = [
  { label: 'Import & Master Data', to: '/imports', icon: <Archive size={20} /> },
  { label: 'Remediation & Route', to: '/remediation', icon: <RouteIcon size={20} /> },
  { label: 'Union Accounts', to: '/union', icon: <ShieldCheck size={20} /> },
  { label: 'Accounts', to: '/accounts', icon: <UsersRound size={20} /> },
  { label: 'Voice Explorer', to: '/voices', icon: <FileSearch size={20} /> },
  { label: 'Audit', to: '/audit', icon: <Activity size={20} /> },
  { label: 'System Status', to: '/system', icon: <Settings size={20} /> },
];

type PriorityAction = {
  title: string;
  description: string;
  severity: 'Tinggi' | 'Sedang' | 'Rendah';
  owner: string;
  to: string;
};

function formatDateTime(value: string | number | null | undefined) {
  if (value == null) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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
  const remediation = data?.openRemediation ?? 0;
  const unionSlots = data?.unionSlots ?? 0;
  const latestImport = data?.latestImport ?? null;
  const importSummary = latestImport?.summary ?? null;
  const voices = data?.voices ?? null;
  const failedAudits = data?.failedAudits ?? 0;
  const readyOk = ready.data?.status === 'ready';
  const checks = ready.data?.checks;
  const lastUpdated = Math.max(
    overview.dataUpdatedAt,
    health.dataUpdatedAt,
    ready.dataUpdatedAt,
    release.dataUpdatedAt,
  );
  const refreshing = overview.isFetching || health.isFetching || ready.isFetching;
  const refetchAll = () => {
    void Promise.all([overview.refetch(), health.refetch(), ready.refetch(), release.refetch()]);
  };

  const share = (part: number) =>
    totalAccounts > 0 ? `${((part / totalAccounts) * 100).toFixed(1).replace('.', ',')}%` : '—';

  const priorities: PriorityAction[] = [];
  if (remediation > 0)
    priorities.push({
      title: `${remediation} isu remediation menunggu tindakan`,
      description: 'Selesaikan route gap agar submission baru tidak terblokir.',
      severity: 'Tinggi',
      owner: 'CARE Admin',
      to: '/remediation',
    });
  if (unionSlots < 3)
    priorities.push({
      title: 'Slot Union belum lengkap',
      description: 'Private Voice membutuhkan satu Head dan dua Officer aktif.',
      severity: 'Tinggi',
      owner: 'CARE Admin',
      to: '/union',
    });
  if (!latestImport)
    priorities.push({
      title: 'Belum ada impor master data',
      description: 'Unggah snapshot organisasi authoritative pertama.',
      severity: 'Sedang',
      owner: 'Data Operator',
      to: '/imports',
    });
  else if (latestImport.status !== 'CONFIRMED')
    priorities.push({
      title: `Impor terakhir berstatus ${latestImport.status}`,
      description: 'Tinjau pratinjau dan konfirmasi batch terbaru.',
      severity: 'Sedang',
      owner: 'Data Operator',
      to: '/imports',
    });
  if (!readyOk)
    priorities.push({
      title: 'Readiness sistem belum OK',
      description: 'Periksa database, migrasi, outbox, dan storage pada System Status.',
      severity: 'Tinggi',
      owner: 'CARE Admin',
      to: '/system',
    });
  if ((voices?.critical ?? 0) > 0)
    priorities.push({
      title: `${voices?.critical} Voice kritis belum selesai`,
      description: 'Tinjau Voice severity Critical yang belum Closed pada Voice Explorer.',
      severity: 'Tinggi',
      owner: 'CARE Admin',
      to: '/voices',
    });
  if (failedAudits > 0)
    priorities.push({
      title: `${failedAudits} audit gagal tercatat`,
      description: 'Tinjau kejadian Result FAILED pada halaman Audit.',
      severity: 'Sedang',
      owner: 'Security Admin',
      to: '/audit',
    });
  priorities.push({
    title: 'Tinjau jejak audit terbaru',
    description: 'Pastikan akses Private dan mutasi sensitif tercatat.',
    severity: 'Rendah',
    owner: 'Security Admin',
    to: '/audit',
  });
  const visiblePriorities = priorities.slice(0, 4);

  const severityTone = (severity: PriorityAction['severity']) =>
    severity === 'Tinggi' ? 'danger' : severity === 'Sedang' ? 'warning' : 'info';

  const checkNodes = checks
    ? Object.entries(checks).map(([name, value]) => ({
        name: name === 'database' ? 'Database' : name,
        ok: value === 'ok',
        detail: value,
      }))
    : [];

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Operasional"
        title="Overview Operasional"
        description="Ringkasan akun, impor, remediation, dan kesehatan sistem."
        updatedLabel={lastUpdated ? formatDateTime(lastUpdated) : undefined}
        onRefresh={refetchAll}
        refreshing={refreshing}
      />
      {overview.isLoading ? (
        <section className="admin-card" aria-label="Memuat overview">
          <AdminSkeleton lines={4} label="Memuat overview" />
        </section>
      ) : null}
      {overview.error ? (
        <Alert tone="danger" title="Gagal memuat overview">
          {String((overview.error as Error).message)}
        </Alert>
      ) : null}
      {data ? (
        <section className="admin-card admin-card--hero" aria-label="Ringkasan operasional">
          <h2 className="admin-card__title">
            <UsersRound size={18} aria-hidden="true" /> Ringkasan operasional
          </h2>
          <div className="admin-kpi-strip">
            <AdminKpi
              icon={<UsersRound size={20} />}
              iconTone="brand"
              value={
                <>
                  {active.toLocaleString('id-ID')}{' '}
                  <span className="admin-kpi__sub">/ {totalAccounts.toLocaleString('id-ID')}</span>
                </>
              }
              label="akun aktif"
            />
            <AdminKpi
              icon={<ShieldCheck size={20} />}
              iconTone="danger"
              value={remediation}
              valueTone={remediation > 0 ? 'danger' : undefined}
              label="remediation"
            />
            <AdminKpi
              icon={<Archive size={20} />}
              iconTone="info"
              value={`${unionSlots} / 3`}
              label="Union slots"
            />
            <AdminKpi
              icon={<CloudUpload size={20} />}
              iconTone="brand"
              value={latestImport?.status ?? '-'}
              label="Latest import"
              sub={latestImport ? undefined : 'Belum ada impor'}
            />
            <AdminKpi
              icon={<CheckCircle2 size={20} />}
              iconTone="success"
              value={readyOk ? 'Ready' : (ready.data?.status ?? '-')}
              valueTone={readyOk ? 'success' : 'warning'}
              label="Sistem siap"
            />
          </div>
          <div style={{ marginTop: '1rem' }}>
            <AdminSegmentBar percent={pct} label="Persentase akun aktif" />
          </div>
        </section>
      ) : null}

      <section className="admin-card admin-card--subtle" aria-label="Kesehatan sistem">
        <div className="admin-kpi-strip">
          <AdminKpi
            icon={<CheckCircle2 size={20} />}
            iconTone="success"
            value={readyOk ? 'Ready' : (ready.data?.status ?? '-')}
            valueTone={readyOk ? 'success' : 'warning'}
            label="Kesehatan sistem"
            sub="Semua layanan beroperasi normal"
          />
          <AdminKpi
            icon={<ShieldCheck size={20} />}
            iconTone="info"
            value={release.data?.releaseSha ? 'OK' : '-'}
            label="Validasi konfigurasi"
            sub="Identitas tersedia di halaman System Status"
          />
          <AdminKpi
            icon={<Activity size={20} />}
            iconTone="brand"
            value={
              lastUpdated
                ? new Date(lastUpdated).toLocaleString('id-ID', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '-'
            }
            label="Terakhir validasi"
            sub="Otomatis setiap 15 menit"
          />
        </div>
      </section>

      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(22rem, 1fr))', gap: '1rem' }}
      >
        <section className="admin-card admin-card--lift" aria-label="Aksi prioritas">
          <h2 className="admin-card__title">
            <CircleGauge size={18} aria-hidden="true" /> Aksi prioritas
          </h2>
          <ul className="admin-rows">
            {visiblePriorities.map((item) => (
              <li key={item.title}>
                <span className="admin-rowmark" data-tone={severityTone(item.severity)}>
                  {item.severity === 'Tinggi' ? (
                    <CircleAlert size={16} aria-hidden="true" />
                  ) : item.severity === 'Sedang' ? (
                    <TriangleAlert size={16} aria-hidden="true" />
                  ) : (
                    <Info size={16} aria-hidden="true" />
                  )}
                </span>
                <span className="admin-rowbody">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
                <span className="admin-rowside">
                  <span className="admin-pill" data-tone={severityTone(item.severity)}>
                    {item.severity}
                  </span>
                  <small>{item.owner}</small>
                </span>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={() => void navigate('/remediation')}>
            Lihat semua aksi <ArrowRight size={14} />
          </Button>
        </section>

        <section className="admin-card admin-card--lift" aria-label="Impor terbaru">
          <div className="admin-section__head">
            <h2 className="admin-card__title" style={{ margin: 0 }}>
              <CloudUpload size={18} aria-hidden="true" /> Impor terbaru
            </h2>
            <Button variant="ghost" size="sm" onClick={() => void navigate('/imports')}>
              Lihat riwayat impor
            </Button>
          </div>
          {latestImport ? (
            <Stack gap="sm">
              <div className="admin-section__head">
                <strong style={{ color: 'var(--raw-brand-700)', fontSize: '1.25rem' }}>
                  {latestImport.status}
                </strong>
                <Badge tone={latestImport.status === 'CONFIRMED' ? 'success' : 'warning'}>
                  {latestImport.status === 'CONFIRMED' ? 'Berhasil' : latestImport.status}
                </Badge>
              </div>
              <p className="admin-meta--xs">
                {formatDateTime(latestImport.createdAt)} • ID {latestImport.id.slice(0, 8)}
              </p>
              <div
                className="admin-table-scroll"
                tabIndex={0}
                role="region"
                aria-label="Tabel ringkasan impor terbaru"
              >
                <table className="care-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th scope="col">Kategori</th>
                      <th scope="col">Baru</th>
                      <th scope="col">Legacy</th>
                      <th scope="col">Nonaktif</th>
                      <th scope="col">Remediation</th>
                      <th scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Akun</td>
                      <td>{(importSummary?.create ?? active).toLocaleString('id-ID')}</td>
                      <td>{(importSummary?.update ?? legacy).toLocaleString('id-ID')}</td>
                      <td>{(importSummary?.deactivate ?? inactive).toLocaleString('id-ID')}</td>
                      <td>{remediation.toLocaleString('id-ID')}</td>
                      <td>
                        <strong>
                          {(importSummary?.rowCount ?? totalAccounts).toLocaleString('id-ID')}
                        </strong>
                      </td>
                    </tr>
                    <tr>
                      <td>Persentase</td>
                      <td>{share(active)}</td>
                      <td>{share(legacy)}</td>
                      <td>{share(inactive)}</td>
                      <td>{totalAccounts > 0 ? share(remediation) : '—'}</td>
                      <td>
                        <strong>100%</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Stack>
          ) : (
            <Stack gap="sm">
              <Alert tone="info" title="Belum ada impor">
                Unggah snapshot organisasi authoritative pertama pada halaman Import & Master Data.
              </Alert>
              <Button size="sm" onClick={() => void navigate('/imports')}>
                Buka Import & Master Data
              </Button>
            </Stack>
          )}
        </section>
      </div>

      <section className="admin-card admin-card--subtle" aria-label="Rute dan dependensi kritis">
        <div className="admin-section__head">
          <h2 className="admin-card__title" style={{ margin: 0 }}>
            <RouteIcon size={18} aria-hidden="true" /> Rute &amp; dependensi kritis
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void navigate('/system')}>
            Lihat System Status
          </Button>
        </div>
        {ready.isLoading ? (
          <AdminSkeleton lines={2} label="Memuat dependensi" />
        ) : checkNodes.length ? (
          <ul className="admin-nodes">
            {checkNodes.map((node) => (
              <li key={node.name}>
                <span
                  className="admin-rowmark"
                  data-tone={node.ok ? 'success' : 'warning'}
                  aria-hidden="true"
                >
                  {node.ok ? <CheckCircle2 size={14} /> : <TriangleAlert size={14} />}
                </span>
                <span>
                  <strong>{node.name}</strong>
                  <small>{node.ok ? 'OK' : node.detail}</small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Alert tone="warning" title="Status dependensi tidak tersedia">
            {ready.error
              ? String((ready.error as Error).message)
              : 'Muat ulang untuk memeriksa database, migrasi, outbox, dan storage.'}
          </Alert>
        )}
        <p className="admin-meta--xs" style={{ marginTop: '0.75rem' }}>
          <BellRing size={12} aria-hidden="true" /> Admin selalu network-only: tidak ada service
          worker, offline cache, atau persistent protected data.
        </p>
      </section>

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
              <span className="admin-quick__tile__icon" aria-hidden="true">
                {action.icon}
              </span>
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>
    </Stack>
  );
}
