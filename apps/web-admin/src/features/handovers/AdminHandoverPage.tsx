import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, Card, EmptyState, Input, Skeleton, Stack, Textarea } from '@care/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Building2, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { createAdminApi } from '../../admin-api';

const newKey = () => `admin-handover-${crypto.randomUUID()}`;

export function AdminHandoverQueuePage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const queue = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'admin-handovers', cursor ?? 'first'),
    queryFn: () => api.adminHandovers(cursor),
    enabled: !!session,
  });
  const items =
    queue.data?.items.filter((item) =>
      `${item.voice.displayId} ${item.voice.title} ${item.manager.displayName}`
        .toLocaleLowerCase('id-ID')
        .includes(search.toLocaleLowerCase('id-ID')),
    ) ?? [];
  return (
    <Stack gap="lg">
      <AdminPageHeader
        eyebrow="Handover"
        title="Menunggu penentuan tujuan"
        description="General Voice yang diserahkan Manager untuk ditentukan department dan PIC tujuannya."
      />
      <div className="admin-handover-queue-tools">
        <Input
          label="Cari dalam antrean"
          leading={<Search size={17} />}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari ID, judul, atau Manager"
        />
        <span>{queue.data?.items.length ?? 0} Voice di halaman ini</span>
      </div>
      {queue.isLoading ? (
        <Skeleton label="Memuat antrean handover" />
      ) : queue.isError ? (
        <Alert tone="danger" title="Antrean gagal dimuat">
          Coba muat ulang halaman.
        </Alert>
      ) : items.length ? (
        <div className="admin-handover-queue-list">
          {items.map((item) => (
            <button
              className="admin-handover-queue-card"
              type="button"
              key={item.id}
              onClick={() => void navigate(`/handovers/${item.id}`)}
            >
              <span className="admin-handover-queue-card__top">
                <strong>{item.voice.displayId}</strong>
                <span>Menunggu Admin</span>
              </span>
              <strong className="admin-handover-queue-card__title">{item.voice.title}</strong>
              <span className="admin-handover-queue-card__meta">
                Dari {item.manager.displayName} · {new Date(item.createdAt).toLocaleString('id-ID')}
              </span>
              <span className="admin-handover-queue-card__reason">{item.managerDetail}</span>
              <span className="admin-handover-queue-card__action">
                Tentukan tujuan <ArrowRight size={16} />
              </span>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Tidak ada Voice menunggu Admin"
          description={search ? 'Coba kata kunci lain.' : 'Antrean handover sedang kosong.'}
        />
      )}
      {queue.data?.nextCursor ? (
        <Button variant="secondary" onClick={() => setCursor(queue.data!.nextCursor ?? undefined)}>
          Muat berikutnya
        </Button>
      ) : null}
    </Stack>
  );
}

export function AdminHandoverDecisionPage() {
  const { id = '' } = useParams();
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [reason, setReason] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [requestKey, setRequestKey] = useState(newKey);
  const detail = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'admin-handover', id),
    queryFn: () => api.adminHandover(id),
    enabled: !!session && !!id,
  });
  const options = useQuery({
    queryKey: careQueryKey(session?.sessionId ?? 'anon', 'admin-handover-options', id),
    queryFn: () => api.adminHandoverOptions(id),
    enabled: !!session && !!id,
  });
  const selected = options.data?.items.find((unit) => unit.id === selectedUnitId);
  const visibleUnits =
    options.data?.items.filter((unit) =>
      `${unit.directorate} ${unit.division} ${unit.department} ${unit.pic?.displayName ?? ''}`
        .toLocaleLowerCase('id-ID')
        .includes(search.toLocaleLowerCase('id-ID')),
    ) ?? [];
  const retainedCategory = selected?.categories.find(
    (category) => category.id === options.data?.currentCategoryId,
  );
  const categoryReady = selected?.categories.length
    ? selected.categories.some((category) => category.id === categoryId) || !!retainedCategory
    : !!customCategory.trim();
  const valid =
    !!selected?.available && !!categoryReady && !!reason.trim() && reason.length <= 4000;
  const decision = useMutation({
    mutationFn: () =>
      returning
        ? api.returnAdminHandover(
            id,
            { detail: returnReason.trim(), expectedVersion: detail.data!.voice.version },
            requestKey,
          )
        : api.resolveAdminHandover(
            id,
            {
              organizationUnitId: selectedUnitId,
              ...(selected?.categories.length
                ? categoryId
                  ? { categoryId }
                  : {}
                : { customCategory: customCategory.trim() }),
              detail: reason.trim(),
              expectedVersion: detail.data!.voice.version,
            },
            requestKey,
          ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: careQueryKey(session?.sessionId ?? 'anon') });
      void navigate('/handovers', { replace: true });
    },
    onError: async (error) => {
      setFeedback(error instanceof Error ? error.message : 'Keputusan gagal disimpan.');
      setRequestKey(newKey());
      await detail.refetch();
      await options.refetch();
    },
  });
  if (detail.isLoading || options.isLoading) return <Skeleton label="Memuat keputusan handover" />;
  if (!detail.data || !options.data || detail.isError || options.isError)
    return (
      <EmptyState
        title="Handover tidak tersedia"
        description="Antrean mungkin sudah diproses atau tidak dapat dibuka."
      />
    );
  const record = detail.data;
  if (record.status !== 'PENDING')
    return (
      <EmptyState
        title="Handover sudah diputuskan"
        description="Kembali ke antrean untuk memilih Voice lain."
        action={<Button onClick={() => void navigate('/handovers')}>Kembali ke antrean</Button>}
      />
    );
  return (
    <Stack gap="lg">
      <Button variant="ghost" size="sm" onClick={() => void navigate('/handovers')}>
        <ArrowLeft size={16} /> Kembali ke antrean
      </Button>
      <AdminPageHeader
        eyebrow="Menunggu Admin"
        title="Tentukan tujuan Voice"
        description="Pilih department aktif, sesuaikan kategori bila perlu, dan catat alasan keputusan."
      />
      {feedback ? (
        <Alert tone="warning" title="Periksa keputusan">
          {feedback}
        </Alert>
      ) : null}
      <div className="admin-handover-workspace">
        <Card className="admin-handover-context">
          <Stack gap="md">
            <div>
              <span className="admin-handover-eyebrow">Voice · Terbuka</span>
              <h2>{record.voice.displayId}</h2>
              <strong>{record.voice.title}</strong>
            </div>
            <p>{record.voice.detail}</p>
            <div className="admin-handover-context__meta">
              <span>
                Klasifikasi awal<strong>{record.voice.categoryNameSnapshot ?? '—'}</strong>
              </span>
              <span>
                Kategori operasional saat ini
                <strong>{record.voice.currentCategoryNameSnapshot ?? '—'}</strong>
              </span>
              <span>
                Manager asal<strong>{record.manager.displayName}</strong>
              </span>
            </div>
            <div className="admin-handover-manager-note">
              <small>Alasan dari Manager</small>
              <p>{record.managerDetail}</p>
            </div>
          </Stack>
        </Card>
        <section className="admin-handover-unit-panel" aria-labelledby="admin-units-title">
          <div className="admin-handover-panel-head">
            <Building2 size={19} />
            <h2 id="admin-units-title">Department tujuan</h2>
          </div>
          <Input
            label="Cari department atau PIC"
            leading={<Search size={17} />}
            placeholder="Direktorat, divisi, department, atau PIC"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="admin-handover-units" role="radiogroup" aria-label="Department tujuan">
            {visibleUnits.map((unit) => (
              <button
                type="button"
                key={unit.id}
                role="radio"
                aria-checked={selectedUnitId === unit.id}
                disabled={!unit.available}
                className="admin-handover-unit"
                onClick={() => {
                  setSelectedUnitId(unit.id);
                  setCategoryId('');
                  setCustomCategory('');
                  setReturning(false);
                  setFeedback('');
                  setRequestKey(newKey());
                }}
              >
                <span className="admin-handover-unit__radio" aria-hidden="true" />
                <span>
                  <strong>{unit.department}</strong>
                  <small>
                    {unit.directorate} / {unit.division}
                  </small>
                </span>
                <span className="admin-handover-unit__pic">
                  {unit.pic?.displayName ?? unit.disabledReason}
                </span>
              </button>
            ))}
            {!visibleUnits.length ? <p>Department tidak ditemukan.</p> : null}
          </div>
        </section>
        <section className="admin-handover-decision" aria-labelledby="admin-decision-title">
          <h2 id="admin-decision-title">Keputusan Admin</h2>
          <p>
            {selected
              ? `${selected.directorate} / ${selected.division} / ${selected.department}`
              : 'Pilih department tujuan untuk melihat kategori yang tersedia.'}
          </p>
          {selected?.categories.length ? (
            <div
              className="admin-handover-category-list"
              role="radiogroup"
              aria-label="Kategori operasional"
            >
              <strong>Kategori aktif yang sesuai</strong>
              {retainedCategory && !categoryId ? (
                <p>Kategori saat ini, {retainedCategory.name}, akan dipertahankan.</p>
              ) : null}
              {selected.categories.map((category) => (
                <label key={category.id}>
                  <input
                    type="radio"
                    name="admin-category"
                    value={category.id}
                    checked={(categoryId || retainedCategory?.id) === category.id}
                    onChange={() => {
                      setCategoryId(category.id);
                      setRequestKey(newKey());
                    }}
                  />
                  {category.name}
                </label>
              ))}
            </div>
          ) : selected ? (
            <Input
              label="Kategori operasional khusus Voice"
              maxLength={160}
              value={customCategory}
              onChange={(event) => {
                setCustomCategory(event.target.value);
                setRequestKey(newKey());
              }}
              helperText="Hanya berlaku untuk Voice ini; katalog global tidak berubah."
            />
          ) : null}
          <Textarea
            label={returning ? 'Alasan mengembalikan ke Manager' : 'Alasan penentuan tujuan'}
            rows={5}
            maxLength={4000}
            required
            value={returning ? returnReason : reason}
            onChange={(event) => {
              if (returning) setReturnReason(event.target.value);
              else setReason(event.target.value);
              setRequestKey(newKey());
            }}
          />
          <div className="admin-handover-actions">
            <Button
              variant="secondary"
              disabled={(returning && !returnReason.trim()) || decision.isPending}
              onClick={() => {
                if (!returning) {
                  setReturning(true);
                  setFeedback('');
                  setRequestKey(newKey());
                } else decision.mutate();
              }}
            >
              {returning ? 'Konfirmasi pengembalian' : 'Kembalikan ke Manager'}
            </Button>
            {returning ? (
              <Button variant="ghost" onClick={() => setReturning(false)}>
                Batal kembali
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={!valid || decision.isPending}
                loading={decision.isPending}
                onClick={() => decision.mutate()}
              >
                Teruskan ke department <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </section>
      </div>
    </Stack>
  );
}
