import { expect, test } from '@playwright/test';

// Full-stack validation of the built web-voice preview server (4173) proxying to
// a running CARE API on :3000 that is attached to the disposable test database.
// It is run by the `fullstack` Playwright project, which is only present when
// `FULLSTACK_E2E=1` (see playwright.config.ts); the default `test:frontend:e2e`
// mocks the API and is unaffected.
const enabled = process.env.FULLSTACK_E2E === '1';

test.skip(!enabled, 'Full-stack requires a running CARE API on :3000 (set FULLSTACK_E2E=1).');

test('API is healthy, the database is reachable, and the preview proxies to it', async ({
  request,
}) => {
  const health = await request.get('http://127.0.0.1:3000/health');
  expect(health.status()).toBe(200);
  expect((await health.json()).status).toBe('ok');

  const ready = await request.get('http://127.0.0.1:3000/ready');
  expect(ready.status()).toBe(200);
  expect((await ready.json()).checks.database).toBe('ok');

  // An unauthenticated session call reaches the real API (401) through the
  // built preview server's proxy, proving the proxy target wiring.
  const session = await request.get('http://127.0.0.1:4173/api/v1/auth/session');
  expect(session.status()).toBe(401);
  expect((await session.json()).code).toBe('UNAUTHENTICATED');
});
