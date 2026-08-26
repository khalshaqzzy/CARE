import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Card, Loader, PageHeader, Stack, StatCard } from '@care/ui';
import { Activity, Archive, ShieldCheck, UsersRound } from 'lucide-react';

function useFetch<T>(path: string, key: string[]) {
  const { session } = useAuth();
  return useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', ...key),
    queryFn: async () => {
      const res = await fetch(path, { credentials: 'include' });
      if (!res.ok) throw new Error(`Gagal memuat ${path}`);
      return (await res.json()) as T;
    },
    enabled: !!session,
    staleTime: 30_000,
  });
}

export function OverviewPage() {
  const accounts = useFetch<{ items: Array<{ status: string }> } | Array<unknown>>(
    '/api/v1/admin/accounts?limit=100',
    ['overview', 'accounts'],
  );
  const imports = useFetch<{ items: Array<{ status: string }> } | Array<unknown>>(
    '/api/v1/admin/organization-imports?limit=1',
    ['overview', 'imports'],
  );
  const remediation = useFetch<{ items: unknown[] } | unknown[]>(
    '/api/v1/admin/remediation-issues?limit=1',
    ['overview', 'remediation'],
  );
  const union = useFetch<unknown[]>('/api/v1/admin/union-accounts', ['overview', 'union']);
  const health = useFetch<{ status: string }>('/health', ['overview', 'health']);
  const ready = useFetch<Record<string, unknown>>('/ready', ['overview', 'ready']);
  const release = useFetch<{ releaseSha: string }>('/release.json', ['overview', 'release']);

  const accountItems = Array.isArray(accounts.data)
    ? accounts.data
    : ((accounts.data as { items?: unknown[] })?.items ?? []);
  const active = accountItems.filter(
    (a: unknown) => (a as { status: string }).status === 'ACTIVE',
  ).length;
  const legacy = accountItems.filter(
    (a: unknown) => (a as { status: string }).status === 'LEGACY_HANDLER',
  ).length;
  const inactive = accountItems.filter(
    (a: unknown) => (a as { status: string }).status === 'INACTIVE',
  ).length;

  const importItems = Array.isArray(imports.data)
    ? imports.data
    : ((imports.data as { items?: unknown[] })?.items ?? []);
  const latestImport = importItems[0] as { status?: string; id?: string } | undefined;

  const remediationItems = Array.isArray(remediation.data)
    ? remediation.data
    : ((remediation.data as { items?: unknown[] })?.items ?? []);
  const unionList = Array.isArray(union.data) ? union.data : [];
  const loading =
    accounts.isLoading || imports.isLoading || remediation.isLoading || union.isLoading;

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Operasional"
        title="Overview operasional"
        description="Ringkasan akun, import, remediation, dan kesehatan sistem."
      />
      {loading ? <Loader label="Memuat overview" /> : null}
      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: '1rem' }}
      >
        <StatCard
          label="Akun aktif"
          value={String(active)}
          description={`${legacy} legacy • ${inactive} inactive`}
          icon={<UsersRound size={18} />}
          tone="brand"
        />
        <StatCard
          label="Import terbaru"
          value={latestImport?.status ?? '-'}
          description={
            latestImport?.id ? `ID ${String(latestImport.id).slice(0, 8)}` : 'Belum ada import'
          }
          icon={<Archive size={18} />}
        />
        <StatCard
          label="Remediation terbuka"
          value={String(remediationItems.length)}
          description="Isu yang memerlukan tindakan"
          icon={<Activity size={18} />}
          tone={remediationItems.length ? 'warning' : 'default'}
        />
        <StatCard
          label="Union slots"
          value={`${unionList.length}/3`}
          description={unionList.length === 3 ? 'Lengkap' : 'Belum lengkap'}
          icon={<ShieldCheck size={18} />}
          tone={unionList.length === 3 ? 'success' : 'warning'}
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
