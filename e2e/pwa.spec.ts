import { expect, test } from '@playwright/test';

test('precache excludes design/API and provides an explicit offline fallback', async ({
  context,
  page,
}) => {
  // CI runners occasionally delay first-run service worker activation beyond the
  // default 30 s budget; give this journey room without loosening anything else.
  test.setTimeout(120_000);
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  // Register from a static same-origin page so this artifact-level test does
  // not depend on the application session bootstrap or an API process.
  await page.goto('/offline.html');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
  // navigator.serviceWorker.ready can remain pending forever when activation
  // stalls on a busy runner, hiding the real registration state. Poll the
  // registration directly so failures report the last observed worker state.
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration('/');
          return (
            registration?.active?.state ??
            registration?.installing?.state ??
            registration?.waiting?.state ??
            null
          );
        }),
      {
        timeout: 60_000,
        interval: 500,
        message: consoleErrors.length
          ? `Service worker did not reach "activated"; console errors: ${consoleErrors.join(' | ')}`
          : 'Service worker did not reach "activated"',
      },
    )
    .toBe('activated');
  const controlledPage = await context.newPage();
  await controlledPage.goto('/');
  const cachedUrls = await controlledPage.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async (name) => (await caches.open(name)).keys())))
      .flat()
      .map((request) => request.url);
  });
  expect(cachedUrls.some((url) => /design-system/.test(url))).toBe(false);
  expect(cachedUrls.some((url) => /\/api\//.test(url))).toBe(false);
  await expect
    .poll(() => controlledPage.evaluate(() => navigator.serviceWorker.controller?.state ?? null))
    .toBe('activated');
  await context.setOffline(true);
  await controlledPage.goto('/route-not-precached', { waitUntil: 'domcontentloaded' });
  await expect(
    controlledPage.getByRole('heading', { name: 'CARE tidak dapat terhubung' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('cookie, IndexedDB, and CacheStorage remain origin isolated', async ({ context, page }) => {
  await context.addCookies([
    { name: 'care_session', value: 'origin-a', url: 'http://127.0.0.1:4173' },
  ]);
  await page.goto('/design');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('care-user-e2e', 1);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('IndexedDB setup failed.'));
    });
    await caches.open('care-user-e2e');
  });

  await page.goto('http://localhost:4173/design');
  expect(await page.evaluate(() => document.cookie)).not.toContain('care_session=origin-a');
  expect(
    await page.evaluate(async () =>
      (await indexedDB.databases()).some((database) => database.name === 'care-user-e2e'),
    ),
  ).toBe(false);
  expect(await page.evaluate(async () => (await caches.keys()).includes('care-user-e2e'))).toBe(
    false,
  );
});
