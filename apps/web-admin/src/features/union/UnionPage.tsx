import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Alert, Badge, Button, Card, Dialog, Input, Loader, PageHeader, Stack } from '@care/ui';
import { useState } from 'react';

type UnionTerm = {
  id: string;
  slot: 'HEAD' | 'OFFICER_1' | 'OFFICER_2';
  account: { id: string; username: string; displayName: string; status: string };
};

export function UnionPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [slot, setSlot] = useState<UnionTerm['slot']>('HEAD');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'union'),
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/union-accounts', { credentials: 'include' });
      if (!res.ok) throw new Error('Gagal memuat union');
      return (await res.json()) as UnionTerm[];
    },
    enabled: !!session,
  });

  async function getCsrf() {
    const r = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const j = (await r.json()) as { token: string };
    return j.token;
  }

  const mutate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/v1/admin/union-accounts/${slot}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': await getCsrf(),
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ username, displayName }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { message?: string }).message ?? 'Gagal menyimpan union');
      }
      return res.json();
    },
    onSuccess: () => {
      setOpen(false);
      setUsername('');
      setDisplayName('');
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
            <Button onClick={() => mutate.mutate()} loading={mutate.isPending}>
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
