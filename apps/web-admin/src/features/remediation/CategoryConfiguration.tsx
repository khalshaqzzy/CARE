import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  Input,
  Loader,
  Select,
  Stack,
  Textarea,
} from '@care/ui';
import { Archive, ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createAdminApi, type GeneralVoiceCategoryAdmin } from '../../admin-api';

type RouteView = {
  mode?: string;
  organizationUnit?: {
    id: string;
    directorate: string;
    division: string;
    department: string;
  } | null;
  pic?: { name: string; noReg: string | null } | null;
  health?: string;
};
type Form = {
  name: string;
  definition: string;
  examples: string[];
  mode: 'FIXED_DEPARTMENT' | 'RELATED_REPORTER_DEPARTMENT';
  organizationUnitId: string;
  organizationUnitLabel: string;
  routeHealth: string;
  routePicLabel: string;
};
const emptyForm: Form = {
  name: '',
  definition: '',
  examples: [''],
  mode: 'RELATED_REPORTER_DEPARTMENT',
  organizationUnitId: '',
  organizationUnitLabel: '',
  routeHealth: '',
  routePicLabel: '',
};

export function CategoryConfiguration() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const queryKey = careQueryKey(session?.sessionId ?? 'anon', 'general-voice-categories-admin');
  const categories = useQuery({
    queryKey,
    queryFn: () => api.generalVoiceCategories('ALL'),
    enabled: !!session,
  });
  const [selected, setSelected] = useState<GeneralVoiceCategoryAdmin | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [search, setSearch] = useState('');
  const [division, setDivision] = useState('');
  const [unitCursor, setUnitCursor] = useState('');
  const [unitCursorHistory, setUnitCursorHistory] = useState<string[]>([]);
  const divisions = useQuery({
    queryKey: [...queryKey, 'divisions'],
    queryFn: () => api.organizationDivisions(),
    enabled: open && form.mode === 'FIXED_DEPARTMENT',
  });
  const units = useQuery({
    queryKey: [...queryKey, 'units', search, division, unitCursor],
    queryFn: () =>
      api.organizationUnits({
        ...(search ? { search } : {}),
        ...(division ? { division } : {}),
        ...(unitCursor ? { cursor: unitCursor } : {}),
        limit: 50,
      }),
    enabled: open && form.mode === 'FIXED_DEPARTMENT',
  });
  const history = useQuery({
    queryKey: [...queryKey, selected?.id ?? 'new', 'history'],
    queryFn: () => api.generalVoiceCategoryHistory(selected!.id),
    enabled: open && !!selected,
  });

  const save = useMutation({
    mutationFn: () => {
      const route =
        form.mode === 'FIXED_DEPARTMENT'
          ? ({ mode: form.mode, organizationUnitId: form.organizationUnitId } as const)
          : ({ mode: form.mode } as const);
      const content = {
        name: form.name.trim(),
        definition: form.definition.trim(),
        examples: form.examples.map((value) => value.trim()).filter(Boolean),
        route,
      };
      return selected
        ? api.updateGeneralVoiceCategory(
            selected.id,
            { ...content, expectedVersion: selected.version },
            crypto.randomUUID(),
          )
        : api.createGeneralVoiceCategory(content, crypto.randomUUID());
    },
    onSuccess: () => {
      setOpen(false);
      setSelected(null);
      setForm(emptyForm);
      void qc.invalidateQueries({ queryKey });
    },
  });
  const setStatus = useMutation({
    mutationFn: (category: GeneralVoiceCategoryAdmin) => {
      if (
        category.status === 'ACTIVE' &&
        !window.confirm(
          `${category.name} akan disembunyikan dari klasifikasi dan fallback baru. Voice historis tidak berubah. Lanjutkan?`,
        )
      )
        return Promise.resolve(null);
      return api.setGeneralVoiceCategoryStatus(
        category.id,
        {
          status: category.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
          expectedVersion: category.version,
        },
        crypto.randomUUID(),
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });

  const begin = (category?: GeneralVoiceCategoryAdmin) => {
    setSelected(category ?? null);
    setUnitCursor('');
    setUnitCursorHistory([]);
    const route = (category?.route ?? {}) as RouteView;
    setForm(
      category
        ? {
            name: category.name,
            definition: category.definition,
            examples: [...category.examples],
            mode:
              route.mode === 'FIXED_DEPARTMENT'
                ? 'FIXED_DEPARTMENT'
                : 'RELATED_REPORTER_DEPARTMENT',
            organizationUnitId: route.organizationUnit?.id ?? '',
            organizationUnitLabel: route.organizationUnit
              ? `${route.organizationUnit.directorate} / ${route.organizationUnit.division} / ${route.organizationUnit.department}`
              : '',
            routeHealth: route.health ?? '',
            routePicLabel: route.pic
              ? `${route.pic.name}${route.pic.noReg ? ` (${route.pic.noReg})` : ''}`
              : '',
          }
        : emptyForm,
    );
    setOpen(true);
  };

  return (
    <>
      <Card>
        <Stack gap="md">
          <div className="remediation-workspace__head">
            <div>
              <div>
                <h2>Konfigurasi Kategori General Voice</h2>
                <p>Atur prompt context, department in charge, dan PIC efektif.</p>
              </div>
            </div>
            <Button onClick={() => begin()}>
              <Plus size={16} /> Tambah kategori
            </Button>
          </div>
          {categories.isLoading ? (
            <Loader label="Memuat kategori" />
          ) : categories.error ? (
            <Alert tone="danger" title="Kategori gagal dimuat">
              {String((categories.error as Error).message)}
            </Alert>
          ) : (
            <DataTable
              caption="Konfigurasi kategori General Voice"
              columns={[
                {
                  key: 'name',
                  header: 'Kategori',
                  cell: (row: GeneralVoiceCategoryAdmin) => (
                    <div>
                      <strong>{row.name}</strong>
                      <br />
                      <small>
                        {row.key} · revisi {row.revision}
                      </small>
                      <br />
                      <small>{new Date(row.updatedAt).toLocaleString('id-ID')}</small>
                    </div>
                  ),
                },
                {
                  key: 'department',
                  header: 'Department',
                  cell: (row: GeneralVoiceCategoryAdmin) => {
                    const route = row.route as RouteView;
                    return route.mode === 'RELATED_REPORTER_DEPARTMENT'
                      ? 'Related Dept (department reporter)'
                      : route.organizationUnit
                        ? `${route.organizationUnit.directorate} / ${route.organizationUnit.division} / ${route.organizationUnit.department}`
                        : 'Belum dikonfigurasi';
                  },
                },
                {
                  key: 'pic',
                  header: 'PIC',
                  cell: (row: GeneralVoiceCategoryAdmin) => {
                    const route = row.route as RouteView;
                    return route.mode === 'RELATED_REPORTER_DEPARTMENT'
                      ? 'Mengikuti PIC department reporter'
                      : route.pic
                        ? `${route.pic.name}${route.pic.noReg ? ` (${route.pic.noReg})` : ''}`
                        : 'Belum tersedia';
                  },
                },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (row: GeneralVoiceCategoryAdmin) => (
                    <Stack gap="xs">
                      <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {row.status}
                      </Badge>
                      <Badge
                        tone={(row.route as RouteView).health === 'HEALTHY' ? 'success' : 'warning'}
                      >
                        {(row.route as RouteView).health ?? 'GAP'}
                      </Badge>
                    </Stack>
                  ),
                },
                {
                  key: 'action',
                  header: 'Aksi',
                  cell: (row: GeneralVoiceCategoryAdmin) => (
                    <div>
                      <Button size="sm" variant="secondary" onClick={() => begin(row)}>
                        Ubah
                      </Button>{' '}
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate(row)}>
                        {row.status === 'ACTIVE' ? <Archive size={14} /> : <RotateCcw size={14} />}{' '}
                        {row.status === 'ACTIVE' ? 'Arsipkan' : 'Aktifkan'}
                      </Button>
                    </div>
                  ),
                },
              ]}
              rows={categories.data ?? []}
              rowKey={(row: GeneralVoiceCategoryAdmin) => row.id}
            />
          )}
        </Stack>
      </Card>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={selected ? `Ubah ${selected.name}` : 'Tambah kategori'}
        description="Definition dan Examples menjadi context tambahan; instruction dan tool wrapper tidak dapat diubah."
      >
        <Stack gap="md">
          <Input
            label="Nama kategori"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <Textarea
            label="Definition"
            value={form.definition}
            onChange={(event) => setForm({ ...form, definition: event.target.value })}
          />
          <strong>Examples</strong>
          {form.examples.map((example, index) => (
            <div key={index} style={{ display: 'flex', gap: 8 }}>
              <Input
                label={`Example ${index + 1}`}
                value={example}
                onChange={(event) =>
                  setForm({
                    ...form,
                    examples: form.examples.map((value, i) =>
                      i === index ? event.target.value : value,
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                aria-label={`Naikkan example ${index + 1}`}
                disabled={index === 0}
                onClick={() => {
                  const examples = [...form.examples];
                  [examples[index - 1], examples[index]] = [examples[index]!, examples[index - 1]!];
                  setForm({ ...form, examples });
                }}
              >
                <ArrowUp size={16} />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Turunkan example ${index + 1}`}
                disabled={index === form.examples.length - 1}
                onClick={() => {
                  const examples = [...form.examples];
                  [examples[index], examples[index + 1]] = [examples[index + 1]!, examples[index]!];
                  setForm({ ...form, examples });
                }}
              >
                <ArrowDown size={16} />
              </Button>
              <Button
                variant="ghost"
                aria-label={`Hapus example ${index + 1}`}
                onClick={() =>
                  setForm({ ...form, examples: form.examples.filter((_, i) => i !== index) })
                }
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
          <Button
            variant="secondary"
            onClick={() => setForm({ ...form, examples: [...form.examples, ''] })}
          >
            <Plus size={16} /> Tambah example
          </Button>
          <Select
            label="Department in charge"
            value={form.mode}
            onValueChange={(value) =>
              setForm({
                ...form,
                mode: value as Form['mode'],
                organizationUnitId:
                  value === 'RELATED_REPORTER_DEPARTMENT' ? '' : form.organizationUnitId,
              })
            }
            options={[
              { value: 'RELATED_REPORTER_DEPARTMENT', label: 'Related Dept (department reporter)' },
              { value: 'FIXED_DEPARTMENT', label: 'Fixed department' },
            ]}
          />
          {form.mode === 'FIXED_DEPARTMENT' ? (
            <>
              <Select
                label="Filter division"
                value={division || 'ALL'}
                onValueChange={(value) => {
                  setDivision(value === 'ALL' ? '' : value);
                  setUnitCursor('');
                  setUnitCursorHistory([]);
                }}
                options={[
                  { value: 'ALL', label: 'Semua division' },
                  ...(divisions.data ?? []).map((value) => ({ value, label: value })),
                ]}
              />
              <Input
                label="Cari department"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setUnitCursor('');
                  setUnitCursorHistory([]);
                }}
              />
              {units.isLoading ? (
                <Loader label="Mencari department" />
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
                          routeHealth: unit.routeHealth,
                          routePicLabel: unit.currentRouteOwner
                            ? String(
                                (unit.currentRouteOwner as { displayName?: string }).displayName ??
                                  '',
                              )
                            : '',
                        })
                      }
                    >
                      {unit.compositeKey}
                    </Button>
                  ))}
                  {!units.data?.items.length ? <p>Department tidak ditemukan.</p> : null}
                  <div>
                    <Button
                      variant="ghost"
                      disabled={!unitCursorHistory.length}
                      onClick={() => {
                        const previous = unitCursorHistory.at(-1) ?? '';
                        setUnitCursorHistory(unitCursorHistory.slice(0, -1));
                        setUnitCursor(previous);
                      }}
                    >
                      Sebelumnya
                    </Button>{' '}
                    <Button
                      variant="ghost"
                      disabled={!units.data?.nextCursor}
                      onClick={() => {
                        setUnitCursorHistory([...unitCursorHistory, unitCursor]);
                        setUnitCursor(units.data?.nextCursor ?? '');
                      }}
                    >
                      Berikutnya
                    </Button>
                  </div>
                </Stack>
              )}
              {form.organizationUnitLabel ? (
                <Alert
                  tone={form.routeHealth === 'HEALTHY' ? 'success' : 'warning'}
                  title={`Department dipilih · ${form.routeHealth || 'GAP'}`}
                >
                  {form.organizationUnitLabel}
                  <br />
                  PIC: {form.routePicLabel || 'Belum tersedia'}
                </Alert>
              ) : null}
            </>
          ) : (
            <Alert tone="info" title="Related Dept">
              Department reporter dan PIC aktif department tersebut akan di-resolve saat submit.
            </Alert>
          )}
          {save.error ? (
            <Alert tone="danger" title="Gagal menyimpan">
              {String((save.error as Error).message)}
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void qc.invalidateQueries({ queryKey });
                    setOpen(false);
                    setSelected(null);
                  }}
                >
                  Muat ulang konfigurasi
                </Button>
              </div>
            </Alert>
          ) : null}
          {selected ? (
            <div>
              <strong>Riwayat revisi</strong>
              {history.isLoading ? (
                <Loader label="Memuat riwayat revisi" />
              ) : history.error ? (
                <Alert tone="danger" title="Riwayat gagal dimuat">
                  {String((history.error as Error).message)}
                </Alert>
              ) : (
                <ul>
                  {(history.data ?? []).map((revision) => (
                    <li key={String(revision.id)}>
                      Revisi {String(revision.revision)} · {String(revision.name)} ·{' '}
                      {new Date(String(revision.effectiveFrom)).toLocaleString('id-ID')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <Button
            loading={save.isPending}
            disabled={
              !form.name.trim() ||
              !form.definition.trim() ||
              !form.examples.some((value) => value.trim()) ||
              (form.mode === 'FIXED_DEPARTMENT' && !form.organizationUnitId)
            }
            onClick={() => save.mutate()}
          >
            Simpan konfigurasi
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}
