/** Conservative local impact mapping. Unknown files expand to all application suites. */
export function selectLocal(files) {
  if (!files.length) return ['static', 'build'];
  if (files.every((file) => /^(docs\/|\.agent\/|e2e\/captures\/)|\.md$/.test(file)))
    return ['docs'];
  const jobs = new Set(['static', 'build']);
  const all = () =>
    [
      'integration',
      'organization',
      'performance',
      'migrations',
      'fullstack',
      'browser',
      'legacy',
      'capture',
    ].forEach((job) => jobs.add(job));
  for (const file of files) {
    if (/^(docs\/|\.agent\/|e2e\/captures\/)|\.md$/.test(file)) continue;
    if (/^apps\/web-|^packages\/ui\//.test(file))
      ['browser', 'legacy', 'capture', 'fullstack'].forEach((job) => jobs.add(job));
    else if (/^apps\/api\//.test(file)) all();
    else if (/^e2e\/.*\.visual\.spec\.ts$/.test(file)) jobs.add('capture');
    else if (/^e2e\//.test(file))
      ['browser', 'legacy', 'capture', 'fullstack'].forEach((job) => jobs.add(job));
    else all();
  }
  return [...jobs];
}
export function requireSuccess(results) {
  if (!Object.keys(results).length || Object.values(results).some((result) => result !== 'success'))
    throw new Error(`Required validation failed: ${JSON.stringify(results)}`);
}

export const browserProjects = {
  browser: ['--project=chromium', '--project=pwa', '--project=push'],
  legacy: ['--project=legacy-ios'],
  capture: ['--project=visual'],
  fullstack: ['--project=fullstack'],
};
