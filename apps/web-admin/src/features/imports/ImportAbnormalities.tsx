import { Alert, Button } from '@care/ui';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useState } from 'react';

export type OrgField = 'line' | 'section' | 'department' | 'division';

export type ImportAbnormality = {
  row: number;
  noReg: string;
  name: string;
  structuralPosition: string;
  values: Record<OrgField, string | null>;
  missing: OrgField[];
};

const FIELDS: { key: OrgField; label: string }[] = [
  { key: 'line', label: 'Line' },
  { key: 'section', label: 'Seksi' },
  { key: 'department', label: 'Departemen' },
  { key: 'division', label: 'Divisi' },
];

const fieldLabel = (key: OrgField) => FIELDS.find((field) => field.key === key)!.label;

/** One incomplete row: missing cells become inputs, the rest stay as text. */
function AbnormalityRow({
  item,
  onSave,
}: {
  item: ImportAbnormality;
  onSave: (noReg: string, values: Partial<Record<OrgField, string>>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Partial<Record<OrgField, string>>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const complete = item.missing.every((key) => draft[key]?.trim());
  const save = async () => {
    setPending(true);
    setError('');
    try {
      await onSave(item.noReg, draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan.');
    } finally {
      setPending(false);
    }
  };
  return (
    <tr>
      <td className="admin-nums admin-meta--xs">{item.row}</td>
      <td>
        <span className="admin-id admin-nums">{item.noReg}</span>
        <span className="admin-abnormal__name">{item.name}</span>
      </td>
      <td>{item.structuralPosition}</td>
      {FIELDS.map((field) => (
        <td key={field.key}>
          {item.missing.includes(field.key) ? (
            <input
              className="admin-abnormal__input"
              aria-label={`${field.label} ${item.noReg}`}
              aria-invalid={!draft[field.key]?.trim()}
              placeholder="Wajib diisi"
              value={draft[field.key] ?? ''}
              onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
            />
          ) : (
            <span className={item.values[field.key] ? undefined : 'admin-meta--xs'}>
              {item.values[field.key] ?? '–'}
            </span>
          )}
        </td>
      ))}
      <td>
        <Button size="sm" disabled={!complete} loading={pending} onClick={() => void save()}>
          Simpan
        </Button>
        {error ? (
          <span role="alert" className="admin-meta--xs admin-export__error">
            {error}
          </span>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * Leaders whose organization columns are incomplete. The import cannot be
 * confirmed until every row is completed here; no re-upload is needed.
 */
export function ImportAbnormalities({
  items,
  onSave,
}: {
  items: ImportAbnormality[];
  onSave: (noReg: string, values: Partial<Record<OrgField, string>>) => Promise<void>;
}) {
  if (!items.length)
    return (
      <Alert tone="success" title="Data organisasi lengkap">
        <CheckCircle2 size={14} aria-hidden="true" /> Semua Group Leader, Section Head, Department
        Head, dan Division Head punya data unit yang lengkap.
      </Alert>
    );
  const counts = FIELDS.map((field) => ({
    ...field,
    count: items.filter((item) => item.missing.includes(field.key)).length,
  })).filter((field) => field.count);
  return (
    <section className="admin-table-card admin-abnormal" aria-label="Data belum lengkap">
      <div className="admin-abnormal__head">
        <div>
          <h2 className="admin-card__title">
            <CircleAlert size={16} aria-hidden="true" /> {items.length} data belum lengkap
          </h2>
          <p className="admin-meta--xs">Lengkapi di sini sebelum konfirmasi.</p>
        </div>
        <div className="admin-abnormal__chips">
          {counts.map((field) => (
            <span key={field.key} className="admin-pill" data-tone="warning">
              {fieldLabel(field.key)} kosong: {field.count}
            </span>
          ))}
        </div>
      </div>
      <div className="admin-table-scroll">
        <table className="care-table admin-abnormal__table">
          <thead>
            <tr>
              <th>Baris</th>
              <th>No. Reg / Nama</th>
              <th>Posisi</th>
              {FIELDS.map((field) => (
                <th key={field.key}>{field.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <AbnormalityRow key={item.noReg} item={item} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
