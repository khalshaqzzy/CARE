import { expect, test } from '@playwright/test';

test('precache excludes design/API and provides an explicit offline fallback', async ({
  context,
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
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
  await context.setOffline(true);
  await controlledPage.goto('/route-not-precached');
  await expect(
    controlledPage.getByRole('heading', { name: 'CARE tidak dapat terhubung' }),
  ).toBeVisible();
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
