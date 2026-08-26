import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Button, Card, Loader, PageHeader, Stack } from '@care/ui';
import { useEffect, useState } from 'react';

function useStatus(
  path: string,
  key: string[],
  enabled: boolean,
  refetchInterval: number | false = false,
) {
  const { session } = useAuth();
  return useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', ...key),
    queryFn: async () => {
      const res = await fetch(path, { credentials: 'include' });
      if (!res.ok) throw new Error(`Gagal memuat ${path}`);
      return (await res.json()) as unknown;
    },
    enabled: enabled && !!session,
    refetchInterval,
    staleTime: 10_000,
  });
}

export function SystemStatusPage() {
  const { session } = useAuth();
  const [now, setNow] = useState(() => new Date());
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const shouldPoll = !!session && visible;
  const health = useStatus('/health', ['system', 'health'], !!session, shouldPoll ? 30_000 : false);
  const ready = useStatus('/ready', ['system', 'ready'], !!session, shouldPoll ? 30_000 : false);
  const release = useStatus('/release.json', ['system', 'release'], !!session, false);

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Operability"
        title="System Status"
        description="Kesehatan API, database, storage, dan konfigurasi."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void health.refetch();
              void ready.refetch();
              void release.refetch();
              setNow(new Date());
            }}
          >
            Muat ulang
          </Button>
        }
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        Terakhir diperbarui: {now.toLocaleString('id-ID')}
      </p>
      {!session ? (
        <Alert tone="warning" title="Tidak ada sesi">
          Masuk sebagai Admin untuk melihat status.
        </Alert>
      ) : null}
      <div
        className="care-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1rem' }}
      >
        <Card>
          <Stack gap="sm">
            <strong>/health</strong>
            {health.isLoading ? (
              <Loader label="Memuat health" />
            ) : health.error ? (
              <Alert tone="danger" title="Gagal">
                {String((health.error as Error).message)}
              </Alert>
            ) : (
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(health.data, null, 2)}
              </pre>
            )}
          </Stack>
        </Card>
        <Card>
          <Stack gap="sm">
            <strong>/ready</strong>
            {ready.isLoading ? (
              <Loader label="Memuat ready" />
            ) : ready.error ? (
              <Alert tone="danger" title="Gagal">
                {String((ready.error as Error).message)}
              </Alert>
            ) : (
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(ready.data, null, 2)}
              </pre>
            )}
          </Stack>
        </Card>
        <Card>
          <Stack gap="sm">
            <strong>/release.json</strong>
            {release.isLoading ? (
              <Loader label="Memuat release" />
            ) : release.error ? (
              <Alert tone="danger" title="Gagal">
                {String((release.error as Error).message)}
              </Alert>
            ) : (
              <pre style={{ fontSize: '0.75rem', overflow: 'auto' }}>
                {JSON.stringify(release.data, null, 2)}
              </pre>
            )}
          </Stack>
        </Card>
      </div>
      <Alert tone="info" title="Polling 30 detik">
        Polling hanya berjalan saat tab terlihat; data tidak disimpan ke Cache Storage atau
        IndexedDB.
      </Alert>
    </Stack>
  );
}
