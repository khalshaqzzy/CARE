import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, Checkbox, DataTable, Drawer, Input, Stack } from '@care/ui';
import { Archive, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  createAdminApi,
  type AreaKey,
  type ShopLocationAdmin,
  type ShopLocationUnmatched,
} from '../../admin-api';
import { AdminEmpty } from '../../components/AdminEmpty';
import { AdminSkeleton } from '../../components/AdminSkeleton';

const AREAS: { value: AreaKey; label: string }[] = [
  { value: 'KARAWANG_1', label: 'Karawang 1' },
  { value: 'KARAWANG_2', label: 'Karawang 2' },
  { value: 'KARAWANG_3', label: 'Karawang 3' },
  { value: 'SUNTER_1', label: 'Sunter 1' },
  { value: 'SUNTER_2', label: 'Sunter 2' },
];
const areaLabel = (value: string) => AREAS.find((area) => area.value === value)?.label ?? value;

type Form = {
  organizationUnitId: string;
  organizationUnitLabel: string;
  areas: AreaKey[];
  aliases: string[];
};
const emptyForm: Form = {
  organizationUnitId: '',
  organizationUnitLabel: '',
  areas: [],
  aliases: [],
};

/**
 * Production departments (shops) per plant area. General Voices whose category
 * routes by incident location owner go to the Department Head of the shop that
 * the reporter's location text or confirmation points to.
 */
