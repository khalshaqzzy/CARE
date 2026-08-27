import { Alert, Button, Card, Checkbox, Dialog, Select, Stack, Textarea } from '@care/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ACTION_LABELS, STATUS_LABELS } from '../lib/formatters';
import { idempotencyKey, useApi, useSessionId, voiceQuery } from '../lib/query';
import type { VoiceDetail } from '../workforce-api';

export function ActionPanel({ detail }: { detail: VoiceDetail }) {
  const api = useApi();
  const sessionId = useSessionId();
  const queryClient = useQueryClient();
  const actions = detail.availableActions ?? [];
  const [active, setActive] = useState<'ask' | 'proceed' | 'close' | 'rate' | 'none'>('none');
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'voice', detail.id) });
    void queryClient.invalidateQueries({ queryKey: voiceQuery(sessionId, 'dashboard') });
  };

  const ask = useMutation({
    mutationFn: async (text: string) =>
      api.ask(detail.id, { text, version: detail.version }, idempotencyKey('ask')),
    onSuccess: invalidate,
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
  });
  const proceed = useMutation({
    mutationFn: () =>
      api.proceed(detail.id, { version: detail.version }, idempotencyKey('proceed')),
    onSuccess: invalidate,
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
  });
  const close = useMutation({
    mutationFn: (body: { note: string; version: number }) =>
      api.close(detail.id, body, idempotencyKey('close')),
    onSuccess: invalidate,
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
  });
  const rate = useMutation({
    mutationFn: (body: { score: number; feedback?: string; reopen: boolean }) =>
      api.rate(detail.id, body, idempotencyKey('rate')),
    onSuccess: () => {
      invalidate();
      setActive('none');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Aksi gagal.'),
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
  const [note, setNote] = useState('');
  return (
    <Stack gap="md">
      <Textarea
        label="Catatan penutupan"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={4}
        maxLength={4000}
        required
      />
      <p className="dialog-copy">
        Catatan bukti penutupan (foto) diperlukan pada versi penuh. Konsekuensi tidak dapat diubah
        setelah tersimpan.
      </p>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          variant="primary"
          loading={loading}
          disabled={!note.trim()}
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
