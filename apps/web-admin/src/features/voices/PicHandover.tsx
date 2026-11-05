import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, Input, Stack, Textarea } from '@care/ui';
import { UserRoundCog } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createAdminApi } from '../../admin-api';

const newKey = () => `admin-pic-handover-${crypto.randomUUID()}`;

/** Lets a CARE Admin move an active General Voice to another responder by name. */
export function PicHandover({ voiceId, version }: { voiceId: string; version: number }) {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [done, setDone] = useState('');
  const [requestKey, setRequestKey] = useState(newKey);

  // Search after a short pause so each keystroke does not hit the API.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(name.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [name]);

  const candidates = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'pic-candidates', voiceId, search),
    queryFn: () => api.adminPicCandidates(voiceId, search),
    enabled: !!session && open && search.length >= 2,
  });
  const target = candidates.data?.items.find((item) => item.id === targetId);

  const handover = useMutation({
    mutationFn: () =>
      api.adminPicHandover(
        voiceId,
        {
          toAccountId: targetId,
          expectedVersion: version,
          ...(reason.trim() ? { detail: reason.trim() } : {}),
        },
        requestKey,
      ),
    onSuccess: async () => {
      setDone(target?.displayName ?? 'PIC baru');
      setOpen(false);
      setName('');
      setTargetId('');
      setReason('');
      setFeedback('');
      setRequestKey(newKey());
      await queryClient.invalidateQueries({ queryKey: careQueryKey(session?.sessionId ?? 'anon') });
    },
    onError: (error) => {
      setFeedback(error instanceof Error ? error.message : 'Handover gagal disimpan.');
      setRequestKey(newKey());
    },
  });

  return (
    <div className="admin-pic-handover">
      <Stack gap="sm">
        {open ? null : (
          <Button
            size="sm"
            variant="secondary"
            className="admin-pic-handover__open"
            onClick={() => {
              setOpen(true);
              setDone('');
            }}
          >
            <UserRoundCog size={16} aria-hidden="true" /> Pindahkan PIC
          </Button>
        )}
        {done ? (
          <Alert tone="success" title="PIC dipindahkan">
            Voice kini ditangani {done}.
          </Alert>
        ) : null}
        {open ? (
          <Stack gap="sm">
            <Input
              label="Nama PIC baru"
              value={name}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
                setTargetId('');
              }}
              placeholder="Ketik nama atau No. Reg"
            />
            {search.length < 2 ? null : candidates.isLoading ? (
              <p className="admin-meta--xs">Mencari…</p>
            ) : candidates.data?.items.length ? (
              <div className="admin-handover-units" role="radiogroup" aria-label="PIC baru">
                {candidates.data.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={item.id === targetId}
                    disabled={item.current}
                    className="admin-handover-unit"
                    onClick={() => setTargetId(item.id)}
                  >
                    <span className="admin-handover-unit__radio" aria-hidden="true" />
                    <span>
                      <strong>{item.displayName}</strong>
                      <small>
                        {[item.position, item.department, item.section].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <span className="admin-handover-unit__pic">
                      {item.current ? 'PIC saat ini' : item.noReg}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="admin-meta--xs">Tidak ada responder dengan nama itu.</p>
            )}
            <Textarea
              label="Alasan (opsional)"
              value={reason}
              maxLength={4000}
              onChange={(event) => setReason(event.target.value)}
            />
            {feedback ? (
              <Alert tone="warning" title="Handover gagal">
                {feedback}
              </Alert>
            ) : null}
            <div className="admin-pic-handover__actions">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setFeedback('');
                }}
              >
                Batal
              </Button>
              <Button
                size="sm"
                disabled={!target || handover.isPending}
                onClick={() => handover.mutate()}
              >
                {handover.isPending
                  ? 'Memindahkan…'
                  : target
                    ? `Pindahkan ke ${target.displayName}`
                    : 'Pindahkan'}
              </Button>
            </div>
          </Stack>
        ) : null}
      </Stack>
    </div>
  );
}
