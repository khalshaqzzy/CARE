import { Alert, Button, Checkbox, Skeleton, Stack } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Radio } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import { AREA_LABELS } from '../../lib/formatters';
import { useMutationKey, useApi, useSessionId, voiceQuery } from '../../lib/query';
import {
  ReviewConsentConfirmation,
  ReviewContactConsent,
  ReviewContent,
  ReviewMetaBar,
  ReviewSummary,
} from './ReviewParts';

export function DraftPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const sessionId = useSessionId();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitKey = useMutationKey('submit');

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
        submitKey.key(),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'draft') });
      void navigate('/voices/submitted', { replace: true, state: { submitted: true } });
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Voice gagal dikirim.'),
    onSettled: submitKey.reset,
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
  const fallbackCode =
    classification && 'fallbackCode' in classification ? classification.fallbackCode : null;
  const isIncomplete = data.locationReview?.completeness === 'INCOMPLETE';
  const routeLabel = readiness.ready
    ? (data.routeTarget ?? readiness.targetLabel ?? 'Akan ditentukan')
    : 'Akan ditentukan';

  return (
    <Stack gap="lg">
      <header className="page-intro">
        <p className="care-eyebrow">Pratinjau Voice</p>
        <h1>Tinjau sebelum kirim</h1>
        <p>Tinjau detail, klasifikasi, dan rute tujuan sebelum mengirim Voice.</p>
      </header>

      {error ? (
        <Alert tone="danger" title="Voice tidak dapat dikirim">
          {error}
        </Alert>
      ) : null}

      <ReviewSummary
        visibility={data.visibility}
        severity={severity}
        category={data.visibility === 'GENERAL' ? (category ?? null) : null}
        categoryName={data.categoryNameSnapshot}
        routeLabel={data.visibility === 'PRIVATE' ? 'Union Head' : routeLabel}
        showIdentity={data.showReporterIdentity ?? null}
        fallbackCode={source === 'MANUAL_FALLBACK' ? fallbackCode : null}
      />

      <ReviewContent
        title={data.title}
        areaLabel={AREA_LABELS[data.area] ?? data.area}
        locationDetail={data.locationDetail}
        detail={data.detail}
        attachments={data.attachments ?? []}
      />

      <ReviewMetaBar completeness={data.locationReview?.completeness ?? null} />

      {data.showReporterIdentity !== null &&
      data.showReporterIdentity !== undefined &&
      data.visibility === 'PRIVATE' ? (
        <ReviewConsentConfirmation showIdentity={data.showReporterIdentity} />
      ) : null}

      {data.visibility === 'PRIVATE' ? (
        <ReviewContactConsent accepted={data.privateContactConsent === true} />
      ) : null}

      {isIncomplete ? (
        <Alert tone="warning" title="Detail lokasi belum lengkap">
          <Checkbox
            checked={ack}
            onCheckedChange={setAck}
            label="Saya menyadari lokasi belum lengkap dan Voice berpotensi tidak ditangani dengan baik."
          />
        </Alert>
      ) : null}

      <div className="wizard-actionsbar">
        <Button variant="secondary" onClick={() => void navigate(`/drafts/${id}/edit`)}>
          <ArrowLeft size={18} /> Kembali
        </Button>
        <Button
          variant="primary"
          className="wizard-actionsbar__primary"
          loading={submit.isPending}
          disabled={
            (isIncomplete && !ack) ||
            (data.visibility === 'PRIVATE' && data.privateContactConsent !== true)
          }
          onClick={() => void submit.mutate()}
        >
          <Radio size={18} /> Kirim Voice
        </Button>
      </div>
    </Stack>
  );
}
