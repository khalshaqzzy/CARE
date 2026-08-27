import { expect, test } from '@playwright/test';

// This suite validates the `preview.proxy` wiring between the built web-voice
// preview server (4173) and a running CARE API on :3000. It is gated so the
// regular `test:frontend:e2e` run (which mocks the API) is unaffected; the
// disposable-PostgreSQL backend is exercised by the `test:integration` suite.
// Enable with: FULLSTACK_E2E=1 (with the API running against the test DB).
const enabled = process.env.FULLSTACK_E2E === '1';

test.skip(!enabled, 'Full-stack requires a running CARE API on :3000 (set FULLSTACK_E2E=1).');

test('proxies /api/v1 through the preview server to the API', async ({ request }) => {
  // An unauthenticated session call reaches the real API (401) instead of a
  // dead preview proxy (502), proving the proxy target wiring.
  const response = await request.get('http://127.0.0.1:4173/api/v1/auth/session');
  expect(response.status()).toBe(401);
  const body = await response.json().catch(() => ({}));
  expect(body.code).toBe('UNAUTHENTICATED');
});
