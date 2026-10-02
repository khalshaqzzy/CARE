import type { Area, Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Vocational (TM) members rotate across Sections and Lines inside their
 * department, so the organization file cannot say where they work today.
 * They pick their current Section and Line on each Voice instead.
 */
export const isTmNoReg = (noReg: string) => /^TM/i.test(noReg.trim());

export type PositionChoice = { section: string; line: string | null };
export type PositionOptions = {
  required: boolean;
  sections: Array<{ name: string; lines: string[] }>;
  last: PositionChoice | null;
};

const byName = (a: string, b: string) => a.localeCompare(b, 'id');

/** The Sections and Lines of the reporter's department, plus their last choice. */
export async function positionOptions(
  db: Db,
  employeeId: string,
  accountId: string,
): Promise<PositionOptions> {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    select: { noReg: true },
  });
  if (!employee || !isTmNoReg(employee.noReg)) return { required: false, sections: [], last: null };
  const membership = await db.organizationMembership.findFirst({
    where: { employeeId, snapshot: { status: 'ACTIVE' } },
    select: { snapshotId: true, organizationUnitId: true },
  });
  if (!membership) return { required: true, sections: [], last: null };
  // Placements come from permanent staff; TM rows carry no stable Section.
  const rows = await db.organizationMembership.findMany({
    where: {
      snapshotId: membership.snapshotId,
      organizationUnitId: membership.organizationUnitId,
      NOT: { employee: { noReg: { startsWith: 'TM', mode: 'insensitive' } } },
    },
    select: { section: true, lineName: true },
  });
  const lines = new Map<string, Set<string>>();
  for (const row of rows) {
    const section = row.section.trim();
    if (!section) continue;
    const entry = lines.get(section) ?? new Set<string>();
    if (row.lineName?.trim()) entry.add(row.lineName.trim());
    lines.set(section, entry);
  }
  const sections = [...lines.entries()]
    .sort(([a], [b]) => byName(a, b))
    .map(([name, set]) => ({ name, lines: [...set].sort(byName) }));
  const previous = await db.voice.findFirst({
    where: { reporterId: accountId, reporterSectionSnapshot: { not: null } },
    orderBy: { submittedAt: 'desc' },
    select: { reporterSectionSnapshot: true, reporterLineSnapshot: true },
  });
  const last =
    previous?.reporterSectionSnapshot &&
    isValidPosition(sections, {
      section: previous.reporterSectionSnapshot,
      line: previous.reporterLineSnapshot,
    })
      ? { section: previous.reporterSectionSnapshot, line: previous.reporterLineSnapshot }
      : null;
  return { required: true, sections, last };
}

export function isValidPosition(sections: PositionOptions['sections'], choice: PositionChoice) {
  const section = sections.find((item) => item.name === choice.section);
  return Boolean(section && (choice.line === null || section.lines.includes(choice.line)));
}

/** Area of the chosen Line (its leader) or Section, used for tiered routing. */
export async function positionArea(
  db: Db,
  snapshotId: string,
  organizationUnitId: string,
  choice: PositionChoice,
): Promise<Area | null> {
  const where = { snapshotId, organizationUnitId, section: choice.section, area: { not: null } };
  const match =
    (choice.line
      ? await db.organizationMembership.findFirst({
          where: { ...where, lineName: choice.line },
          select: { area: true },
        })
      : null) ?? (await db.organizationMembership.findFirst({ where, select: { area: true } }));
  return match?.area ?? null;
}
