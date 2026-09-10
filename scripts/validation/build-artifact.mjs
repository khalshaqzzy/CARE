import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
export const roots = ['apps/api/dist', 'apps/web-voice/dist', 'apps/web-admin/dist'];
const required = [
  'apps/api/dist/main.js',
  'apps/web-voice/dist/index.html',
  'apps/web-admin/dist/index.html',
];
export const sourceSha = () =>
  process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
async function sourceFingerprint() {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter((path) =>
      /^(apps\/|packages\/|package.json$|pnpm-lock.yaml$|pnpm-workspace.yaml$|tsconfig.json$|.node-version$)/.test(
        path,
      ),
    );
  const hash = createHash('sha256');
  for (const path of [...new Set(paths)].sort()) {
    hash.update(path + '\0');
    try {
      hash.update(await readFile(path));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('deleted');
    }
  }
  return hash.digest('hex');
}
async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...(await files(path)));
    else if (item.isFile()) result.push(path);
    else throw new Error(`Unexpected build entry: ${path}`);
  }
  return result.sort();
}
export async function cleanBuild() {
  for (const root of roots) await rm(root, { recursive: true, force: true });
}
export async function buildManifest() {
  const result = {};
  for (const root of roots)
    for (const path of await files(root))
      result[path] = createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
  for (const path of required) if (!result[path]) throw new Error(`Missing build entry: ${path}`);
  return {
    sha: sourceSha(),
    source: await sourceFingerprint(),
    files: Object.entries(result).map(([path, sha256]) => ({ path, sha256 })),
  };
}
export async function sealBuild() {
  await writeFile('.validation-build.json', JSON.stringify(await buildManifest(), null, 2) + '\n');
}
export async function verifyBuild() {
  const expected = JSON.parse(await readFile('.validation-build.json', 'utf8'));
  const actual = await buildManifest();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error('Build artifact SHA or content mismatch');
}
