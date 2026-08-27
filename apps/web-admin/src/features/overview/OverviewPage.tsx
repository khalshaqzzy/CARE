import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Card, Loader, PageHeader, Stack, StatCard } from '@care/ui';
import { Activity, Archive, ShieldCheck, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
import { createAdminApi } from '../../admin-api';

export function OverviewPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
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
            <strong>Kesehatan sistem</strong>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>Health: {health.data?.status ?? '-'}</span>
              <span>Ready: {(ready.data as { status?: string })?.status ?? '-'}</span>
              <span>Release: {release.data?.releaseSha?.slice(0, 7) ?? '-'}</span>
            </div>
            {(ready.data as { checks?: unknown }) ? (
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(ready.data, null, 2)}
              </pre>
            ) : null}
          </Stack>
        </Card>
        <Card>
          <Stack gap="sm">
            <strong>Route & dependency</strong>
            <Alert tone="info" title="Admin selalu network-only">
              Tidak ada service worker, offline cache, atau persistent protected data.
            </Alert>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Validasi terakhir: {new Date().toLocaleString('id-ID')}
            </p>
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}
