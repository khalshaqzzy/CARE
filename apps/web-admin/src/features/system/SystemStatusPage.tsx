import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Button, Card, Loader, PageHeader, Stack } from '@care/ui';
import { useEffect, useMemo, useState } from 'react';
import { createAdminApi } from '../../admin-api';

export function SystemStatusPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const shouldPoll = !!session && visible;
  const health = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'system', 'health'),
    queryFn: api.health,
    enabled: !!session,
    refetchInterval: shouldPoll ? 30_000 : false,
  });
  const ready = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'system', 'ready'),
    queryFn: api.ready,
    enabled: !!session,
    refetchInterval: shouldPoll ? 30_000 : false,
  });
  const release = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'system', 'release'),
    queryFn: api.release,
    enabled: !!session,
  });
  const lastUpdated = Math.max(health.dataUpdatedAt, ready.dataUpdatedAt, release.dataUpdatedAt);

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
            }}
          >
            Muat ulang
          </Button>
        }
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        Terakhir diperbarui:{' '}
        {lastUpdated ? new Date(lastUpdated).toLocaleString('id-ID') : 'belum tersedia'}
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
              <dl>
                <dt>Status API</dt>
                <dd>{health.data?.status ?? '-'}</dd>
              </dl>
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
              <dl>
                <dt>Status readiness</dt>
                <dd>{ready.data?.status ?? '-'}</dd>
                <dt>Database</dt>
                <dd>{ready.data?.checks.database ?? '-'}</dd>
                <dt>Storage</dt>
                <dd>{ready.data?.checks.storage ?? '-'}</dd>
                <dt>Migration</dt>
                <dd>{ready.data?.checks.migrations ?? '-'}</dd>
              </dl>
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
              <dl>
                <dt>Release SHA</dt>
                <dd>{release.data?.releaseSha ?? '-'}</dd>
              </dl>
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
