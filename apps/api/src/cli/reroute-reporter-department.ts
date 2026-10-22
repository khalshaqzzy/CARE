import { PrismaClient } from '@prisma/client';
import { commitReroute, planReroute } from '../operations/reroute-reporter-department';

const usage = 'Usage: reroute-reporter-department [--category WORK_DIFFICULTY] [--commit]';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const index = args.indexOf('--category');
  const category = index >= 0 ? args[index + 1] : 'WORK_DIFFICULTY';
  if (!category) throw new Error(usage);
  const commit = args.includes('--commit');
  const prisma = new PrismaClient();
  try {
    const rows = commit
      ? await commitReroute(prisma, category)
      : await planReroute(prisma, category);
    for (const row of rows)
      process.stdout.write(
        `${row.displayId} · ${row.status} · ${row.from ?? '-'} → ${row.to ?? '-'} · ` +
          `${row.result}${row.firstLevel ? ` · ${row.firstLevel}: ${row.holders.join(', ')}` : ''}` +
          `${row.message ? ` · ${row.message}` : ''}\n`,
      );
    const count = (result: string) => rows.filter((row) => row.result === result).length;
    process.stdout.write(
      `${commit ? 'Pemindahan' : 'Dry run'}: ${rows.length} Voice · siap ${count('SIAP')} · ` +
        `dipindah ${count('DIPINDAH')} · error ${count('ERROR')}\n`,
    );
    if (count('ERROR')) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
