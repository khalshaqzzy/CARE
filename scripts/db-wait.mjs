import { spawnSync } from 'node:child_process';

const deadline = Date.now() + 60_000;
while (Date.now() < deadline) {
  const ready =
    spawnSync(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'care', '-d', 'care'],
      { stdio: 'ignore' },
    ).status === 0;
  if (ready) process.exit(0);
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
console.error('PostgreSQL did not become ready within 60 seconds');
process.exit(1);
