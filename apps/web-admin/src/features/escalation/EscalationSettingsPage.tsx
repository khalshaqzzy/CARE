import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careQueryKey, useAuth } from '@care/frontend-core';
import { Alert, Button, Input, Select, Switch } from '@care/ui';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createAdminApi, type EscalationDeadline, type EscalationSettings } from '../../admin-api';
import { AdminPageHeader } from '../../components/AdminPageHeader';
import { AdminSkeleton } from '../../components/AdminSkeleton';

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];
const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};
type Exception = EscalationSettings['calendar']['exceptions'][number];
type Draft = Pick<EscalationDeadline, 'severity' | 'respondAmount' | 'processAmount' | 'unit'>;

const pad = (value: number) => String(value).padStart(2, '0');
const dateKey = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;
const formatDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return `${day} ${MONTHS[month! - 1]!.slice(0, 3)} ${year}`;
};

/**
 * Working calendar and per-severity respond/process windows for tiered Voice
 * escalation (Kesulitan Kerja and Kesejahteraan).
 */
export function EscalationSettingsPage() {
  const { session, transport } = useAuth();
  const api = useMemo(() => createAdminApi(transport), [transport]);
  const qc = useQueryClient();
  const queryKey = careQueryKey(session?.sessionId ?? 'anon', 'escalation-settings');
  const settings = useQuery({
    queryKey,
    queryFn: () => api.escalationSettings(),
    enabled: !!session,
  });
  const store = (next: EscalationSettings) => qc.setQueryData(queryKey, next);
  const toggle = useMutation({
    mutationFn: (useStandard: boolean) =>
      api.updateWorkingCalendar({
        useStandard,
        expectedVersion: settings.data!.calendar.version,
      }),
    onSuccess: store,
  });
  const addException = useMutation({
    mutationFn: api.addCalendarException,
    onSuccess: (next) => {
      store(next);
      setForm({ date: '', kind: 'HOLIDAY', label: '' });
    },
  });
  const removeException = useMutation({
    mutationFn: api.removeCalendarException,
    onSuccess: store,
  });
  const saveDeadlines = useMutation({
    mutationFn: (rows: Draft[]) =>
      api.updateEscalationDeadlines({
        deadlines: rows.map((row) => ({
          ...row,
          expectedVersion: settings.data!.deadlines.find((d) => d.severity === row.severity)!
            .version,
        })),
      }),
    onSuccess: store,
  });

  const today = new Date();
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [form, setForm] = useState<{ date: string; kind: Exception['kind']; label: string }>({
    date: '',
    kind: 'HOLIDAY',
    label: '',
  });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  useEffect(() => {
    if (settings.data)
      setDrafts(
        settings.data.deadlines.map(({ severity, respondAmount, processAmount, unit }) => ({
          severity,
          respondAmount,
          processAmount,
          unit,
        })),
      );
  }, [settings.data]);

  if (settings.isLoading) return <AdminSkeleton lines={6} label="Memuat pengaturan eskalasi" />;
  if (settings.error || !settings.data)
    return (
      <Alert tone="danger" title="Pengaturan gagal dimuat">
        {String((settings.error as Error | null)?.message ?? 'Coba muat ulang halaman.')}
      </Alert>
    );

  const calendar = settings.data.calendar;
  const exceptions = new Map(calendar.exceptions.map((row) => [row.date, row]));
  const firstWeekday = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  const dirty = drafts.some((row) => {
    const saved = settings.data!.deadlines.find((d) => d.severity === row.severity);
    return (
      !saved ||
      saved.respondAmount !== row.respondAmount ||
      saved.processAmount !== row.processAmount ||
      saved.unit !== row.unit
    );
  });
  const invalid = drafts.some(
    (row) =>
      !Number.isInteger(row.respondAmount) ||
      !Number.isInteger(row.processAmount) ||
      row.respondAmount < 1 ||
      row.processAmount < 1,
  );
  const mutationError = [toggle, addException, removeException, saveDeadlines].find(
    (mutation) => mutation.error,
  )?.error as Error | undefined;

  return (
    <div className="tierset">
      <AdminPageHeader
        eyebrow="Routing bertingkat"
        title="Kalender & Eskalasi"
        description="Dipakai untuk menghitung kapan Voice Kesulitan Kerja dan Kesejahteraan naik ke level atas. Perubahan hanya berlaku untuk batas waktu yang dihitung setelah disimpan."
      />
      {mutationError ? (
        <Alert tone="danger" title="Perubahan gagal disimpan">
          {mutationError.message}
        </Alert>
      ) : null}
      <div className="tierset__grid">
        <section
          className="admin-table-card admin-card--lift tierset__card"
          aria-label="Kalender hari kerja"
        >
          <h2 className="admin-card__title">Kalender hari kerja</h2>
          <Switch
            checked={calendar.useStandard}
            disabled={toggle.isPending}
            onCheckedChange={(value) => toggle.mutate(value)}
            label="Ikuti kalender standar"
            description="Senin–Jumat hari kerja, Sabtu–Minggu libur, tanpa pengecualian."
          />
          {calendar.useStandard ? (
            <Alert tone="info" title="Kalender standar aktif">
              Hari khusus tidak dipakai. Matikan untuk menambah libur atau hari masuk tambahan.
            </Alert>
          ) : null}
          <div className="tierset__month" data-muted={calendar.useStandard}>
            <div className="tierset__monthhead">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Bulan sebelumnya"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft size={16} />
              </Button>
              <strong>
                {MONTHS[cursor.month]} {cursor.year}
              </strong>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Bulan berikutnya"
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
            <div className="tierset__cal" aria-label={`${MONTHS[cursor.month]} ${cursor.year}`}>
              {DAYS.map((day) => (
                <span key={day} className="tierset__dow">
                  {day}
                </span>
              ))}
              {Array.from({ length: firstWeekday }, (_, i) => (
                <span key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const key = dateKey(cursor.year, cursor.month, i + 1);
                const weekday = (firstWeekday + i) % 7;
                const exception = calendar.useStandard ? undefined : exceptions.get(key);
                const kind = exception
                  ? exception.kind === 'HOLIDAY'
                    ? 'off'
                    : 'work'
                  : weekday >= 5
                    ? 'weekend'
                    : 'work-std';
                return (
                  <button
                    key={key}
                    type="button"
                    className="tierset__day"
                    data-kind={kind}
                    title={exception?.label}
                    disabled={calendar.useStandard}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        date: key,
                        kind: weekday >= 5 ? 'WORKDAY' : 'HOLIDAY',
                      }))
                    }
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="tierset__legend">
              <span data-kind="work-std">Hari kerja</span>
              <span data-kind="weekend">Libur standar</span>
              <span data-kind="off">Libur khusus</span>
              <span data-kind="work">Masuk khusus</span>
            </div>
          </div>
          {!calendar.useStandard ? (
            <>
              <h3 className="tierset__sub">Hari khusus</h3>
              {calendar.exceptions.length ? (
                <ul className="tierset__list">
                  {calendar.exceptions.map((row) => (
                    <li key={row.id}>
                      <span
                        className="tierset__tag"
                        data-kind={row.kind === 'HOLIDAY' ? 'off' : 'work'}
                      >
                        {row.kind === 'HOLIDAY' ? 'Libur' : 'Masuk'}
                      </span>
                      <span>
                        <strong>{formatDate(row.date)}</strong>
                        <small>{row.label}</small>
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Hapus ${formatDate(row.date)}`}
                        loading={removeException.isPending && removeException.variables === row.id}
                        onClick={() => removeException.mutate(row.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="admin-meta">Belum ada hari khusus.</p>
              )}
              <div className="tierset__form">
                <Input
                  label="Tanggal"
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm({ ...form, date: event.target.value })}
                />
                <Select
                  label="Jenis"
                  value={form.kind}
                  onValueChange={(value) => setForm({ ...form, kind: value as Exception['kind'] })}
                  options={[
                    { value: 'HOLIDAY', label: 'Libur khusus' },
                    { value: 'WORKDAY', label: 'Masuk khusus' },
                  ]}
                />
                <Input
                  label="Keterangan"
                  placeholder="mis. Cuti bersama"
                  maxLength={120}
                  value={form.label}
                  onChange={(event) => setForm({ ...form, label: event.target.value })}
                />
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={addException.isPending}
                disabled={!form.date || !form.label.trim()}
                onClick={() =>
                  addException.mutate({
                    date: form.date,
                    kind: form.kind,
                    label: form.label.trim(),
                  })
                }
              >
                <Plus size={14} /> Tambah hari khusus
              </Button>
            </>
          ) : null}
        </section>
        <section
          className="admin-table-card admin-card--lift tierset__card"
          aria-label="Batas waktu per jenjang"
        >
          <h2 className="admin-card__title">Batas waktu per jenjang</h2>
          <p className="admin-card__subtitle">
            Berlaku di setiap level (GL, SH, Manager, Deputy/Division Head).
          </p>
          <table className="tierset__table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Respons</th>
                <th scope="col">Proses</th>
                <th scope="col">Satuan</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((row, index) => {
                const update = (patch: Partial<Draft>) =>
                  setDrafts(drafts.map((item, i) => (i === index ? { ...item, ...patch } : item)));
                const label = SEVERITY_LABELS[row.severity] ?? row.severity;
                return (
                  <tr key={row.severity}>
                    <td>
                      <span className="tierset__sev" data-severity={row.severity}>
                        {label}
                      </span>
                    </td>
                    <td>
                      <Input
                        label={`Respons ${label}`}
                        hideLabel
                        type="number"
                        min={1}
                        value={String(row.respondAmount)}
                        onChange={(event) => update({ respondAmount: Number(event.target.value) })}
                      />
                    </td>
                    <td>
                      <Input
                        label={`Proses ${label}`}
                        hideLabel
                        type="number"
                        min={1}
                        value={String(row.processAmount)}
                        onChange={(event) => update({ processAmount: Number(event.target.value) })}
                      />
                    </td>
                    <td className="tierset__unit">
                      <Select
                        label={`Satuan ${label}`}
                        hideLabel
                        value={row.unit}
                        onValueChange={(value) => update({ unit: value as Draft['unit'] })}
                        options={[
                          { value: 'WORKING_DAY', label: 'Hari kerja' },
                          { value: 'CALENDAR_HOUR', label: 'Jam kalender' },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Alert tone="info" title="Critical">
            Semua level di atas pelapor langsung menerima notifikasi saat Voice Critical masuk.
          </Alert>
          <Button
            loading={saveDeadlines.isPending}
            disabled={!dirty || invalid}
            onClick={() => saveDeadlines.mutate(drafts)}
          >
            Simpan batas waktu
          </Button>
        </section>
      </div>
    </div>
  );
}
