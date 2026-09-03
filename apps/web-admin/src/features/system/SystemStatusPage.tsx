import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Badge, Button, Dialog, Input, PasswordInput, Select, Stack } from '@care/ui';
import { BrainCircuit, Database, HardDrive, Rocket, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createAdminApi } from '../../admin-api';
import type { AiConfiguration } from '../../admin-api';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';

function statusTone(value: string | undefined): 'success' | 'warning' {
  return value === 'ok' || value === 'ready' ? 'success' : 'warning';
}

const reasoningOptions = [
  { value: '', label: 'Provider default' },
  { value: 'none', label: 'None' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' },
];

export function SystemStatusPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const queryClient = useQueryClient();
  const sessionId = session?.sessionId ?? 'anon';
  const aiKey = careQueryKey(sessionId, 'system', 'ai-configuration');
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  );
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState<AiConfiguration['reasoningEffort']>('');
  const [confidence, setConfidence] = useState('0.75');
  const [confirm, setConfirm] = useState<'save' | 'reset' | null>(null);
  const [operationKey, setOperationKey] = useState('');
  const testButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const shouldPoll = !!session && visible;
  const health = useQuery({
    queryKey: careQueryKey(sessionId, 'system', 'health'),
    queryFn: api.health,
    enabled: !!session,
    refetchInterval: shouldPoll ? 30_000 : false,
  });
  const ready = useQuery({
    queryKey: careQueryKey(sessionId, 'system', 'ready'),
    queryFn: api.ready,
    enabled: !!session,
    refetchInterval: shouldPoll ? 30_000 : false,
  });
  const release = useQuery({
    queryKey: careQueryKey(sessionId, 'system', 'release'),
    queryFn: api.release,
    enabled: !!session,
  });
  const aiConfiguration = useQuery({
    queryKey: aiKey,
    queryFn: api.aiConfiguration,
    enabled: !!session,
  });

  useEffect(() => {
    const value = aiConfiguration.data;
    if (!value) return;
    setBaseUrl(value.baseUrl);
    setModel(value.model);
    setApiKey('');
    setReasoningEffort(value.reasoningEffort);
    setConfidence(String(value.confidenceThreshold));
  }, [aiConfiguration.data]);

  const save = useMutation({
    mutationFn: () =>
      api.updateAiConfiguration(
        {
          baseUrl: baseUrl.trim(),
          model: model.trim(),
          ...(apiKey ? { apiKey } : {}),
          reasoningEffort,
          confidenceThreshold: Number(confidence),
          expectedVersion: aiConfiguration.data?.version ?? null,
        },
        operationKey,
      ),
    onSuccess: (value) => {
      queryClient.setQueryData(aiKey, value);
      setConfirm(null);
      setApiKey('');
    },
  });
  const reset = useMutation({
    mutationFn: () => {
      const version = aiConfiguration.data?.version;
      if (version == null) throw new Error('Tidak ada override Admin untuk dihapus.');
      return api.resetAiConfiguration({ expectedVersion: version }, operationKey);
    },
    onSuccess: (value) => {
      queryClient.setQueryData(aiKey, value);
      setConfirm(null);
      setApiKey('');
      requestAnimationFrame(() => testButtonRef.current?.focus());
    },
  });
  const test = useMutation({ mutationFn: api.testAiConfiguration });

  const confidenceNumber = Number(confidence);
  const validUrl = (() => {
    try {
      return new URL(baseUrl).protocol === 'https:';
    } catch {
      return false;
    }
  })();
  const formValid =
    validUrl &&
    model.trim().length > 0 &&
    confidence !== '' &&
    confidenceNumber >= 0 &&
    confidenceNumber <= 1;
  const lastUpdated = Math.max(
    health.dataUpdatedAt,
    ready.dataUpdatedAt,
    release.dataUpdatedAt,
    aiConfiguration.dataUpdatedAt,
  );
  const beginConfirmation = (kind: 'save' | 'reset') => {
    setOperationKey(crypto.randomUUID());
    setConfirm(kind);
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Operability"
        title="System Status"
        description="Kesehatan API, database, storage, release, dan konfigurasi AI runtime."
        updatedLabel={lastUpdated ? new Date(lastUpdated).toLocaleString('id-ID') : undefined}
        onRefresh={() => {
          void health.refetch();
          void ready.refetch();
          void release.refetch();
          void aiConfiguration.refetch();
        }}
        refreshing={health.isFetching || ready.isFetching}
      />
      {!session ? (
        <Alert tone="warning" title="Tidak ada sesi">
          Masuk sebagai Admin untuk melihat status.
        </Alert>
      ) : null}
      <div className="care-grid admin-system-grid">
        <section className="admin-card admin-card--lift" aria-label="Status health">
          <Stack gap="sm">
            <div className="admin-section__head">
              <h2 className="admin-card__title" style={{ margin: 0 }}>
                /health
              </h2>
              {health.data ? (
                <Badge tone={statusTone(health.data.status)}>{health.data.status}</Badge>
              ) : null}
            </div>
            {health.isLoading ? (
              <AdminSkeleton lines={3} label="Memuat health" />
            ) : health.error ? (
              <Alert tone="danger" title="Gagal">
                {String((health.error as Error).message)}
              </Alert>
            ) : (
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <ShieldCheck size={14} aria-hidden="true" /> Status API
                  </span>
                  <span className="admin-kv__value">{health.data?.status ?? '-'}</span>
                </div>
              </div>
            )}
          </Stack>
        </section>
        <section className="admin-card admin-card--lift" aria-label="Status readiness">
          <Stack gap="sm">
            <div className="admin-section__head">
              <h2 className="admin-card__title" style={{ margin: 0 }}>
                /ready
              </h2>
              {ready.data ? (
                <Badge tone={statusTone(ready.data.status)}>{ready.data.status}</Badge>
              ) : null}
            </div>
            {ready.isLoading ? (
              <AdminSkeleton lines={3} label="Memuat ready" />
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
                    <Database size={14} aria-hidden="true" /> Database
                  </span>
                  <Badge tone={statusTone(ready.data?.checks.database)}>
                    {ready.data?.checks.database ?? '-'}
                  </Badge>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <HardDrive size={14} aria-hidden="true" /> Storage
                  </span>
                  <Badge tone={statusTone(ready.data?.checks.storage)}>
                    {ready.data?.checks.storage ?? '-'}
                  </Badge>
                </div>
              </div>
            )}
          </Stack>
        </section>
        <section className="admin-card admin-card--lift" aria-label="Release identity">
          <Stack gap="sm">
            <div className="admin-section__head">
              <h2 className="admin-card__title" style={{ margin: 0 }}>
                /release.json
              </h2>
            </div>
            {release.isLoading ? (
              <AdminSkeleton lines={2} label="Memuat release" />
            ) : release.error ? (
              <Alert tone="danger" title="Gagal">
                {String((release.error as Error).message)}
              </Alert>
            ) : (
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">
                    <Rocket size={14} aria-hidden="true" /> Release SHA
                  </span>
                  <span className="admin-kv__value admin-id admin-nums">
                    {release.data?.releaseSha ?? '-'}
                  </span>
                </div>
              </div>
            )}
          </Stack>
        </section>
      </div>

      <section className="admin-card admin-card--hero" aria-label="Konfigurasi AI">
        <Stack gap="md">
          <div className="admin-section__head">
            <div>
              <h2 className="admin-card__title" style={{ margin: 0 }}>
                <BrainCircuit size={18} aria-hidden="true" /> Konfigurasi AI
              </h2>
              <p className="admin-meta--xs">Aktif untuk request berikutnya tanpa restart.</p>
            </div>
            <Badge tone={aiConfiguration.data?.source === 'ADMIN_OVERRIDE' ? 'success' : 'neutral'}>
              {aiConfiguration.data?.source ?? 'MEMUAT'}
            </Badge>
          </div>
          {aiConfiguration.isLoading ? (
            <AdminSkeleton lines={4} label="Memuat konfigurasi AI" />
          ) : aiConfiguration.error ? (
            <Alert tone="danger" title="Konfigurasi AI tidak tersedia">
              {String((aiConfiguration.error as Error).message)}
            </Alert>
          ) : (
            <>
              <div className="admin-ai-form">
                <Input
                  label="Base URL"
                  type="url"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  {...(baseUrl && !validUrl ? { errorText: 'Gunakan URL HTTPS yang valid.' } : {})}
                  placeholder="https://provider.example/v1"
                />
                <Input
                  label="Model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder="nama/model"
                />
                <PasswordInput
                  label="API key"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  helperText={`${aiConfiguration.data?.apiKeyConfigured ? 'Key sudah dikonfigurasi. ' : 'Key belum dikonfigurasi. '}Kosongkan untuk mempertahankan key saat ini.`}
                />
                <Select
                  label="Reasoning effort"
                  value={reasoningEffort}
                  onValueChange={(value) =>
                    setReasoningEffort(value as AiConfiguration['reasoningEffort'])
                  }
                  options={reasoningOptions}
                />
                <Input
                  label="Confidence threshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={confidence}
                  onChange={(event) => setConfidence(event.target.value)}
                  {...(confidence !== '' && (confidenceNumber < 0 || confidenceNumber > 1)
                    ? { errorText: 'Nilai harus antara 0 dan 1.' }
                    : {})}
                />
              </div>
              <div className="admin-kv">
                <div className="admin-kv__row">
                  <span className="admin-kv__label">Version</span>
                  <span className="admin-kv__value">
                    {aiConfiguration.data?.version ?? 'environment'}
                  </span>
                </div>
                <div className="admin-kv__row">
                  <span className="admin-kv__label">Terakhir diubah</span>
                  <span className="admin-kv__value">
                    {aiConfiguration.data?.updatedAt
                      ? new Date(aiConfiguration.data.updatedAt).toLocaleString('id-ID')
                      : 'environment bootstrap'}
                  </span>
                </div>
              </div>
              {save.isSuccess ? (
                <Alert tone="success" title="Tersimpan">
                  Konfigurasi AI sudah aktif.
                </Alert>
              ) : null}
              {test.data ? (
                <Alert
                  tone={test.data.ok ? 'success' : 'warning'}
                  title={test.data.ok ? 'Uji koneksi berhasil' : 'Provider degraded'}
                >
                  Classification: {test.data.classification.source}; location:{' '}
                  {test.data.location.completeness}; {test.data.latencyMs} ms.
                </Alert>
              ) : null}
              {save.error || reset.error || test.error ? (
                <Alert tone="danger" title="Operasi gagal">
                  {String(((save.error || reset.error || test.error) as Error).message)} Muat ulang
                  bila konfigurasi berubah di tab lain.
                </Alert>
              ) : null}
              <div className="admin-actions">
                <Button
                  ref={testButtonRef}
                  variant="secondary"
                  onClick={() => test.mutate()}
                  loading={test.isPending}
                >
                  Uji koneksi
                </Button>
                <Button
                  onClick={() => beginConfirmation('save')}
                  disabled={!formValid}
                  loading={save.isPending}
                >
                  Simpan
                </Button>
                <Button
                  variant="danger"
                  onClick={() => beginConfirmation('reset')}
                  disabled={aiConfiguration.data?.source !== 'ADMIN_OVERRIDE'}
                  loading={reset.isPending}
                >
                  Kembali ke environment
                </Button>
              </div>
            </>
          )}
        </Stack>
      </section>
      <Alert tone="info" title="Polling 30 detik">
        Polling health hanya berjalan saat tab terlihat; API key tidak pernah dikembalikan ke
        browser.
      </Alert>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        finalFocusRef={testButtonRef}
        title={confirm === 'reset' ? 'Kembali ke environment?' : 'Aktifkan konfigurasi AI?'}
        description={
          confirm === 'reset'
            ? 'Override terenkripsi akan dihapus dan request berikutnya memakai environment.'
            : 'Perubahan berlaku untuk request AI berikutnya tanpa restart.'
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Batal
            </Button>
            <Button
              variant={confirm === 'reset' ? 'danger' : 'primary'}
              loading={save.isPending || reset.isPending}
              onClick={() => (confirm === 'reset' ? reset.mutate() : save.mutate())}
            >
              {confirm === 'reset' ? 'Reset konfigurasi' : 'Aktifkan'}
            </Button>
          </>
        }
      >
        Pastikan base URL, model, dan reasoning effort sesuai dengan provider tujuan.
      </Dialog>
    </Stack>
  );
}
