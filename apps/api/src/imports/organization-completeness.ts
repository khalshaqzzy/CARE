import { divisionLeadershipPositions, normalizedPosition } from '../auth/capabilities';

export const ORG_FIELDS = ['line', 'section', 'department', 'division'] as const;
export type OrgField = (typeof ORG_FIELDS)[number];
export type OrgCorrections = Record<string, Partial<Record<OrgField, string>>>;

type CompletenessRow = {
  noReg: string;
  name: string;
  structuralPosition: string;
  division: string;
  department: string;
  /** The Department cell was empty; parse fills it with Department 14. */
  departmentBlank?: boolean;
  section: string;
  line?: string | null;
  sourceRow: number;
};

export type OrgAbnormality = {
  row: number;
  noReg: string;
  name: string;
  structuralPosition: string;
  values: Record<OrgField, string | null>;
  missing: OrgField[];
};

/**
 * Leaders need the units they lead: a Group Leader its Line, Section,
 * Department and Division; a Section Head from Section up; a Department Head
 * from Department up; a Deputy/Division Head its Division. Members are not
 * checked.
 */
export function requiredOrgFields(position: string): OrgField[] {
  const normalized = normalizedPosition(position) ?? '';
  if (normalized === 'group leader') return ['line', 'section', 'department', 'division'];
  if (normalized === 'section head') return ['section', 'department', 'division'];
  if (normalized === 'department head') return ['department', 'division'];
  if (divisionLeadershipPositions.has(normalized)) return ['division'];
  return [];
}

const valuesOf = (row: CompletenessRow): Record<OrgField, string | null> => ({
  line: row.line?.trim() || null,
  section: row.section.trim() || null,
  department: row.departmentBlank ? null : row.department.trim() || null,
  division: row.division.trim() || null,
});

export function missingOrgFields(
  position: string,
  values: Record<OrgField, string | null>,
): OrgField[] {
  return requiredOrgFields(position).filter((field) => !values[field]);
}

export function organizationAbnormalities(rows: CompletenessRow[]): OrgAbnormality[] {
  const result: OrgAbnormality[] = [];
  for (const row of rows) {
    const values = valuesOf(row);
    const missing = missingOrgFields(row.structuralPosition, values);
    if (missing.length)
      result.push({
        row: row.sourceRow,
        noReg: row.noReg,
        name: row.name,
        structuralPosition: row.structuralPosition,
        values,
        missing,
      });
  }
  return result;
}

/** Admin edits made on the preview, applied to the stored file's rows. */
export function applyOrgCorrections<T extends CompletenessRow>(
  rows: T[],
  corrections: OrgCorrections | null | undefined,
): T[] {
  if (!corrections || !Object.keys(corrections).length) return rows;
  return rows.map((row) => {
    const edit = corrections[row.noReg];
    if (!edit) return row;
    return {
      ...row,
      ...(edit.line ? { line: edit.line } : {}),
      ...(edit.section ? { section: edit.section } : {}),
      ...(edit.department ? { department: edit.department, departmentBlank: false } : {}),
      ...(edit.division ? { division: edit.division } : {}),
    };
  });
}
