import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.cwd();
const appRoot = join(root, 'apps/web-voice');
const dist = join(appRoot, 'dist');
const vite = readFileSync(join(appRoot, 'vite.config.ts'), 'utf8');
const sourceHtml = readFileSync(join(appRoot, 'index.html'), 'utf8');
const builtHtml = readFileSync(join(dist, 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  (vite.match(/target:\s*'safari11\.3'/g) ?? []).length >= 2,
  'App and SW targets must be safari11.3.',
);
assert(
  sourceHtml.indexOf('/compat-bootstrap.js') < sourceHtml.indexOf('/src/main.tsx'),
  'Compatibility bootstrap must load before the application module.',
);
assert(
  builtHtml.indexOf('/compat-bootstrap.js') < builtHtml.indexOf('type="module"'),
  'Built compatibility bootstrap must load before the application module.',
);
assert(
  !/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i.test(builtHtml),
  'Built HTML must not contain inline script code.',
);

const jsFiles = readdirSync(join(dist, 'assets'))
  .filter((name) => name.endsWith('.js'))
  .map((name) => join(dist, 'assets', name));
jsFiles.push(join(dist, 'sw.js'));

const unsupported = [
  { name: 'optional chaining', pattern: /\?\.(?!\d)/ },
  { name: 'nullish coalescing/assignment', pattern: /\?\?=?/ },
  { name: 'logical assignment', pattern: /(?:&&|\|\|)=/ },
  { name: 'private fields', pattern: /(?:this|[A-Za-z_$][\w$]*)\.#[A-Za-z_$]/ },
];
for (const file of jsFiles) {
  const source = readFileSync(file, 'utf8');
  for (const check of unsupported)
    assert(!check.pattern.test(source), `${file} contains unsupported ${check.name} syntax.`);
}

const bootstrapChunk = jsFiles.find((file) => /bootstrap-app-.*\.js$/.test(file));
assert(bootstrapChunk, 'Unable to locate the workforce bootstrap-app chunk.');
const gzipBytes = gzipSync(readFileSync(bootstrapChunk)).byteLength;
// ADR-0026 allows a +15% budget over a recorded baseline; ADR-0051 re-recorded
// the baseline for the Web Push enrollment/delivery work and records the growth
// review. Keep the budget derived rather than hand-tuned.
const BASELINE_GZIP_BYTES = 144_904;
const COMPATIBILITY_BUDGET_BYTES = Math.ceil(BASELINE_GZIP_BYTES * 1.15);
assert(
  gzipBytes <= COMPATIBILITY_BUDGET_BYTES,
  `Workforce main gzip ${gzipBytes} exceeds the ${COMPATIBILITY_BUDGET_BYTES}-byte compatibility budget (baseline ${BASELINE_GZIP_BYTES}, ADR-0026/ADR-0051).`,
);

console.log(
  `PWA compatibility artifact gate passed (main gzip ${gzipBytes} bytes, baseline ${BASELINE_GZIP_BYTES}).`,
);
