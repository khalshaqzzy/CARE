import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const unauthenticated = {
  code: 'UNAUTHENTICATED',
  message: 'Sesi tidak tersedia.',
  correlationId: 'e2e-correlation',
  errors: [],
};

test.describe('public design contract', () => {
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 768, height: 900 },
    { width: 1440, height: 1000 },
  ]) {
    test(`renders without document overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const apiRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
      });
      await page.goto('/design');
      await expect(
        page.getByRole('heading', { name: 'CARE interface, dari token hingga workflow.' }),
      ).toBeVisible();
      expect(apiRequests).toEqual([]);
      expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe(
        'noindex, nofollow',
      );
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('passes axe and keyboard focus visibility', async ({ page }) => {
    await page.goto('/design');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /CARE Design system/ })).toBeFocused();
  });
});

test('workforce auth bootstrap and shell', async ({ page }) => {
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: 'member-1',
          username: '000128',
          displayName: 'Budi Santoso',
          accountKind: 'WORKFORCE',
          status: 'ACTIVE',
        },
        workforceProfile: {
          structuralPosition: null,
          organizationSnapshotId: null,
          organizationUnitId: null,
        },
        employee: null,
        unionProfile: null,
        capabilities: ['MEMBER'],
        scopes: { overview: ['OWN'], detail: ['OWN'], action: ['REPORTER_OWN'] },
        sessionId: 'session-workforce',
        passwordChangeRequired: false,
      }),
    }),
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat datang, Budi Santoso' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toBeVisible();
});

test.describe('Admin desktop boundary', () => {
  test('does not mount protected tree or fetch below 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1279, height: 800 });
    const apiRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
    });
    await page.goto('http://127.0.0.1:4174/');
    await expect(
      page.getByRole('heading', { name: 'CARE Admin memerlukan layar desktop' }),
    ).toBeVisible();
    expect(apiRequests).toEqual([]);
  });

  for (const width of [1280, 1440]) {
    test(`mounts the Admin app at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/api/v1/auth/session', (route) =>
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify(unauthenticated),
        }),
      );
      await page.goto('http://127.0.0.1:4174/');
      await expect(page.getByRole('heading', { name: 'Masuk ke CARE Admin' })).toBeVisible();
    });
  }
});

test('production artifacts preserve PWA split', async () => {
  const { readdir } = await import('node:fs/promises');
  const voiceFiles = await readdir('apps/web-voice/dist');
  const adminFiles = await readdir('apps/web-admin/dist');
  expect(voiceFiles).toEqual(
    expect.arrayContaining([
      'manifest.webmanifest',
      'sw.js',
      'icon-192.png',
      'icon-512.png',
      'icon-maskable-512.png',
    ]),
  );
  expect(adminFiles.some((file) => /manifest|sw\.(?:js|mjs)/.test(file))).toBe(false);
});
