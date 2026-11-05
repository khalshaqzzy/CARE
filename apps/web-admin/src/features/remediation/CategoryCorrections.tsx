import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, Stack, Textarea } from '@care/ui';
import { ArrowRight, Check, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createAdminApi, type CategoryCorrection } from '../../admin-api';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';

const AREA_LABELS: Record<string, string> = {
  KARAWANG_1: 'Karawang 1',
  KARAWANG_2: 'Karawang 2',
  KARAWANG_3: 'Karawang 3',
  SUNTER_1: 'Sunter 1',
  SUNTER_2: 'Sunter 2',
};

/**
 * General Voices handed over to another category (ADR-0080). Accepting one
 * adds an Example to the target category, which the AI reads on the next
 * analysis; dismissing records that the handover was not a category mistake.
 */
export function CategoryCorrectionsPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const sessionId = session?.sessionId ?? 'anon';
  const queryKey = careQueryKey(sessionId, 'category-corrections');
  const list = useQuery({
    queryKey,
    queryFn: () => api.categoryCorrections(),
    enabled: !!session,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey });
    void qc.invalidateQueries({
      queryKey: careQueryKey(sessionId, 'general-voice-categories-admin'),
    });
  };
  const accept = useMutation({
    mutationFn: (input: { item: CategoryCorrection; example: string }) =>
      api.acceptCategoryCorrection(
        input.item.voiceId,
        { example: input.example.trim(), expectedCategoryKey: input.item.to.key },
        crypto.randomUUID(),
      ),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: (item: CategoryCorrection) =>
      api.dismissCategoryCorrection(
        item.voiceId,
        { expectedCategoryKey: item.to.key },
        crypto.randomUUID(),
      ),
    onSuccess: refresh,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const exampleFor = (item: CategoryCorrection) => drafts[item.voiceId] ?? item.title;
  const items = list.data?.items ?? [];
  const failure = (accept.error ?? dismiss.error) as Error | null;

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Klasifikasi AI"
        title={`Koreksi kategori${list.data ? ` (${list.data.total})` : ''}`}
        description="Voice yang di-handover ke kategori lain. Jadikan contoh agar AI belajar."
      />
      {failure ? (
        <Alert tone="danger" title="Gagal menyimpan">
          {failure.message}
        </Alert>
      ) : null}
      <section className="admin-table-card admin-card--lift" aria-label="Koreksi kategori">
        {list.isLoading ? (
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={3} label="Memuat koreksi kategori" />
          </div>
        ) : list.error ? (
          <div style={{ padding: '1.25rem' }}>
            <Alert tone="danger" title="Koreksi gagal dimuat">
              {String((list.error as Error).message)}
            </Alert>
          </div>
        ) : !items.length ? (
          <AdminEmpty
            title="Tidak ada koreksi"
            description="Belum ada Voice yang pindah kategori."
          />
        ) : (
          <div className="admin-correction-list">
            {items.map((item) => (
              <article
                key={item.voiceId}
                className="admin-correction"
                aria-label={`Koreksi ${item.displayId}`}
              >
                <div className="admin-correction__top">
                  <span className="admin-rowbody">
                    <strong>{item.title}</strong>
                    <span className="admin-nums">
                      {item.displayId} · {AREA_LABELS[item.area] ?? item.area} ·{' '}
                      {item.locationDetail}
                    </span>
                  </span>
                  <span className="admin-correction__change">
                    <span className="admin-pill" data-tone="neutral">
                      {item.from.name}
                    </span>
                    <ArrowRight size={14} aria-label="menjadi" />
                    <span className="admin-pill" data-tone="success">
                      {item.to.name}
                    </span>
                  </span>
                </div>
                <p className="admin-correction__detail">{item.detail}</p>
                {item.handoverNote ? (
                  <p className="admin-correction__note">
                    <small>Alasan handover</small>
                    {item.handoverNote}
                  </p>
                ) : null}
                {item.canAccept ? (
                  <Textarea
                    label={`Contoh untuk ${item.to.name}`}
                    value={exampleFor(item)}
                    maxLength={1000}
                    rows={2}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [item.voiceId]: event.target.value }))
                    }
                  />
                ) : (
                  <small className="admin-correction__muted">
                    Kategori tujuan tidak aktif; hanya bisa diabaikan.
                  </small>
                )}
                <div className="admin-correction__actions">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={dismiss.isPending && dismiss.variables?.voiceId === item.voiceId}
                    onClick={() => dismiss.mutate(item)}
                  >
                    <X size={14} /> Abaikan
                  </Button>
                  {item.canAccept ? (
                    <Button
                      size="sm"
                      disabled={!exampleFor(item).trim()}
                      loading={accept.isPending && accept.variables?.item.voiceId === item.voiceId}
                      onClick={() => accept.mutate({ item, example: exampleFor(item) })}
                    >
                      <Check size={14} /> Jadikan contoh
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </Stack>
  );
}
