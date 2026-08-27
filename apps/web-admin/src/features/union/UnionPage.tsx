import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Input,
  Loader,
  PageHeader,
  Stack,
  Textarea,
} from '@care/ui';
import { useMemo, useState } from 'react';
import { createAdminApi, type UnionAccountList } from '../../admin-api';

type UnionTerm = UnionAccountList[number];

export function UnionPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const [slot, setSlot] = useState<UnionTerm['slot']>('HEAD');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [reason, setReason] = useState('');
  const [operationKey, setOperationKey] = useState('');
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'union'),
    queryFn: api.unionAccounts,
    enabled: !!session,
  });

  const mutate = useMutation({
    mutationFn: () =>
      api.setUnionAccount(
        slot,
        { username, displayName, reason, expectedCurrentTerm: bySlot(slot)?.id ?? null },
        operationKey,
      ),
    onSuccess: () => {
      setOpen(false);
      setUsername('');
      setDisplayName('');
      setReason('');
      void qc.invalidateQueries({ queryKey: careQueryKey(session?.sessionId ?? 'anon', 'union') });
    },
  });

  const bySlot = (s: UnionTerm['slot']) => q.data?.find((t) => t.slot === s);

  return (
    <Stack gap="lg">
      <PageHeader
        eyebrow="Union"
        title="Union Accounts"
        description="Tiga slot tetap: Head, Union 1, Union 2."
      />
      {q.isLoading ? (
        <Loader label="Memuat union" />
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <div
          className="care-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: '1rem' }}
        >
          {(['HEAD', 'OFFICER_1', 'OFFICER_2'] as const).map((s) => {
            const term = bySlot(s);
            return (
              <Card key={s}>
                <Stack gap="sm">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <strong>
                      {s === 'HEAD' ? 'Union Head' : s === 'OFFICER_1' ? 'Union 1' : 'Union 2'}
                    </strong>
                    {term ? (
                      <Badge tone="success">Terisi</Badge>
                    ) : (
                      <Badge tone="warning">Kosong</Badge>
                    )}
                  </div>
                  {term ? (
                    <>
                      <div style={{ fontSize: '0.875rem' }}>
                        {term.account.displayName} ({term.account.username})
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Status {term.account.status} • ID {term.account.id.slice(0, 8)}
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Belum ada akun untuk slot ini.
                    </p>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      setSlot(s);
                      setUsername(term?.account.username ?? '');
                      setDisplayName(term?.account.displayName ?? '');
                      setReason('');
                      setOperationKey(crypto.randomUUID());
                      setOpen(true);
                    }}
                  >
                    {term ? 'Ganti' : 'Buat'} akun
                  </Button>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Penggantian mempertahankan legacy access pada Voice aktif dan mencabut sesi
                    lama. Password sementara = username, wajib ganti.
                  </p>
                </Stack>
              </Card>
            );
          })}
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Atur ${slot}`}
        description="Username unik, displayName, dan akan mewajibkan ganti password."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => mutate.mutate()}
              loading={mutate.isPending}
              disabled={!username.trim() || !displayName.trim() || !reason.trim()}
            >
              Simpan
            </Button>
          </>
        }
      >
        <Stack gap="md">
          <Input
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="union-head"
          />
          <Textarea label="Alasan" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Union Head"
          />
          {mutate.error ? (
            <Alert tone="danger" title="Gagal">
              {String((mutate.error as Error).message)}
            </Alert>
          ) : null}
          <Alert tone="info" title="Konsekuensi">
            Akun lama akan menjadi LEGACY_HANDLER jika masih memiliki Voice aktif, sesi dicabut.
          </Alert>
        </Stack>
      </Dialog>
    </Stack>
  );
}
