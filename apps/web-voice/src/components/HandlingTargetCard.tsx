import { CalendarDays, CircleAlert, CircleCheck, Hourglass } from 'lucide-react';
import type { VoiceDetail } from '../workforce-api';
import { formatTargetDate } from '../lib/handling-target';

const labels = {
  ON_TRACK: 'Dalam target',
  OVERDUE: 'Target terlewati',
  COMPLETED_ON_TIME: 'Selesai sesuai target',
  COMPLETED_LATE: 'Selesai melewati target',
  SPECIAL: 'Penanganan Khusus',
};
export function HandlingTargetCard({ voice }: { voice: VoiceDetail }) {
  const targets = voice.handlingTargets ?? [];
  const current = targets.find((target) => target.cycleNumber === voice.handlingCycleNumber);
  const history = targets.filter((target) => target !== current);
  if (!['IN_PROGRESS', 'CLOSED'].includes(voice.status) && !targets.length) return null;
  const state = current?.state ?? 'ON_TRACK';
  const isSpecial = current?.kind === 'SPECIAL';
  const late = state === 'OVERDUE' || state === 'COMPLETED_LATE';
  const overdueHours =
    current?.dueAt != null
      ? Math.max(1, Math.floor((Date.now() - new Date(current.dueAt).getTime()) / 3600000))
      : 0;
  const Icon = isSpecial
    ? Hourglass
    : late
      ? CircleAlert
      : state === 'COMPLETED_ON_TIME'
        ? CircleCheck
        : CalendarDays;
  return (
    <section
      className={`handling-target${late ? ' is-late' : ''}${isSpecial ? ' is-special' : ''}`}
      aria-label={isSpecial ? 'Penanganan Khusus' : 'Target penyelesaian'}
    >
      <div className="handling-target__icon">
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className="handling-target__content">
        <h2>{isSpecial ? 'Penanganan Khusus' : 'Target penyelesaian'}</h2>
        <strong>
          {isSpecial
            ? 'Tanpa target waktu'
            : current?.dueAt
              ? formatTargetDate(current.dueAt)
              : 'Belum ditetapkan'}
        </strong>
        <p>
          {isSpecial
            ? current?.specialReason
            : current
              ? labels[state]
              : 'PIC perlu menetapkan target untuk siklus penanganan ini.'}
          {state === 'OVERDUE'
            ? ` · ${overdueHours < 24 ? `${overdueHours} jam` : `${Math.floor(overdueHours / 24)} hari`} melewati target`
            : ''}
        </p>
        {current && !isSpecial && current.specialReason ? (
          <p>Awalnya Penanganan Khusus: {current.specialReason}</p>
        ) : null}
        {history.length ? (
          <details>
            <summary>Riwayat target ({history.length})</summary>
            {history.map((target) => (
              <p key={target.id}>
                Siklus {target.cycleNumber} ·{' '}
                {target.dueAt ? formatTargetDate(target.dueAt) : 'Penanganan Khusus'}
                <br />
                {labels[target.state ?? 'ON_TRACK']}
              </p>
            ))}
          </details>
        ) : null}
      </div>
    </section>
  );
}
