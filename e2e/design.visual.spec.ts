import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 360, height: 800 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 },
]) {
  test(`design overview visual ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/design');
    await expect(
      page.getByRole('heading', { name: 'CARE interface, dari token hingga workflow.' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(`design-overview-${viewport.width}.png`, {
      fullPage: false,
      animations: 'disabled',
      threshold: 0.25,
      // Dense-typography full-page captures accumulate font rasterization drift
      // between CoreText (macOS) and FreeType (ubuntu CI); measured drift is
      // stable at ~0.04 on Linux and ~0 locally, so allow up to 0.06 here.
      maxDiffPixelRatio: 0.06,
    });
  });
}

test('workforce shell visual', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
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
        sessionId: 'visual-member',
        passwordChangeRequired: false,
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Selamat datang, Budi Santoso' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-shell-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.03,
  });
});

test('Admin shell visual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          id: 'admin-1',
          username: 'admin',
          displayName: 'CARE Administrator',
          accountKind: 'CARE_ADMIN',
          status: 'ACTIVE',
        },
        workforceProfile: null,
        employee: null,
        unionProfile: null,
        capabilities: ['CARE_ADMIN'],
        scopes: {
          overview: ['ADMIN_OPERATIONAL'],
          detail: ['GENERAL_ALL', 'PRIVATE_ALL_READ_ONLY'],
          action: ['REPORTER_OWN'],
        },
        sessionId: 'visual-admin',
        passwordChangeRequired: false,
      }),
    }),
  );
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.getByRole('heading', { name: 'Overview operasional' })).toBeVisible();
  await expect(page).toHaveScreenshot('admin-shell-1440.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.03,
  });
});
