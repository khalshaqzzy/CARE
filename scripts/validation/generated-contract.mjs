import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function verifyGenerated(paths, generate) {
  const before = await Promise.all(paths.map((path) => readFile(path)));
  await generate();
  const after = await Promise.all(paths.map((path) => readFile(path)));
  const changed = paths.filter((_, index) => !before[index].equals(after[index]));
  if (changed.length)
    throw new Error(
      `Generated contract drift: ${changed.join(', ')}. Review regenerated files and rerun.`,
    );
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await verifyGenerated(['apps/api/openapi.json', 'packages/contracts/src/generated.ts'], () => {
    execFileSync('pnpm', ['openapi:generate'], { stdio: 'inherit' });
  });
}
