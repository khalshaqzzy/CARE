import { BottomSheet } from '@care/ui';
import { ChevronRight, UserRound } from 'lucide-react';

/** Reporter snapshot fields a General responder or leader may read. */
export type ReporterProfile = {
  noReg?: string;
  name?: string;
  division?: string;
  department?: string;
  section?: string | null;
  line?: string | null;
};

/** Organization path rows, skipping levels the reporter does not have. */
export function reporterOrganizationRows(reporter: ReporterProfile) {
  return [
    { label: 'Divisi', value: reporter.division },
    { label: 'Departemen', value: reporter.department },
    { label: 'Section', value: reporter.section },
    { label: 'Line', value: reporter.line },
  ].filter((row): row is { label: string; value: string } => !!row.value);
}

/**
 * The reporter's name in the hero opens a sheet (dialog on desktop) with the
 * submit-time snapshot: No. Reg and the division → department → section →
 * line path. Keeping the path behind the name holds the hero to one line.
 */
export function ReporterProfileSheet({ reporter }: { reporter: ReporterProfile }) {
  const rows = reporterOrganizationRows(reporter);
  return (
    <BottomSheet
      title="Profil pelapor"
      size="sm"
      trigger={
        <button
          type="button"
          className="reporter-profile__trigger"
          aria-label={`Lihat profil pelapor ${reporter.name ?? ''}`.trim()}
        >
          <span>{reporter.name}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      }
    >
      <div className="reporter-profile">
        <div className="reporter-profile__who">
          <span className="reporter-profile__avatar" aria-hidden="true">
            <UserRound size={22} />
          </span>
          <div>
            <p className="reporter-profile__name">{reporter.name}</p>
            {reporter.noReg ? (
              <p className="reporter-profile__reg">No. Reg {reporter.noReg}</p>
            ) : null}
          </div>
        </div>
        {rows.length ? (
          <dl className="reporter-profile__list">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </BottomSheet>
  );
}
