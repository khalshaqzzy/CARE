import { AccountStatus, type Prisma, type PrismaClient } from '@prisma/client';
import { divisionLeadershipPositions, normalizedPosition } from '../auth/capabilities';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * The Director and every Deputy/Division Head of the reporter's directorate,
 * from the active organization snapshot. They read a Private Voice and its
 * chat and are told when it arrives or runs late; only the Komite acts.
 */
export async function privateObservers(
  db: Db,
  directorate: string | null,
  reporterId: string,
): Promise<string[]> {
  if (!directorate) return [];
  const rows = await db.organizationMembership.findMany({
    where: {
      snapshot: { status: 'ACTIVE' },
      organizationUnit: { directorate },
      employee: { account: { is: { status: AccountStatus.ACTIVE } } },
    },
    select: {
      structuralPosition: true,
      employee: { select: { account: { select: { id: true } } } },
    },
  });
  const ids = rows
    .filter((row) => {
      const position = normalizedPosition(row.structuralPosition) ?? '';
      return position === 'director' || divisionLeadershipPositions.has(position);
    })
    .map((row) => row.employee.account?.id)
    .filter((id): id is string => !!id && id !== reporterId);
  return [...new Set(ids)].sort();
}
