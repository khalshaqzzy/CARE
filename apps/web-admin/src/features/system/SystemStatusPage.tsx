import { useQuery } from '@tanstack/react-query';
import { useAuth, careQueryKey } from '@care/frontend-core';
import { Alert, Badge, Button, Card, Loader, PageHeader, Stack } from '@care/ui';
import { Database, HardDrive, Rocket, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createAdminApi } from '../../admin-api';

function statusTone(value: string | undefined): 'success' | 'warning' {
  return value === 'ok' || value === 'ready' ? 'success' : 'warning';
}

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
      <p className="admin-meta">
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
            <div className="admin-section__head">
              <strong>/health</strong>
              {health.data ? (
                <Badge tone={statusTone(health.data.status)}>{health.data.status}</Badge>
              ) : null}
            </div>
            {health.isLoading ? (
              <Loader label="Memuat health" />
            ) : health.error ? (
              <Alert tone="danger" title="Gagal">
                {String((health.error as Error).message)}
              </Alert>
            ) : (
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <ShieldCheck size={14} aria-hidden="true" />
                    Status API
                  </span>
                  <span
                    className="admin-kv__value"
                    data-tone={health.data?.status === 'ok' ? 'success' : undefined}
                  >
                    {health.data?.status ?? '-'}
                  </span>
                </div>
              </div>
            )}
          </Stack>
        </Card>
        <Card>
          <Stack gap="sm">
            <div className="admin-section__head">
              <strong>/ready</strong>
              {ready.data ? (
                <Badge tone={statusTone(ready.data.status)}>{ready.data.status}</Badge>
              ) : null}
            </div>
            {ready.isLoading ? (
              <Loader label="Memuat ready" />
            ) : ready.error ? (
              <Alert tone="danger" title="Gagal">
                {String((ready.error as Error).message)}
              </Alert>
            ) : (
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">Status readiness</span>
                  <Badge tone={statusTone(ready.data?.status)}>{ready.data?.status ?? '-'}</Badge>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <Database size={14} aria-hidden="true" />
                    Database
                  </span>
                  <Badge tone={statusTone(ready.data?.checks.database)}>
                    {ready.data?.checks.database ?? '-'}
                  </Badge>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <HardDrive size={14} aria-hidden="true" />
                    Storage
                  </span>
                  <Badge tone={statusTone(ready.data?.checks.storage)}>
                    {ready.data?.checks.storage ?? '-'}
                  </Badge>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">Migration</span>
                  <Badge tone={statusTone(ready.data?.checks.migrations)}>
                    {ready.data?.checks.migrations ?? '-'}
                  </Badge>
                </div>
              </div>
            )}
          </Stack>
        </Card>
        <Card>
          <Stack gap="sm">
            <div className="admin-section__head">
              <strong>/release.json</strong>
            </div>
            {release.isLoading ? (
              <Loader label="Memuat release" />
            ) : release.error ? (
              <Alert tone="danger" title="Gagal">
                {String((release.error as Error).message)}
              </Alert>
            ) : (
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <Rocket size={14} aria-hidden="true" />
                    Release SHA
                  </span>
                  <span className="admin-kv__value">{release.data?.releaseSha ?? '-'}</span>
                </div>
              </div>
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
