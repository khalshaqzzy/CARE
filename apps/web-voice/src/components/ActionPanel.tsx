import { Alert, Button, Card, Checkbox, Dialog, Select, Stack, Textarea } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ACTION_LABELS, STATUS_LABELS } from '../lib/formatters';
import { useApi, useMutationKey, useSessionId, voiceQuery } from '../lib/query';
import type { Attachment, VoiceDetail } from '../workforce-api';
import { MediaGallery } from './MediaGallery';

type Action = 'ask' | 'proceed' | 'close' | 'rate' | 'assign' | 'reassign' | 'none';

export function ActionPanel({ detail }: { detail: VoiceDetail }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const actions = detail.availableActions ?? [];
  const [active, setActive] = useState<Action>('none');
  const [error, setError] = useState<string | null>(null);

  const askKey = useMutationKey('ask');
  const proceedKey = useMutationKey('proceed');
  const closeKey = useMutationKey('close');
  const rateKey = useMutationKey('rate');
  const assignKey = useMutationKey('assign');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', detail.id) });
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
  };

  const ask = useMutation({
    mutationFn: async (text: string) =>
      api.ask(detail.id, { text, version: detail.version }, askKey.key()),
    onSuccess: () => {
      invalidate();
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: askKey.reset,
  });
  const proceed = useMutation({
    mutationFn: () => api.proceed(detail.id, { version: detail.version }, proceedKey.key()),
    onSuccess: () => {
      invalidate();
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: proceedKey.reset,
  });
  const close = useMutation({
    mutationFn: (body: { note: string; version: number }) =>
      api.close(detail.id, body, closeKey.key()),
    onSuccess: () => {
      invalidate();
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: closeKey.reset,
  });
  const rate = useMutation({
    mutationFn: (body: { score: number; feedback?: string; reopen: boolean }) =>
      api.rate(detail.id, body, rateKey.key()),
    onSuccess: () => {
      invalidate();
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: rateKey.reset,
  });
  const assign = useMutation({
    mutationFn: (body: { handlerAccountId: string; reason?: string }) =>
      api.assign(detail.id, { ...body, expectedVersion: detail.version }, assignKey.key()),
    onSuccess: () => {
      invalidate();
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
    onSettled: assignKey.reset,
  });

  if (!actions.length) return null;

  return (
    <Card className="action-panel">
      <div className="action-panel__head">
        <h3>Tindakan</h3>
        <span className="action-panel__status">{STATUS_LABELS[detail.status]}</span>
      </div>
      {error ? (
        <Alert tone="danger" title="Periksa kembali">
          {error}
        </Alert>
      ) : null}
      <div className="action-panel__grid">
        {actions.includes('ASK') ? (
          <Button onClick={() => setActive('ask')}>{ACTION_LABELS.ASK}</Button>
        ) : null}
        {actions.includes('ASSIGN') ? (
          <Button onClick={() => setActive('assign')}>{ACTION_LABELS.ASSIGN}</Button>
        ) : null}
        {actions.includes('REASSIGN') ? (
          <Button onClick={() => setActive('reassign')}>{ACTION_LABELS.REASSIGN}</Button>
        ) : null}
        {actions.includes('PROCEED') ? (
          <Button onClick={() => setActive('proceed')}>{ACTION_LABELS.PROCEED}</Button>
        ) : null}
        {actions.includes('CLOSE') ? (
          <Button variant="primary" onClick={() => setActive('close')}>
            {ACTION_LABELS.CLOSE}
          </Button>
        ) : null}
        {actions.includes('RATE') ? (
          <Button onClick={() => setActive('rate')}>{ACTION_LABELS.RATE}</Button>
        ) : null}
      </div>

      <Dialog
        open={active === 'ask'}
        onOpenChange={(open) => setActive(open ? 'ask' : 'none')}
        title="Tanya Reporter"
        description="Kirim pertanyaan verifikasi. Status akan berpindah ke In Verification."
      >
        <AskDialog
          onCancel={() => setActive('none')}
          onSend={(text) => ask.mutate(text)}
          loading={ask.isPending}
        />
      </Dialog>

      <Dialog
        open={active === 'assign' || active === 'reassign'}
        onOpenChange={(open) => setActive(open ? active : 'none')}
        title={active === 'reassign' ? 'Alihkan Penanggung' : 'Tugaskan Penanggung'}
        description={
          active === 'reassign'
            ? 'Pilih Section Head lain untuk melanjutkan penanganan Voice ini.'
            : 'Pilih Section Head yang akan menangani Voice ini.'
        }
      >
        <AssignDialog
          detail={detail}
          onCancel={() => setActive('none')}
          onConfirm={(body) => assign.mutate(body)}
          loading={assign.isPending}
        />
      </Dialog>

      <Dialog
        open={active === 'proceed'}
        onOpenChange={(open) => setActive(open ? 'proceed' : 'none')}
        title="Proses Voice"
        description="Konfirmasi Anda menangani Voice ini dan memindahkannya ke In Progress."
      >
        <ProceedDialog
          onCancel={() => setActive('none')}
          onConfirm={() => proceed.mutate()}
          loading={proceed.isPending}
        />
      </Dialog>

      <Dialog
        open={active === 'close'}
        onOpenChange={(open) => setActive(open ? 'close' : 'none')}
        title="Tutup Voice"
        description="Voice hanya dapat ditutup dari In Progress dengan catatan penutupan."
      >
        <CloseDialog
          detail={detail}
          onCancel={() => setActive('none')}
          onConfirm={(body) => close.mutate(body)}
          loading={close.isPending}
        />
      </Dialog>

      <Dialog
        open={active === 'rate'}
        onOpenChange={(open) => setActive(open ? 'rate' : 'none')}
        title="Beri rating"
        description="Rating 1–2 mewajibkan feedback dan dapat membuka kembali Voice."
      >
        <RateDialog
          onCancel={() => setActive('none')}
          onConfirm={(body) => rate.mutate(body)}
          loading={rate.isPending}
        />
      </Dialog>
    </Card>
  );
}

function AssignDialog({
  detail,
  onCancel,
  onConfirm,
  loading,
}: {
  detail: VoiceDetail;
  onCancel: () => void;
  onConfirm: (body: { handlerAccountId: string; reason?: string }) => void;
  loading: boolean;
}) {
  const api = useApi();
  const sessionId = useSessionId();
  const candidates = useQuery({
    queryKey: voiceQuery(sessionId, 'assign-candidates', detail.id),
    queryFn: () => api.assignmentCandidates(detail.id),
  });
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const options: { value: string; label: string }[] = (candidates.data ?? []).map((candidate) => ({
    value: candidate.id,
    label: candidate.slot
      ? `${candidate.displayName} (${candidate.slot.replace('_', ' ')})`
      : candidate.displayName,
  }));
  const empty = (candidates.data ?? []).length === 0;
  return (
    <Stack gap="md">
      {candidates.isLoading ? (
        <p className="dialog-copy">Memuat penanggung yang tersedia…</p>
      ) : empty ? (
        <Alert tone="warning" title="Tidak ada penanggung">
          Tidak ada kandidat eligible untuk Voice ini.
        </Alert>
      ) : (
        <Select
          label="Penanggung"
          value={selected}
          onValueChange={setSelected}
          options={options}
          {...(detail.visibility === 'PRIVATE'
            ? { helperText: 'Hanya Union Officer yang dapat ditugaskan.' }
            : {})}
        />
      )}
      <Textarea
        label="Alasan (opsional)"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        maxLength={500}
      />
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={!selected}
          onClick={() => {
            const trimmed = reason.trim();
            onConfirm({ handlerAccountId: selected, ...(trimmed ? { reason: trimmed } : {}) });
          }}
        >
          Tugaskan
        </Button>
      </div>
    </Stack>
  );
}

function AskDialog({
  onCancel,
  onSend,
  loading,
}: {
  onCancel: () => void;
  onSend: (text: string) => void;
  loading: boolean;
}) {
  const [text, setText] = useState('');
  return (
    <Stack gap="md">
      <Textarea
        label="Pesan pertanyaan"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        maxLength={4000}
        required
      />
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={!text.trim()}
          onClick={() => onSend(text)}
        >
          Kirim
        </Button>
      </div>
    </Stack>
  );
}

function ProceedDialog({
  onCancel,
  onConfirm,
  loading,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <Stack gap="md">
      <p className="dialog-copy">
        Voice akan berpindah ke In Progress dan Anda menjadi penanggung jawab aktif.
      </p>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button variant="primary" loading={loading} onClick={onConfirm}>
          Proses
        </Button>
      </div>
    </Stack>
  );
}

function CloseDialog({
  detail,
  onCancel,
  onConfirm,
  loading,
}: {
  detail: VoiceDetail;
  onCancel: () => void;
  onConfirm: (body: { note: string; version: number }) => void;
  loading: boolean;
}) {
  const api = useApi();
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadEvidence = async (files: FileList) => {
    const room = 5 - evidence.length;
    const picked = Array.from(files).slice(0, room);
    if (!picked.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      const staged: Attachment[] = [];
      for (const file of picked) staged.push(await api.stageEvidence(detail.id, file));
      setEvidence((current) => [...current, ...staged]);
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'Gagal mengunggah bukti.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <Stack gap="md">
      <div className="closure-evidence">
        <Textarea
          label="Catatan penutupan"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          maxLength={4000}
          required
        />
        <p className="dialog-copy">
          Bukti penutupan (foto) diperlukan. Bukti dan catatan bersifat permanen setelah tersimpan.
        </p>
        <button
          type="button"
          className="closure-evidence__add"
          onClick={() => fileInput.current?.click()}
          disabled={uploading || evidence.length >= 5}
        >
          <ImagePlus size={16} /> Tambah foto bukti ({evidence.length}/5)
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) void uploadEvidence(event.target.files);
          }}
        />
        {uploading ? <p className="dialog-copy">Memproses foto…</p> : null}
        {uploadError ? (
          <Alert tone="danger" title="Bukti gagal">
            {uploadError}
          </Alert>
        ) : null}
        {evidence.length ? (
          <MediaGallery attachments={evidence} label="Bukti penutupan" />
        ) : (
          <p className="dialog-copy">Minimal satu foto bukti wajib dilampirkan.</p>
        )}
      </div>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={!note.trim() || evidence.length === 0}
          onClick={() => onConfirm({ note, version: detail.version })}
        >
          Tutup Voice
        </Button>
      </div>
    </Stack>
  );
}

function RateDialog({
  onCancel,
  onConfirm,
  loading,
}: {
  onCancel: () => void;
  onConfirm: (body: { score: number; feedback?: string; reopen: boolean }) => void;
  loading: boolean;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [reopen, setReopen] = useState(false);
  const needsFeedback = score !== null && score <= 2;
  return (
    <Stack gap="md">
      <Select
        label="Rating"
        value={score ? String(score) : ''}
        onValueChange={(value) => setScore(Number(value))}
        options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value}/5` }))}
      />
      <Textarea
        label="Feedback"
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
        rows={3}
        maxLength={2000}
        helperText={needsFeedback ? 'Wajib untuk rating 1–2' : 'Opsional untuk rating 3–5'}
        required={needsFeedback}
      />
      {needsFeedback ? (
        <Checkbox
          checked={reopen}
          onCheckedChange={setReopen}
          label="Buka kembali Voice ini"
          description="Membuka kembali memulai siklus penutupan baru dengan PIC terakhir."
        />
      ) : null}
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={score === null || (needsFeedback && !feedback.trim())}
          onClick={() => {
            const trimmed = feedback.trim();
            onConfirm({
              score: score!,
              reopen,
              ...(trimmed ? { feedback: trimmed } : {}),
            });
          }}
        >
          Kirim Rating
        </Button>
      </div>
    </Stack>
  );
}
