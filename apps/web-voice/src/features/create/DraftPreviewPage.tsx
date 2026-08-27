import { Alert, Button, Card, Checkbox, SeverityBadge, Skeleton, Stack } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Radio } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { MediaGallery } from '../../components/MediaGallery';
import { AREA_LABELS, CATEGORY_LABELS } from '../../lib/formatters';
import { idempotencyKey, useApi, useSessionId, voiceQuery } from '../../lib/query';

export function DraftPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useQuery({
    queryKey: voiceQuery(sessionId, 'draft', id, 'preview'),
    queryFn: () => api.previewDraft(id!),
    enabled: !!id && !!session,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const draft = preview.data;
      const isIncomplete = draft?.locationReview?.completeness === 'INCOMPLETE';
      return api.submitDraft(
        id!,
        {
          version: draft!.version,
          ...(isIncomplete
            ? {
                locationReviewId: draft!.locationReview!.id,
                locationContentHash: draft!.locationReview!.contentHash,
                acknowledgeIncompleteLocation: true,
              }
            : { acknowledgeIncompleteLocation: false }),
        },
        idempotencyKey('submit'),
      );
    },
    onSuccess: (data) => {
      const payload = data as { id: string };
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'draft') });
      void navigate(`/voices/${payload.id}`, { replace: true });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Voice gagal dikirim.'),
  });

  if (preview.isLoading) {
    return (
      <Stack gap="lg">
        <Skeleton label="Memuat pratinjau" />
      </Stack>
    );
  }
  if (preview.isError || !preview.data) {
    return (
      <Alert tone="danger" title="Tidak dapat membuka pratinjau">
        {preview.error instanceof Error ? preview.error.message : 'Draft tidak ditemukan.'}
      </Alert>
    );
  }
  const data = preview.data;
  const readiness = data.routeReadiness;
  const classification = data.classification;
  const source = classification && 'source' in classification ? classification.source : null;
  const severity = classification && 'severity' in classification ? classification.severity : null;
  const category = classification && 'category' in classification ? classification.category : null;

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">Pratinjau Voice</p>
        <h1>Sebelum dikirim</h1>
        <p>Tinjau detail, klasifikasi, dan rute tujuan sebelum mengirim Voice.</p>
      </header>

      {error ? (
        <Alert tone="danger" title="Voice tidak dapat dikirim">
          {error}
        </Alert>
      ) : null}

      <Card variant="raised">
        <Stack gap="md">
          <div className="review-rows">
            <div className="review-row">
              <span className="review-row__label">Jenis</span>
              <span className="review-row__value">
                {data.visibility === 'PRIVATE' ? 'Private' : 'General'}
              </span>
            </div>
            <div className="review-row">
              <span className="review-row__label">Area</span>
              <span className="review-row__value">{AREA_LABELS[data.area] ?? data.area}</span>
            </div>
            {severity ? (
              <div className="review-row">
                <span className="review-row__label">Severity</span>
                <SeverityBadge severity={severity} />
              </div>
            ) : null}
            {category ? (
              <div className="review-row">
                <span className="review-row__label">Kategori</span>
                <span className="review-row__value">{CATEGORY_LABELS[category] ?? category}</span>
              </div>
            ) : null}
            {data.showReporterIdentity !== null && data.visibility === 'PRIVATE' ? (
              <div className="review-row">
                <span className="review-row__label">Identitas</span>
                <span className="review-row__value">
                  {data.showReporterIdentity ? 'Tampilkan nama' : 'Sembunyikan (anonim)'}
                </span>
              </div>
            ) : null}
            {source ? (
              <div className="review-row">
                <span className="review-row__label">Sumber klasifikasi</span>
                <span className="review-row__value">
                  {source === 'AI' ? 'AI' : 'Manual Fallback'}
                </span>
              </div>
            ) : null}
            <div className="review-row">
              <span className="review-row__label">Judul</span>
              <span className="review-row__value">{data.title}</span>
            </div>
            <div className="review-row review-row--block">
              <span className="review-row__label">Detail</span>
              <p className="review-row__value review-row__text">{data.detail}</p>
            </div>
            <div className="review-row">
              <span className="review-row__label">Lokasi</span>
              <span className="review-row__value">{data.locationDetail}</span>
            </div>
            <div className="review-row">
              <span className="review-row__label">Rute tujuan</span>
              <span className="review-row__value">
                {data.routeTarget ?? readiness.targetLabel ?? 'Akan ditentukan'}
                {readiness.ready ? '' : ` · ${readiness.reason ?? 'belum siap'}`}
              </span>
            </div>
          </div>
        </Stack>
      </Card>

      {data.locationReview ? (
        <Card>
          <Stack gap="sm">
            <p className="review-row__label">Verifikasi lokasi</p>
            <p className={data.locationReview.completeness === 'INCOMPLETE' ? 'tag--warn' : ''}>
              {data.locationReview.completeness === 'COMPLETE'
                ? 'Lokasi dianggap lengkap.'
                : data.locationReview.completeness === 'INCOMPLETE'
                  ? (data.locationReview.warning ?? 'Detail lokasi belum lengkap.')
                  : 'Verifikasi lokasi tidak tersedia.'}
            </p>
          </Stack>
        </Card>
      ) : null}

      {data.attachments?.length ? (
        <MediaGallery attachments={data.attachments} label="Lampiran foto" />
      ) : null}

      {data.locationReview?.completeness === 'INCOMPLETE' ? (
        <Alert tone="warning" title="Detail lokasi belum lengkap">
          <Checkbox
            checked={ack}
            onCheckedChange={setAck}
            label="Saya menyadari lokasi belum lengkap dan Voice berpotensi tidak ditangani dengan baik."
          />
        </Alert>
      ) : null}

      <div className="wizard-actions wizard-actions--between">
        <Button variant="ghost" onClick={() => void navigate(`/drafts/${id}/edit`)}>
          <ArrowLeft size={18} /> Kembali mengubah
        </Button>
        <Button
          variant="primary"
          loading={submit.isPending}
          disabled={data.locationReview?.completeness === 'INCOMPLETE' && !ack}
          onClick={() => void submit.mutate()}
        >
          <Radio size={18} /> Kirim Voice
        </Button>
      </div>
    </Stack>
  );
}
