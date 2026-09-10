import { verifyGenerated } from './generated-contract.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { selectLocal, requireSuccess, browserProjects } from './plan.mjs';
import { mergeGalleries, escapeHtml, persistLocalGallery } from './gallery.mjs';

test('local scope expands for shared inputs and unknown changes', () => {
  assert.deepEqual(selectLocal(['docs/adr/example.md']), ['docs']);
  assert.deepEqual(selectLocal(['e2e/captures/local/example.png']), ['docs']);
  for (const path of [
    'pnpm-lock.yaml',
    'packages/contracts/src/index.ts',
    '.github/workflows/ci.yml',
    'new-config.json',
  ]) {
    const jobs = selectLocal([path]);
    for (const required of [
      'build',
      'integration',
      'organization',
      'performance',
      'migrations',
      'browser',
      'legacy',
      'capture',
      'fullstack',
    ])
      assert.ok(jobs.includes(required), `${path}: ${required}`);
  }
  const ui = selectLocal(['apps/web-voice/src/example.tsx']);
  assert.ok(ui.includes('fullstack') && ui.includes('capture') && ui.includes('legacy'));
  assert.ok(!ui.includes('performance'));
});

test('release gate rejects failed, cancelled, skipped, empty and missing outcomes', () => {
  requireSuccess({ api: 'success', web: 'success' });
  for (const value of ['failure', 'cancelled', 'skipped', undefined])
    assert.throws(() => requireSuccess({ api: 'success', web: value }));
  assert.throws(() => requireSuccess({}));
  const result = spawnSync('node', ['scripts/validation/release-gate.mjs'], {
    env: { ...process.env, RESULTS: '{"api":{"result":"skipped"}}' },
  });
  assert.notEqual(result.status, 0);
});

