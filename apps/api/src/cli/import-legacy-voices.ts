import { PrismaClient } from '@prisma/client';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'node:path';
import {
  commitLegacyImport,
  planLegacyImport,
  readLegacyWorkbook,
  reportCsv,
} from '../operations/legacy-voice-import';

const usage =
  'Usage: import-legacy-voices --file <workbook.xlsx> [--commit] [--report <hasil.csv>]';

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const file = value('--file');
  if (!file) throw new Error(usage);
  const commit = args.includes('--commit');
  const { dir, name } = parse(file);
  const reportPath = value('--report') ?? `${dir ? `${dir}/` : ''}${name}-hasil.csv`;
  const rows = await readLegacyWorkbook(await readFile(file));
  const prisma = new PrismaClient();
  try {
    const outcome = commit
      ? await commitLegacyImport(prisma, rows)
      : { ...(await planLegacyImport(prisma, rows)), committed: 0 };
    const counts = { SIAP: 0, DIMIGRASI: 0, DILEWATI: 0, ERROR: 0 };
    for (const r of outcome.results) counts[r.result] += 1;
    await writeFile(reportPath, reportCsv(outcome.results));
    for (const r of outcome.results)
      if (r.result === 'ERROR')
        process.stdout.write(`Baris ${r.row} (${r.legacyId || '-'}): ${r.messages.join('; ')}\n`);
    process.stdout.write(
      `${commit ? 'Import' : 'Dry run'}: ${rows.length} baris · siap ${counts.SIAP} · ` +
        `dimigrasi ${counts.DIMIGRASI} · dilewati ${counts.DILEWATI} · error ${counts.ERROR}\n` +
        `Laporan: ${reportPath}\n`,
    );
    if (counts.ERROR) {
      if (commit) process.stdout.write('Tidak ada yang dimigrasi; perbaiki error lalu ulangi.\n');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
