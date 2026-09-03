import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Badge, Button, Dialog, Input, Stack, Textarea } from '@care/ui';
import { Info, ShieldCheck, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';
import { createAdminApi, type UnionAccountList } from '../../admin-api';

type UnionTerm = UnionAccountList[number];

const SLOT_META: Record<UnionTerm['slot'], { title: string; impact: string; index?: string }> = {
  HEAD: { title: 'Head (Akun Utama)', impact: 'Akses semua Union akan berubah' },
  OFFICER_1: { title: 'Union 1', impact: 'Akses slot ini akan berubah', index: '1' },
  OFFICER_2: { title: 'Union 2', impact: 'Akses slot ini akan berubah', index: '2' },
};

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
  const filled = (['HEAD', 'OFFICER_1', 'OFFICER_2'] as const).filter((s) => bySlot(s)).length;

  const begin = (s: UnionTerm['slot']) => {
    const term = bySlot(s);
    setSlot(s);
    setUsername(term?.account.username ?? '');
    setDisplayName(term?.account.displayName ?? '');
    setReason('');
    setOperationKey(crypto.randomUUID());
    setOpen(true);
  };

  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Union"
        title="Union Accounts"
        description="Kelola akun Head dan slot Union. Penggantian akun akan memengaruhi akses sistem."
        badge={
          <span className="admin-count-pill">
            <TrendingUp size={14} aria-hidden="true" /> Workload <strong>—</strong> Tidak tersedia
          </span>
        }
      />
      {q.isLoading ? (
        <AdminSkeleton lines={4} label="Memuat union" />
      ) : q.error ? (
        <Alert tone="danger" title="Gagal">
          {String((q.error as Error).message)}
        </Alert>
      ) : (
        <div className="admin-tree" role="list" aria-label="Slot Union">
          {(['HEAD', 'OFFICER_1', 'OFFICER_2'] as const).map((s) => {
            const term = bySlot(s);
            const meta = SLOT_META[s];
            return (
              <div
                className={s === 'HEAD' ? 'admin-treenode' : 'admin-treenode admin-treenode--child'}
                role="listitem"
                key={s}
              >
                <div className="admin-treenode__head">
                  <span className="admin-kpi__icon" data-tone="brand" aria-hidden="true">
                    {meta.index ? <strong>{meta.index}</strong> : <ShieldCheck size={18} />}
                  </span>
                  <h2 className="admin-treenode__title">
                    {meta.title}{' '}
                    <span className="admin-pill" data-tone={term ? 'success' : 'warning'}>
                      {term ? 'Slot aktif' : 'Belum ada akun'}
                    </span>
                  </h2>
                  <span className="admin-treenode__actions">
                    <Button size="sm" onClick={() => begin(s)}>
                      {term ? 'Ganti akun' : 'Buat akun'}
                    </Button>
                  </span>
                </div>
                <div className="admin-treenode__meta">
                  <div>
                    <span>Username</span>
                    <strong>{term?.account.username ?? '—'}</strong>
                  </div>
                  <div>
                    <span>Effective state</span>
                    <strong>
                      {term ? (
                        <>
                          <span
                            className="admin-live-dot"
                            style={{
                              display: 'inline-block',
                              marginRight: '0.375rem',
                              verticalAlign: 'middle',
                            }}
                            aria-hidden="true"
                          />
                          {term.account.status}
                        </>
                      ) : (
                        '—'
                      )}
                    </strong>
                  </div>
                  <div>
                    <span>Dampak penggantian</span>
                    <strong>{meta.impact}</strong>
                  </div>
                </div>
                {term ? (
                  <p className="admin-meta--xs" style={{ marginTop: '0.5rem' }}>
                    {term.account.displayName} • ID {term.account.id.slice(0, 8)} • efektif sejak{' '}
                    {term.effectiveFrom
                      ? new Date(term.effectiveFrom).toLocaleString('id-ID')
                      : '—'}
                  </p>
                ) : (
                  <p className="admin-meta--xs" style={{ marginTop: '0.5rem' }}>
                    Belum ada akun untuk slot ini. {filled}/3 slot terisi.
                  </p>
                )}
              </div>
            );
          })}
          <p className="admin-note">
            <Info size={14} aria-hidden="true" />
            <span>
              Penggantian akun tidak dapat dibatalkan. Pastikan kredensial baru memiliki hak akses
              yang sesuai. Akun lama menjadi LEGACY_HANDLER bila masih memiliki Voice aktif; sesi
              lama dicabut dan password sementara = username (wajib ganti).
            </span>
          </p>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`Atur ${slot === 'HEAD' ? 'Union Head' : slot === 'OFFICER_1' ? 'Union 1' : 'Union 2'}`}
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
          {bySlot(slot) ? (
            <p className="admin-meta--xs">
              Term saat ini: <Badge tone="success">Terisi</Badge> {bySlot(slot)?.account.username} •
              ganti mengharapkan term {bySlot(slot)?.id.slice(0, 8)} (optimistic).
            </p>
          ) : null}
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
          <Textarea
            label="Alasan"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Alasan penggantian akun"
            helperText={`${reason.length} karakter`}
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
