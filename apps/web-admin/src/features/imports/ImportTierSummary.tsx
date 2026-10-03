import { Alert } from '@care/ui';
import type { components } from '@care/contracts';

type Tiers = NonNullable<components['schemas']['OrganizationImportSummary']['tiers']>;

/**
 * Area/Line counts for tiered routing. Several leaders of a Section or Line hold
 * that level together, and a Line without a Group Leader goes to the Section
 * Head, so there is nothing to warn about once the columns are present.
 */
export function ImportTierSummary({ tiers }: { tiers?: Tiers | undefined }) {
  if (!tiers) return null;
  if (!tiers.columnsPresent)
    return (
      <Alert tone="warning" title="Kolom Area dan Line tidak ada">
        File memakai format lama. Area dan Line seluruh karyawan akan dikosongkan, sehingga tidak
        ada member yang memiliki Group Leader.
      </Alert>
    );
  return (
    <Alert tone="success" title="Area & Line (routing bertingkat)">
      <p className="admin-tier-counts">
        {tiers.groupLeaders.toLocaleString('id-ID')} Group Leader ·{' '}
        {tiers.withLine.toLocaleString('id-ID')} karyawan dengan Line ·{' '}
        {tiers.withArea.toLocaleString('id-ID')} karyawan dengan Area
      </p>
    </Alert>
  );
}
