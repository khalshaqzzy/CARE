import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(process.cwd(), 'apps/api/prisma/migrations');
const directories = await readdir(root, { withFileTypes: true });
const destructive =
  /\b(DROP\s+(TABLE|COLUMN|TYPE|DATABASE)|TRUNCATE\b|ALTER\s+COLUMN\b[^;]*\bTYPE\b)\b/i;
const findings = [];
const baseSha = process.argv[2];
if (baseSha) {
  const exists = spawnSync('git', ['cat-file', '-e', `${baseSha}^{commit}`]);
  if (exists.status !== 0) throw new Error(`Migration base commit is unavailable: ${baseSha}`);
  const changed = spawnSync(
    'git',
    [
      'diff',
      '--diff-filter=AM',
      '--name-only',
      `${baseSha}...HEAD`,
      '--',
      'apps/api/prisma/migrations/*/migration.sql',
    ],
    { encoding: 'utf8' },
  );
  if (changed.status !== 0)
    throw new Error(changed.stderr || 'Could not inspect changed migrations');
  const forbidden = /\b(DROP\s+|TRUNCATE\b|prisma\s+migrate\s+reset|DOWN\s+MIGRATION)/i;
  for (const migration of changed.stdout.trim().split('\n').filter(Boolean)) {
    if (forbidden.test(await readFile(resolve(process.cwd(), migration), 'utf8')))
      findings.push(migration);
  }
}
const approved = new Map([
  [
    '20260825090000_v11_backend_remediation',
    {
      sha256: '5973cfa1ff78046848ecbdc7bf084752c63fbe2343dc0582fc5af3a310cefe7b',
      rationale:
        'Phase 6 expand/backfill/contract migration removes superseded v1.0 roles, profiles, import/provider columns only after deterministic reconciliation.',
    },
  ],
]);
for (const directory of directories) {
  if (!directory.isDirectory()) continue;
  const path = resolve(root, directory.name, 'migration.sql');
  const sql = await readFile(path, 'utf8');
  if (destructive.test(sql)) {
    const approval = approved.get(directory.name);
    const sha256 = createHash('sha256').update(sql).digest('hex');
    if (!approval || approval.sha256 !== sha256 || !approval.rationale)
      findings.push(directory.name);
    else
      process.stdout.write(
        `Approved destructive migration ${directory.name}: ${approval.rationale}\n`,
      );
  }
}
if (findings.length) {
  process.stderr.write(`Destructive one-step migration detected: ${findings.join(', ')}\n`);
  process.exitCode = 1;
} else process.stdout.write('Migration destructive-operation check passed\n');