test('capture gallery fails closed on missing, duplicate, stale and unsafe evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'care-gallery-test-'));
  const png = Buffer.from('89504e470d0a1a0a0000000d494844520000000100000001', 'hex');
  try {
    const a = join(root, 'a');
    const b = join(root, 'b');
    await mkdir(a);
    await mkdir(b);
    const manifest = (id, sha = 'abc') => ({
      sha,
      platform: 'test',
      scenarios: [
        {
          id,
          title: '<unsafe>',
          status: 'passed',
          images: [{ file: 'one.png', name: `${id}.png` }],
        },
      ],
    });
    await writeFile(join(a, 'one.png'), png);
    await writeFile(join(b, 'one.png'), png);
    await writeFile(join(a, 'manifest.json'), JSON.stringify(manifest('a')));
    await writeFile(join(b, 'manifest.json'), JSON.stringify(manifest('b')));
    const out = join(root, 'out');
    await mergeGalleries([a, b], out, 2);
    assert.match(await readFile(join(out, 'index.html'), 'utf8'), /&lt;unsafe&gt;/);
    const native = join(root, 'native');
    await persistLocalGallery(a, native);
    await persistLocalGallery(b, native);
    assert.equal(
      JSON.parse(await readFile(join(native, 'manifest.json'), 'utf8')).scenarios.length,
      2,
      'partial native capture must preserve other scenarios',
    );
    await persistLocalGallery(a, native, true);
    assert.equal(
      JSON.parse(await readFile(join(native, 'manifest.json'), 'utf8')).scenarios.length,
      1,
      'complete native capture removes retired scenarios',
    );

    await assert.rejects(mergeGalleries([a], out, 2));
    await assert.rejects(mergeGalleries([a, a], out, 2));
    await writeFile(join(b, 'manifest.json'), JSON.stringify(manifest('b', 'wrong-sha')));
    await assert.rejects(mergeGalleries([a, b], out, 2));
    const unsafe = manifest('a');
    unsafe.scenarios[0].images[0].file = '../secret';
    await writeFile(join(a, 'manifest.json'), JSON.stringify(unsafe));
    await assert.rejects(mergeGalleries([a], out, 1));
    assert.equal(escapeHtml('<x>'), '&lt;x&gt;');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function inventory(args, env = {}) {
  const output = execFileSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--list', '--reporter=json', ...args],
    { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 10 * 1024 * 1024 },
  );
  const report = JSON.parse(output);
  if (report.errors.length) throw new Error(JSON.stringify(report.errors));
  const result = [];
  function visit(suite) {
    for (const spec of suite.specs ?? [])
      for (const item of spec.tests) result.push(`${item.projectName}:${spec.id}`);
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  return result;
}

test('actual CI browser partitions cover every test exactly once', { timeout: 120_000 }, () => {
  const all = inventory([], { FULLSTACK_E2E: '1' });
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const entries = [...workflow.matchAll(/- \{ suite: (browser|capture|legacy), shard: '([^']+)'/g)];
  assert.equal(entries.length, 5, 'CI matrix must contain all five browser shards');
  const partitions = entries.flatMap(([, name, shard]) =>
    inventory([...browserProjects[name], `--shard=${shard}`]),
  );
  assert.match(workflow, /pnpm verify:ci fullstack/);
  partitions.push(...inventory(browserProjects.fullstack, { FULLSTACK_E2E: '1' }));
  assert.equal(new Set(partitions).size, partitions.length, 'duplicate test in CI partitions');
  assert.deepEqual(partitions.sort(), all.sort(), 'missing CI test');
  assert.equal(all.length, 315);
  assert.equal(all.filter((name) => name.startsWith('visual:')).length, 128);
});

test('a successful visual test without a capture makes the real reporter fail', async () => {
  const root = process.cwd();
  const fixtures = join(root, '.cache', 'validation');
  await mkdir(fixtures, { recursive: true });
  const folder = await mkdtemp(join(fixtures, 'reporter-contract-'));
  try {
    await writeFile(
      join(folder, 'missing.spec.ts'),
      "import { test } from '@playwright/test'; test('missing capture', () => {});\n",
    );
    await writeFile(
      join(folder, 'playwright.config.ts'),
      `export default {testDir: '.', testMatch: 'missing.spec.ts', reporter: [[${JSON.stringify(join(root, 'e2e/helpers/capture-reporter.ts'))}]], projects: [{name: 'visual'}]};\n`,
    );
    const result = spawnSync('node', [join(root, 'node_modules/@playwright/test/cli.js'), 'test'], {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, FULLSTACK_E2E: '0' },
    });
    assert.notEqual(result.status, 0);
    const manifest = JSON.parse(
      await readFile(join(folder, 'visual-output/manifest.json'), 'utf8'),
    );
    assert.equal(manifest.scenarios.length, 1);
    assert.equal(manifest.scenarios[0].status, 'passed');
    assert.equal(manifest.scenarios[0].images.length, 0);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('real build verification rejects a stale SHA and tampered output', async () => {
  const root = process.cwd();
  const folder = await mkdtemp(join(tmpdir(), 'care-build-contract-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: folder });
    const script = `
      import { mkdir, writeFile } from 'node:fs/promises';
      import { sealBuild, verifyBuild } from ${JSON.stringify('file://' + join(root, 'scripts/validation/build-artifact.mjs'))};
      import assert from 'node:assert/strict';
      for (const [dir, file] of [['apps/api/dist','main.js'],['apps/web-voice/dist','index.html'],['apps/web-admin/dist','index.html']]) {
        await mkdir(dir, { recursive: true }); await writeFile(dir+'/'+file, 'original');
      }
      await writeFile('.gitignore', '**/dist\\n.validation-build.json\\n');
      await sealBuild(); await verifyBuild();
      process.env.GITHUB_SHA = 'wrong';
      await assert.rejects(verifyBuild());
      process.env.GITHUB_SHA = 'expected';
      await writeFile('apps/api/dist/main.js','tampered');
      await assert.rejects(verifyBuild());
    `;
    const result = spawnSync('node', ['--input-type=module', '-e', script], {
      cwd: folder,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_SHA: 'expected' },
    });
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('generated contracts compare with working inputs and detect generation drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'care-generated-test-'));
  const path = join(directory, 'generated.ts');
  try {
    await writeFile(path, 'intentional uncommitted contract');
    await verifyGenerated([path], () => writeFile(path, 'intentional uncommitted contract'));
    await assert.rejects(
      verifyGenerated([path], () => writeFile(path, 'new generated contract')),
      /Generated contract drift/,
    );
    await verifyGenerated([path], () => writeFile(path, 'new generated contract'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
