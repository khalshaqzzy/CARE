import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@care/frontend-core';
import type {
  ClassificationPreview,
  LocationReview,
  VoiceDraft,
  Attachment,
} from '../../workforce-api';
import { idempotencyKey, useApi, useSessionId, voiceQuery } from '../../lib/query';
import { AREA_LABELS } from '../../lib/formatters';

export type Visibility = 'GENERAL' | 'PRIVATE';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type Category = 'SAFETY' | 'ENVIRONMENT' | 'FACILITY' | 'WORK_DIFFICULTY';

export type Step = 'visibility' | 'form' | 'processing' | 'fallback' | 'review' | 'submitting';

export type DraftForm = {
  visibility: Visibility;
  area: string;
  locationDetail: string;
  title: string;
  detail: string;
  showReporterIdentity: boolean | null;
};

const EMPTY_FORM: DraftForm = {
  visibility: 'GENERAL',
  area: '',
  locationDetail: '',
  title: '',
  detail: '',
  showReporterIdentity: null,
};

export function useDraftWizard(draftId?: string) {
  const { session } = useAuth();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const sessionId = useSessionId();
  const isEdit = Boolean(draftId);

  const [step, setStep] = useState<Step>(() => (draftId ? 'form' : 'visibility'));
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [classification, setClassification] = useState<ClassificationPreview | null>(null);
  const [locationReview, setLocationReview] = useState<LocationReview | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ackDisabled, setAckDisabled] = useState(false);

  const loaded = useQuery({
    queryKey: voiceQuery(sessionId, 'draft', draftId ?? 'none'),
    queryFn: () => api.getDraft(draftId!),
    enabled: isEdit && !!draftId && !!session,
  });

  const syncLoaded = useCallback(() => {
    if (!isEdit || !loaded.data) return;
    setForm({
      visibility: loaded.data.visibility,
      area: loaded.data.area,
      locationDetail: loaded.data.locationDetail,
      title: loaded.data.title,
      detail: loaded.data.detail,
      showReporterIdentity: loaded.data.showReporterIdentity ?? null,
    });
    setDraft(loaded.data);
    setClassification(loaded.data.classification ?? null);
    setLocationReview(loaded.data.locationReview ?? null);
  }, [isEdit, loaded.data]);

  useEffect(() => {
    syncLoaded();
  }, [syncLoaded]);

  const persist = useMutation({
    mutationFn: async (patch: Partial<DraftForm>) => {
      const body: Record<string, unknown> = {};
      for (const key of Object.keys(patch) as (keyof DraftForm)[]) {
        const value = patch[key];
        if (value !== undefined) body[key] = value;
      }
      if (draft) return api.updateDraft(draft.id, body as never);
      const next = { ...form, ...patch };
      return api.createDraft({
        area: next.area as never,
        locationDetail: next.locationDetail,
        title: next.title,
        detail: next.detail,
        visibility: next.visibility,
        ...(next.visibility === 'PRIVATE'
          ? { showReporterIdentity: next.showReporterIdentity ?? false }
          : {}),
      });
    },
    onSuccess: (data) => {
      setDraft(data);
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'draft') });
    },
  });

  const classifyMutation = useMutation({
    mutationFn: (id: string) => api.classify(id),
    onSuccess: (data) => {
      setClassification(data);
      if ('source' in data && data.source === 'MANUAL_FALLBACK') setStep('fallback');
    },
  });

  const manualMutation = useMutation({
    mutationFn: async (payload: { category?: Category | null; severity: Severity }) => {
      const id = draft!.id;
      const result = await api.manualClassification(id, {
        category: payload.category ?? null,
        severity: payload.severity,
      });
      return result;
    },
    onSuccess: (data) => {
      setClassification(data);
      setStep('review');
    },
  });

  const reviewLocationMutation = useMutation({
    mutationFn: (id: string) => api.reviewLocation(id),
    onSuccess: (data) => setLocationReview(data),
  });

  const submitMutation = useMutation({
    mutationFn: async (key: string) => {
      const id = draft!.id;
      const isIncomplete = locationReview?.completeness === 'INCOMPLETE';
      return api.submitDraft(
        id,
        {
          version: draft!.version,
          ...(isIncomplete
            ? {
                locationReviewId: locationReview!.id,
                locationContentHash: locationReview!.contentHash,
                acknowledgeIncompleteLocation: true,
              }
            : { acknowledgeIncompleteLocation: false }),
        },
        key,
      );
    },
    onSuccess: (data) => {
      const payload = data as { id: string };
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice') });
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'draft') });
      void navigate(`/voices/${payload.id}`, { replace: true });
    },
  });

  const uploadAttachments = useMutation({
    mutationFn: async (files: File[]) => {
      if (!draft) return [];
      const uploaded: Attachment[] = [];
      for (const file of files) uploaded.push(await api.uploadDraftAttachment(draft.id, file));
      return uploaded;
    },
    onSuccess: (uploaded) => {
      setAttachments((current) => [...current, ...uploaded]);
      void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'draft') });
    },
  });

  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) => api.removeDraftAttachment(draft!.id, attachmentId),
    onSuccess: (_data, attachmentId) => {
      setAttachments((current) => current.filter((a) => a.id !== attachmentId));
    },
  });

  const setField = useCallback(
    (patch: Partial<DraftForm>) => setForm((current) => ({ ...current, ...patch })),
    [],
  );

  const saveAndProcess = useCallback(async () => {
    setError(null);
    if (!form.visibility) return setStep('visibility');
    if (!form.area || !form.locationDetail.trim() || !form.title.trim() || !form.detail.trim()) {
      setError('Lengkapi area, detail lokasi, judul, dan detail Voice.');
      return;
    }
    try {
      setStep('processing');
      const saved = await persist.mutateAsync({});
      if (!saved) return;
      setDraft(saved);
      // Keep these independent provider calls concurrent: routing depends on
      // classification, while location completeness does not.
      const [classificationResult, reviewResult] = await Promise.all([
        classifyMutation.mutateAsync(saved.id),
        reviewLocationMutation.mutateAsync(saved.id),
      ]);
      // Read the awaited result: the mutation object captured by this closure
      // still holds its pre-flight state, so `.data` here would be stale.
      setLocationReview(reviewResult);
      if (
        classificationResult &&
        'source' in classificationResult &&
        classificationResult.source !== 'MANUAL_FALLBACK'
      )
        setStep('review');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Draft tidak dapat disimpan.');
      setStep('form');
    }
  }, [form, persist, classifyMutation, reviewLocationMutation]);

  const saveOnly = useCallback(async () => {
    setError(null);
    if (!form.area || !form.locationDetail.trim() || !form.title.trim() || !form.detail.trim()) {
      setError('Lengkapi area, detail lokasi, judul, dan detail Voice.');
      return;
    }
    try {
      const saved = await persist.mutateAsync({});
      setDraft(saved);
      return saved;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Draft tidak dapat disimpan.');
      return undefined;
    }
  }, [form, persist]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      setError(null);
      if (attachments.length + files.length > 5) {
        setError('Maksimum lima lampiran per Voice.');
        return;
      }
      try {
        let targetDraft = draft;
        if (!targetDraft) targetDraft = (await saveOnly()) ?? null;
        if (!targetDraft) return;
        setDraft(targetDraft);
        await uploadAttachments.mutateAsync(files);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Lampiran gagal diunggah.');
      }
    },
    [draft, attachments.length, uploadAttachments, saveOnly],
  );

  const runFallback = useCallback(
    async (payload: { category?: Category | null; severity: Severity }) => {
      setError(null);
      try {
        await manualMutation.mutateAsync(payload);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Klasifikasi manual gagal disimpan.');
      }
    },
    [manualMutation],
  );

  const proceedToReview = useCallback(() => {
    setStep('review');
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setStep('submitting');
    setAckDisabled(true);
    try {
      await submitMutation.mutateAsync(idempotencyKey('submit'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Voice gagal dikirim.');
      setStep('review');
    } finally {
      setAckDisabled(false);
    }
  }, [submitMutation]);

  const dirty = useMemo(
    () =>
      draft
        ? draft.title !== form.title ||
          draft.detail !== form.detail ||
          draft.locationDetail !== form.locationDetail ||
          draft.area !== form.area ||
          draft.visibility !== form.visibility
        : true,
    [draft, form],
  );

  const zoneLabel = form.area ? AREA_LABELS[form.area] : null;

  // Live stage states for the processing surface: persist completes first,
  // then classification and location review resolve together.
  const stages = {
    persisted: persist.isSuccess,
    classifying: classifyMutation.isPending,
    classified: classifyMutation.isSuccess,
    reviewing: reviewLocationMutation.isPending,
    reviewed: reviewLocationMutation.isSuccess,
  };

  return {
    step,
    setStep,
    form,
    setField,
    draft,
    classification,
    locationReview,
    attachments,
    error,
    ackDisabled,
    isEdit,
    dirty,
    loaded,
    zoneLabel,
    stages,
    saveAndProcess,
    saveOnly,
    uploadFiles,
    removeAttachment: removeAttachment.mutate,
    runFallback,
    proceedToReview,
    submit,
    isSubmitting: submitMutation.isPending || submitMutation.isSuccess,
    isUploading: uploadAttachments.isPending,
    busy:
      persist.isPending ||
      classifyMutation.isPending ||
      reviewLocationMutation.isPending ||
      manualMutation.isPending,
  };
}