export function ShopLocationConfiguration() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const queryKey = careQueryKey(session?.sessionId ?? 'anon', 'shop-locations-admin');
  const shops = useQuery({ queryKey, queryFn: () => api.shopLocations(), enabled: !!session });
  const unmatched = useQuery({
    queryKey: [...queryKey, 'unmatched'],
    queryFn: () => api.unmatchedShopLocations(),
    enabled: !!session,
  });
  const [selected, setSelected] = useState<ShopLocationAdmin | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [alias, setAlias] = useState('');
  const [search, setSearch] = useState('');
  const units = useQuery({
    queryKey: [...queryKey, 'units', search],
    queryFn: () => api.organizationUnits({ ...(search ? { search } : {}), limit: 20 }),
    enabled: open && !selected,
  });

  const close = () => {
    setOpen(false);
    setSelected(null);
    setForm(emptyForm);
    setAlias('');
    setSearch('');
    save.reset();
  };
  const save = useMutation({
    mutationFn: () =>
      selected
        ? api.updateShopLocation(
            selected.id,
            { areas: form.areas, aliases: form.aliases, expectedVersion: selected.version },
            crypto.randomUUID(),
          )
        : api.createShopLocation(
            {
              organizationUnitId: form.organizationUnitId,
              areas: form.areas,
              aliases: form.aliases,
            },
            crypto.randomUUID(),
          ),
    onSuccess: () => {
      close();
      void qc.invalidateQueries({ queryKey });
    },
  });
  const setStatus = useMutation({
    mutationFn: (shop: ShopLocationAdmin) =>
      api.setShopLocationStatus(
        shop.id,
        {
          status: shop.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
          expectedVersion: shop.version,
        },
        crypto.randomUUID(),
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey }),
  });

  const begin = (shop?: ShopLocationAdmin) => {
    setSelected(shop ?? null);
    setForm(
      shop
        ? {
            organizationUnitId: shop.organizationUnit.id,
            organizationUnitLabel: shop.organizationUnit.department,
            areas: [...shop.areas],
            aliases: [...shop.aliases],
          }
        : emptyForm,
    );
    setOpen(true);
  };
  const addAlias = () => {
    const value = alias.trim().toLocaleLowerCase('id');
    if (value && !form.aliases.includes(value) && form.aliases.length < 30)
      setForm({ ...form, aliases: [...form.aliases, value] });
    setAlias('');
  };
  const unmatchedRows: ShopLocationUnmatched[] = unmatched.data ?? [];

  return (
    <>
      <section className="admin-table-card admin-card--lift" aria-label="Lokasi shop">
        <div style={{ padding: '1rem 1.25rem 0' }}>
          <div className="admin-section__head">
            <div>
              <h2 className="admin-card__title" style={{ margin: 0 }}>
                Lokasi shop
              </h2>
              <p className="admin-card__subtitle" style={{ margin: 0 }}>
                Voice Fasilitas Kerja yang terjadi di shop diteruskan ke manager department shop
                tersebut.
              </p>
            </div>
            <Button size="sm" onClick={() => begin()}>
              <Plus size={14} /> Tambah shop
            </Button>
          </div>
        </div>
        {shops.isLoading ? (
          <div style={{ padding: '1.25rem' }}>
            <AdminSkeleton lines={3} label="Memuat lokasi shop" />
          </div>
        ) : shops.error ? (
          <div style={{ padding: '1.25rem' }}>
            <Alert tone="danger" title="Lokasi shop gagal dimuat">
              {String((shops.error as Error).message)}
            </Alert>
          </div>
        ) : (
          <DataTable
            caption="Lokasi shop"
            columns={[
              {
                key: 'department',
                header: 'Department shop',
                cell: (row: ShopLocationAdmin) => (
                  <span className="admin-rowbody">
                    <strong>{row.organizationUnit.department}</strong>
                    <span className="admin-nums">
                      {row.organizationUnit.directorate} / {row.organizationUnit.division}
                    </span>
                  </span>
                ),
              },
              {
                key: 'areas',
                header: 'Area',
                cell: (row: ShopLocationAdmin) => (
                  <span className="admin-chip-list">
                    {row.areas.map((area) => (
                      <span key={area} className="admin-pill" data-tone="info">
                        {areaLabel(area)}
                      </span>
                    ))}
                  </span>
                ),
              },
              {
                key: 'aliases',
                header: 'Alias',
                cell: (row: ShopLocationAdmin) =>
                  row.aliases.length ? (
                    <span className="admin-nums">{row.aliases.join(', ')}</span>
                  ) : (
                    <small>Belum ada alias</small>
                  ),
              },
              {
                key: 'pic',
                header: 'Manager penerima',
                cell: (row: ShopLocationAdmin) => (
                  <span className="admin-rowbody">
                    <span>
                      {row.pic
                        ? `${row.pic.name}${row.pic.noReg ? ` (${row.pic.noReg})` : ''}`
                        : 'Belum tersedia'}
                    </span>
                    <span
                      className="admin-pill"
                      data-tone={row.health === 'HEALTHY' ? 'success' : 'warning'}
                    >
                      {row.health}
                    </span>
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                cell: (row: ShopLocationAdmin) => (
                  <span
                    className="admin-pill"
                    data-tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}
                  >
                    {row.status}
                  </span>
                ),
              },
              {
                key: 'action',
                header: 'Aksi',
                cell: (row: ShopLocationAdmin) => (
                  <div style={{ display: 'grid', gap: '0.25rem', justifyItems: 'start' }}>
                    <Button size="sm" variant="ghost" onClick={() => begin(row)}>
                      <Pencil size={13} /> Ubah
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={setStatus.isPending && setStatus.variables?.id === row.id}
                      onClick={() => setStatus.mutate(row)}
                    >
                      {row.status === 'ACTIVE' ? <Archive size={13} /> : <RotateCcw size={13} />}{' '}
                      {row.status === 'ACTIVE' ? 'Arsipkan' : 'Aktifkan'}
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={shops.data ?? []}
            rowKey={(row: ShopLocationAdmin) => row.id}
            empty={
              <AdminEmpty
                title="Belum ada lokasi shop"
                description="Tambahkan department produksi beserta area dan aliasnya."
              />
            }
          />
        )}
        {setStatus.error ? (
          <div style={{ padding: '0 1.25rem 1rem' }}>
            <Alert tone="danger" title="Status gagal diubah">
              {String((setStatus.error as Error).message)}
            </Alert>
          </div>
        ) : null}
        {unmatchedRows.length ? (
          <div style={{ padding: '0 1.25rem 1.25rem' }}>
            <Alert tone="info" title="Detail lokasi yang belum cocok (30 hari)">
              <ul className="admin-unmatched-list">
                {unmatchedRows.map((row) => (
                  <li key={`${row.area}:${row.locationDetail}`}>
                    “{row.locationDetail}” · {areaLabel(row.area)} · {row.count} Voice
                  </li>
                ))}
              </ul>
              Tambahkan kata ini sebagai alias bila memang merujuk ke shop tertentu.
            </Alert>
          </div>
        ) : null}
      </section>
      <Drawer
        open={open}
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        title={selected ? `Ubah ${selected.organizationUnit.department}` : 'Tambah shop'}
        description="Manager penerima adalah Dept Head/default PIC aktif department ini."
      >
        <Stack gap="md">
          {selected ? (
            <Input label="Department" value={form.organizationUnitLabel} readOnly />
          ) : (
            <>
              <Input
                label="Cari department"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {units.isLoading ? (
                <AdminSkeleton lines={3} label="Mencari department" />
              ) : (
                <Stack gap="xs">
                  {units.data?.items.map((unit) => (
                    <Button
                      key={unit.id}
                      variant={form.organizationUnitId === unit.id ? 'primary' : 'secondary'}
                      onClick={() =>
                        setForm({
                          ...form,
                          organizationUnitId: unit.id,
                          organizationUnitLabel: unit.compositeKey,
                        })
                      }
                    >
                      <span className="admin-nums">{unit.compositeKey}</span>
                    </Button>
                  ))}
                  {!units.data?.items.length ? (
                    <AdminEmpty
                      title="Tidak ada department"
                      description="Department tidak ditemukan."
                    />
                  ) : null}
                </Stack>
              )}
            </>
          )}
          <fieldset className="admin-fieldset">
            <legend>Area shop</legend>
            {AREAS.map((area) => (
              <Checkbox
                key={area.value}
                label={area.label}
                checked={form.areas.includes(area.value)}
                onCheckedChange={(checked) =>
                  setForm({
                    ...form,
                    areas: checked
                      ? AREAS.map((item) => item.value).filter(
                          (value) => value === area.value || form.areas.includes(value),
                        )
                      : form.areas.filter((value) => value !== area.value),
                  })
                }
              />
            ))}
          </fieldset>
          <fieldset className="admin-fieldset">
            <legend>Alias (sebutan yang biasa diketik)</legend>
            {form.aliases.length ? (
              <span className="admin-chip-list">
                {form.aliases.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="admin-pill admin-pill--removable"
                    data-tone="neutral"
                    aria-label={`Hapus alias ${value}`}
                    onClick={() =>
                      setForm({ ...form, aliases: form.aliases.filter((item) => item !== value) })
                    }
                  >
                    {value} <X size={11} aria-hidden="true" />
                  </button>
                ))}
              </span>
            ) : (
              <small>Belum ada alias.</small>
            )}
            <div className="admin-inline-add">
              <Input
                label="Tambah alias"
                placeholder="mis. assy 1"
                value={alias}
                maxLength={60}
                onChange={(event) => setAlias(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addAlias();
                  }
                }}
              />
              <Button variant="secondary" disabled={!alias.trim()} onClick={addAlias}>
                <Plus size={14} /> Tambah
              </Button>
            </div>
            <small>
              Huruf besar, spasi, dan tanda seperti # atau - diabaikan: “Assy #1” sama dengan “assy
              1”.
            </small>
          </fieldset>
          {selected ? (
            <Alert
              tone={selected.health === 'HEALTHY' ? 'success' : 'warning'}
              title={`Manager penerima · ${selected.health}`}
            >
              {selected.pic?.name ?? 'Department ini belum memiliki tepat satu PIC aktif.'}
            </Alert>
          ) : null}
          {save.error ? (
            <Alert tone="danger" title="Gagal menyimpan">
              {String((save.error as Error).message)}
            </Alert>
          ) : null}
          <Button
            loading={save.isPending}
            disabled={!form.organizationUnitId || !form.areas.length}
            onClick={() => save.mutate()}
          >
            Simpan lokasi shop
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}
