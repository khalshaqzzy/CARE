import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { selectLocal, browserProjects } from './plan.mjs';
import { cleanBuild, sealBuild, verifyBuild } from './build-artifact.mjs';

const children = new Set();
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    interrupted = true;
    for (const child of children) {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM');
        else process.kill(-child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') console.error(error);
      }
    }
  });
export async function command(args, env = {}) {
  console.log(`> ${args.join(' ')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(args[0], args.slice(1), {
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      env: { ...process.env, ...env },
    });
    children.add(child);
    child.on('close', () => children.delete(child));
    child.on('error', reject);
    child.on('exit', (code, signal) =>
      code === 0 ? resolve() : reject(new Error(`${args.join(' ')} failed (${signal ?? code})`)),
    );
  });
}
const pnpm = (...args) => command(['pnpm', ...args]);
const completed = new Set();
async function prepare() {
  if (!completed.has('prepare')) {
    await pnpm('db:generate');
    completed.add('prepare');
  }
}
async function parallel(commands) {
  // Two independent tasks at a time; inspect every exit code before returning.
  const failures = [];
  for (let i = 0; i < commands.length; i += 2) {
    if (interrupted) throw new Error('Validation interrupted');
    const results = await Promise.allSettled(commands.slice(i, i + 2).map((args) => pnpm(...args)));
    failures.push(
      ...results.filter((result) => result.status === 'rejected').map((result) => result.reason),
    );
  }
  if (failures.length) throw new AggregateError(failures, 'Validation tasks failed');
}
const dbJobs = new Set(['integration', 'organization', 'performance', 'migrations', 'fullstack']);
async function job(name, extra) {
  if (completed.has(name)) return;
  if (name === 'docs') {
    await pnpm('format:check');
    await pnpm('git:diff-check');
  } else if (name === 'static') {
    await prepare();
    await parallel([
      ['format:check'],
      ['lint'],
      ['test:unit'],
      ['test:validation'],
      ['test:openai:smoke'],
      ['git:diff-check'],
    ]);
  } else if (name === 'build') {
    await prepare();
    await pnpm('openapi:check');
    await cleanBuild();
    await pnpm('typecheck');
    await pnpm('--filter', '@care/api', 'build');
    await command(
      [
        'pnpm',
        '--parallel',
        '--filter',
        '@care/web-voice',
        '--filter',
        '@care/web-admin',
        'exec',
        'vite',
        'build',
      ],
      { NODE_ENV: 'production' },
    );
    await pnpm('pwa:compat-check');
    await sealBuild();
  } else {
    if (dbJobs.has(name)) {
      if (!process.env.DATABASE_URL)
        throw new Error('DATABASE_URL must identify an isolated disposable test database');
      await prepare();
      await pnpm('--filter', '@care/api', 'prisma:migrate:deploy');
    }
    if (name === 'integration') {
      await pnpm(
        '--filter',
        '@care/api',
        'test:integration',
        '--exclude',
        '**/organization-routing.integration.test.ts',
      );
      await pnpm('test:security');
    } else if (name === 'organization')
      await pnpm(
        '--filter',
        '@care/api',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.config.ts',
        'test/integration/organization-routing.integration.test.ts',
      );
    else if (name === 'performance') {
      await pnpm('seed:performance');
      await pnpm('test:performance');
      await pnpm('maintenance:reconcile');
    } else if (name === 'migrations') {
      await command(['pnpm', 'test:migration:upgrade'], local ? { DATABASE_URL: '' } : {});
    } else if (['browser', 'legacy', 'capture', 'fullstack'].includes(name)) {
      await verifyBuild();
      const projects = browserProjects[name];
      await command(
        ['pnpm', 'exec', 'playwright', 'test', ...projects, ...extra],
        name === 'fullstack' ? { FULLSTACK_E2E: '1' } : {},
      );
    } else throw new Error(`Unknown validation job: ${name}`);
  }
  completed.add(name);
}
function changedFiles(base) {
  const git = (...args) =>
    execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
  return [
    ...new Set([
      ...git('diff', '--name-only', ...(base ? [`${base}...HEAD`] : ['HEAD'])),
      ...git('diff', '--name-only', 'HEAD'),
      ...git('ls-files', '--others', '--exclude-standard'),
    ]),
  ];
}
const [mode, ...raw] = process.argv.slice(2);
const args = raw.filter((arg) => arg !== '--');
const dry = args.includes('--plan');
const base = args.find((arg) => arg.startsWith('--base='))?.slice(7);
const extra = args.filter((arg) => arg !== '--plan' && !arg.startsWith('--base='));
const local = mode === 'local' || mode === 'full';
const selected =
  mode === 'local'
    ? selectLocal(changedFiles(base))
    : mode === 'full'
      ? [
          'static',
          'build',
          'integration',
          'organization',
          'performance',
          'migrations',
          'fullstack',
          'browser',
          'legacy',
          'capture',
        ]
      : [extra.shift()];
if (!['local', 'full', 'ci', 'repro'].includes(mode) || !selected[0])
  throw new Error('Usage: verify local|full|ci <job>|repro <job> [--plan] [--base=ref]');
if (mode === 'repro' && process.platform !== 'linux')
  throw new Error(
    'Linux reproduction requires a Linux shell with pinned Node/pnpm and the job prerequisites. Native local validation uses verify:local.',
  );
console.log(`Validation plan (${mode}): ${selected.join(', ')}`);
if (dry) process.exit(0);
const nodeVersion = readFileSync('.node-version', 'utf8').trim().replace(/^v/, '');
const pnpmVersion = JSON.parse(readFileSync('package.json', 'utf8')).packageManager.split('@')[1];
if (
  process.versions.node !== nodeVersion ||
  execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim() !== pnpmVersion
)
  throw new Error(`Use repository-pinned Node ${nodeVersion} / pnpm ${pnpmVersion}`);

const results = {};
let databaseStarted = false;
try {
  if (local && selected.some((name) => dbJobs.has(name))) {
    // Never stop a pre-existing developer database. Request an isolated external DB instead.
    const existing = execFileSync('docker', ['compose', 'ps', '-q', 'postgres'], {
      encoding: 'utf8',
    }).trim();
    if (existing)
      throw new Error(
        'A developer PostgreSQL is already running. Stop it or run individual verify:ci jobs against a separate disposable database.',
      );
    databaseStarted = true;
    await pnpm('db:up');
    await pnpm('db:wait');
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://care:care_local@localhost:54329/care_test',
      RELEASE_SHA: 'ci',
      SESSION_HASH_SECRET: 'ci-session-hash-secret-32-characters',
      SESSION_CSRF_SECRET: 'ci-session-csrf-secret-32-characters',
      AUTH_THROTTLE_SECRET: 'ci-auth-throttle-secret-32-characters',
      CURSOR_SIGNING_SECRET: 'd'.repeat(32),
      OUTBOX_ENABLED: 'false',
    });
  }
  for (const name of selected) {
    if (interrupted) throw new Error('Validation interrupted');
    try {
      if (local && dbJobs.has(name)) await pnpm('db:test:reset');
      await job(name, extra);
      results[name] = 'passed';
    } catch (error) {
      results[name] = 'failed';
      throw error;
    }
  }
} finally {
  if (databaseStarted) await pnpm('db:down');
  await mkdir('.cache/validation', { recursive: true });
  await writeFile(
    '.cache/validation/last-run.json',
    JSON.stringify(
      { mode, selected, results, notRun: selected.filter((name) => !results[name]) },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ selected, results }, null, 2));
}
