import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), 'apps/api/prisma/migrations');
const directories = await readdir(root, { withFileTypes: true });
const destructive =
  /\b(DROP\s+(TABLE|COLUMN|TYPE|DATABASE)|TRUNCATE\b|ALTER\s+COLUMN\b[^;]*\bTYPE\b)\b/i;
const findings = [];
for (const directory of directories) {
  if (!directory.isDirectory()) continue;
  const path = resolve(root, directory.name, 'migration.sql');
  const sql = await readFile(path, 'utf8');
  if (destructive.test(sql)) findings.push(directory.name);
}
if (findings.length) {
  process.stderr.write(`Destructive one-step migration detected: ${findings.join(', ')}\n`);
  process.exitCode = 1;
} else process.stdout.write('Migration destructive-operation check passed\n');
