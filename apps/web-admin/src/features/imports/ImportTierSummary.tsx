import { Alert } from '@care/ui';
import type { components } from '@care/contracts';

type Tiers = NonNullable<components['schemas']['OrganizationImportSummary']['tiers']>;
type TierIssue = components['schemas']['OrganizationTierIssue'];

const MAX_LISTED = 5;

function IssueList({ title, issues, unit }: { title: string; issues: TierIssue[]; unit: string }) {
  if (!issues.length) return null;
  return (
    <div className="admin-tier-issues">
      <strong>
        {title} ({issues.length.toLocaleString('id-ID')})
      </strong>
      <ul>
        {issues.slice(0, MAX_LISTED).map((issue) => (
          <li key={`${issue.department}|${issue.section}|${issue.line ?? ''}`}>
            {[issue.department, issue.section, issue.line].filter(Boolean).join(' / ')} ·{' '}
            {issue.count.toLocaleString('id-ID')} {unit}
          </li>
        ))}
        {issues.length > MAX_LISTED ? (
          <li>dan {(issues.length - MAX_LISTED).toLocaleString('id-ID')} lainnya</li>
        ) : null}
      </ul>
    </div>
  );
}

/**
 * Advisory Area/Line readiness for tiered routing. Never blocks confirmation:
 * a level that cannot be resolved to exactly one person is skipped.
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
  const issues =
    tiers.duplicateSectionHeads.length +
    tiers.duplicateLineLeaders.length +
    tiers.linesWithoutLeader.length;
  return (
    <Alert tone={issues ? 'warning' : 'success'} title="Area & Line (routing bertingkat)">
      <p className="admin-tier-counts">
        {tiers.groupLeaders.toLocaleString('id-ID')} Group Leader ·{' '}
        {tiers.withLine.toLocaleString('id-ID')} karyawan dengan Line ·{' '}
        {tiers.withArea.toLocaleString('id-ID')} karyawan dengan Area
      </p>
      <IssueList
        title="Section dengan lebih dari satu Section Head"
        issues={tiers.duplicateSectionHeads}
        unit="Section Head"
      />
      <IssueList
        title="Line dengan lebih dari satu Group Leader"
        issues={tiers.duplicateLineLeaders}
        unit="Group Leader"
      />
      <IssueList title="Line tanpa Group Leader" issues={tiers.linesWithoutLeader} unit="member" />
      {issues ? (
        <p className="admin-tier-counts">
          Tidak memblokir impor. Level yang tidak tepat satu orang akan dilewati saat routing.
        </p>
      ) : null}
    </Alert>
  );
}
