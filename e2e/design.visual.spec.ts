import { expect, test } from '@playwright/test';
import { mockAdminApi } from './helpers/mock-api';

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
  await page.route('**/api/v1/dashboard/member', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        total: 0,
        counts: { OPEN: 0, IN_VERIFICATION: 0, IN_PROGRESS: 0, CLOSED: 0 },
        recent: [],
        draft: null,
        generatedAt: '2026-08-01T10:00:00.000Z',
      }),
    }),
  );
  // Pin the clock so the time-of-day greeting in the hero is deterministic.
  await page.clock.setFixedTime(new Date('2026-08-01T10:00:00Z'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-shell-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    // Dense-typography captures accumulate font rasterization drift between
    // CoreText (macOS, where baselines are authored) and FreeType (ubuntu CI);
    // measured drift is stable at ~0.04 on Linux and ~0 locally, matching the
    // documented design-overview tolerance above.
    maxDiffPixelRatio: 0.06,
  });
});

test('Admin shell visual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  // Mock the full Admin API (session + overview + health/ready/release) so the
  // polished overview renders its data-driven pulse card deterministically
  // instead of a transient loading state.
  await mockAdminApi(page);
  // Pin the clock so the "Validasi terakhir" timestamp is pixel-stable.
  await page.clock.setFixedTime(new Date('2026-08-01T10:00:00Z'));
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.getByRole('heading', { name: 'Overview operasional' })).toBeVisible();
  // Wait until the overview data (operational summary card) has rendered before capturing.
  await expect(page.getByText('Ringkasan operasional', { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot('admin-shell-1440.png', {
    animations: 'disabled',
    threshold: 0.25,
    // Dense admin typography accumulates font rasterization drift between
    // CoreText (macOS, where baselines are authored) and FreeType (ubuntu CI);
    // measured drift is stable at ~0.04 on Linux and ~0 locally, matching the
    // documented design-overview/workforce-shell tolerance above.
    maxDiffPixelRatio: 0.06,
  });
});
