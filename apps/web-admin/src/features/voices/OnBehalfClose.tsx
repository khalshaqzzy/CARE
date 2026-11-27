import { useMutation, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, Stack, Textarea } from '@care/ui';
import { UserRoundCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createAdminApi } from '../../admin-api';

const newKey = () => `admin-close-on-behalf-${crypto.randomUUID()}`;

/**
 * CARE Admin finishes for a PIC whose target passed two working days ago and
 * nobody above acted (ADR-0086). Medium and above still go to approval.
 */
export function OnBehalfClose({
  voiceId,
  version,
  pic,
  needsApproval,
}: {
  voiceId: string;
  version: number;
  pic: string;
  needsApproval: boolean;
}) {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const [requestKey, setRequestKey] = useState(newKey);
  const finish = useMutation({
    mutationFn: () => api.adminCloseOnBehalf(voiceId, { note: note.trim(), version }, requestKey),
    onSuccess: async () => {
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: careQueryKey(session?.sessionId ?? 'anon') });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Belum tersimpan.');
      setRequestKey(newKey());
    },
  });
  return (
    <div className="admin-pic-handover">
      {open ? (
        <Stack gap="sm">
          <p className="admin-meta--xs">
            PIC: {pic}
            {needsApproval ? ' · atasan tetap menyetujui' : ''}
          </p>
          <Textarea
            label="Catatan penyelesaian"
            required
            value={note}
            maxLength={4000}
            placeholder="Mis. PIC konfirmasi selesai di chat"
            onChange={(event) => setNote(event.target.value)}
          />
          {feedback ? (
            <Alert tone="warning" title="Belum tersimpan">
              {feedback}
            </Alert>
          ) : null}
          <div className="admin-pic-handover__actions">
            <Button
              size="sm"
              variant="ghost"
              disabled={finish.isPending}
              onClick={() => {
                setOpen(false);
                setFeedback('');
              }}
            >
              Batal
            </Button>
            <Button
              size="sm"
              variant="primary"
              loading={finish.isPending}
              disabled={!note.trim() || finish.isPending}
              onClick={() => finish.mutate()}
            >
              {needsApproval ? 'Kirim laporan' : 'Tutup Voice'}
            </Button>
          </div>
        </Stack>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="admin-pic-handover__open"
          onClick={() => setOpen(true)}
        >
          <UserRoundCheck size={16} aria-hidden="true" /> Tutup atas nama PIC
        </Button>
      )}
    </div>
  );
}
