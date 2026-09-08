import { dashboardFixture, orgKey } from './helpers/dashboard-fixture';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockWorkforceApi, memberSession, unionSession } from './helpers/mock-api';
const manager = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Department Head',
});
test('dashboard KPI, hierarchy, basis and browser history share one URL state', async ({
  page,
}) => {
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/');
  await expect(
    page.locator('.dashboard-summary__metric').filter({ hasText: 'Kritis' }).locator('strong'),
  ).toHaveText('3');
  await expect(page.locator('.dashboard-org-summary')).toContainText('Production Control');
  await page.getByRole('button', { name: 'Department', exact: true }).click();
  await expect(page).toHaveURL(/level=department/);
  await expect(page.locator('.dashboard-org-summary')).toContainText('Production Division');
  await page.getByRole('button', { name: 'Pelaporan', exact: true }).click();
  await expect(page).toHaveURL(/basis=REPORTER/);
  await expect(page).not.toHaveURL(/level=/);
  await page.goBack();
  await expect(page).toHaveURL(/level=department/);
  await page.reload();
  await expect(page.locator('.dashboard-org-summary')).toContainText('Production Division');
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(page).not.toHaveURL(/level=|basis=/);
  const summary = await page.locator('.dashboard-summary').boundingBox();
  const personal = await page.locator('.dashboard-personal').boundingBox();
  expect(personal!.y).toBeGreaterThan(summary!.y);
});
test('Union tabs isolate filters and never expose reporter organization on Private', async ({
  page,
}) => {
  await mockWorkforceApi(page, { session: unionSession({ slot: 'OFFICER_1' }) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ringkasan Voice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pelaporan', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('PIC Union')).toHaveCount(0);
  await expect(page.getByText(/menunggu penugasan/)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Semua area' }).click();
  await page.getByRole('option', { name: 'Sunter 1', exact: true }).click();
  await expect(page).toHaveURL(/private.dashArea=SUNTER_1/);
  await page.getByRole('button', { name: 'General Voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pelaporan', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Semua area' })).toContainText('Semua area');
  await page
    .getByLabel('Jenis dashboard')
    .getByRole('button', { name: 'Private Voice', exact: true })
    .click();
  await expect(page.getByRole('combobox', { name: 'Semua area' })).toContainText('Sunter 1');
});
test('filters are keyboard accessible, show valid dates, and avoid overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/');
  await expect(page.locator('.dashboard-filters')).toBeVisible();
  const panel = await page.locator('.dashboard-filters').boundingBox();
  expect(panel!.height).toBeLessThan(195);
  const organization = page.getByRole('button', { name: 'Filter organisasi', exact: true });
  await organization.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Filter organisasi' });
  await expect(sheet.getByRole('combobox', { name: 'Department', exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(organization).toBeFocused();
  const trigger = page.getByRole('button', { name: 'Filter lainnya', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await page.getByRole('combobox', { name: 'Rentang' }).click();
  await page.getByRole('option', { name: 'Pilih tanggal' }).click();
  await expect(page.getByText('Periksa rentang tanggal')).toBeVisible();
  await page.getByLabel('Dari tanggal').fill('2026-08-01');
  await page.getByLabel('Sampai tanggal').fill('2026-08-30');
  await expect(page.getByText('Periksa rentang tanggal')).toHaveCount(0);
  await expect(page.locator('.dashboard-org-summary')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('repeated level switches keep one unassigned row, filter zero severity, and drop helper texts', async ({
  page,
}) => {
  await mockWorkforceApi(page, {
    session: manager,
    generalDashboard: {
      severity: [
        { label: 'HIGH', value: 5 },
        { label: 'MEDIUM', value: 10 },
      ],
      previousTotal: 0,
    },
  });
  await page.goto('/');
  for (let round = 0; round < 3; round++) {
    await page.getByRole('button', { name: 'Department', exact: true }).click();
    await expect(page.locator('.dashboard-org-summary')).toContainText('Production Division');
    await page.getByRole('button', { name: 'Section', exact: true }).click();
    await expect(page.locator('.dashboard-org-summary')).toContainText('Production Control');
    const unassigned = page
      .locator('.dashboard-organization .chart-card__row')
      .filter({ hasText: 'Belum ditugaskan ke section' });
    await expect(unassigned).toHaveCount(1);
  }
  await page.goto('/?dashFrom=2026-08-01&dashTo=2026-08-30&range=custom');
  const severityCard = page.locator('.chart-card').filter({ hasText: 'Voice menurut severity' });
  await expect(severityCard.locator('.chart-card__row')).toHaveCount(2);
  await expect(page.getByText('Belum ada Voice pada periode sebelumnya')).toHaveCount(0);
  await expect(page.getByText('Perbandingan periode belum tersedia')).toHaveCount(0);
  await expect(page.getByText('Tren menghitung Voice yang disubmit')).toHaveCount(0);
  await expect(page.getByText('Hanya Voice yang boleh Anda buka')).toHaveCount(0);
});

for (const basis of ['HANDLING', 'REPORTER']) {
  test(`restores 12 → 17 → 12 for ${basis}, including reload and navigation`, async ({ page }) => {
    await mockWorkforceApi(page, { session: manager });
    await page.goto(`/?basis=${basis}`);
    const total = page
      .locator('.dashboard-summary__metric')
      .filter({ hasText: 'Total' })
      .locator('strong');
    await expect(total).toHaveText('12');
    const initial = await page.locator('.dashboard-visual-grid').innerText();
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Department', exact: true }).click();
      await expect(total).toHaveText('17');
      await expect(page).toHaveURL(/scopeMode=PARENT/);
      await page.getByRole('button', { name: 'Section', exact: true }).click();
      await expect(total).toHaveText('12');
      await expect(page.locator('.dashboard-visual-grid')).toHaveText(initial, {
        useInnerText: true,
      });
      await expect(page).not.toHaveURL(/[?&](department|division|section|directorate)=/);
    }
    await page.reload();
    await expect(total).toHaveText('12');
    await page.goBack();
    await expect(total).toHaveText('17');
    await page.goForward();
    await expect(total).toHaveText('12');
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(total).toHaveText('12');
  });
}
test('Section Head can switch between own section and department overview', async ({ page }) => {
  await mockWorkforceApi(page, {
    session: memberSession({
      capabilities: ['MEMBER', 'SECTION_HEAD'],
      structuralPosition: 'Section Head',
    }),
  });
  await page.goto('/');
  const total = page
    .locator('.dashboard-summary__metric')
    .filter({ hasText: 'Total' })
    .locator('strong');
  await expect(total).toHaveText('8');
  await page.getByRole('button', { name: 'Seluruh section di department', exact: true }).click();
  await expect(total).toHaveText('12');
  await page.getByRole('button', { name: 'Section saya', exact: true }).click();
  await expect(total).toHaveText('8');
});
test('relative range refresh shares timestamps between aggregate and preview', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-08-30T03:00:00Z') });
  const bounds: Record<string, string[]> = { general: [], preview: [] };
  page.on('request', (request) => {
    const url = new URL(request.url());
    const kind = url.pathname.split('/').at(-1)!;
    if (url.pathname.includes('/dashboard/') && bounds[kind])
      bounds[kind]!.push(url.searchParams.get('to')!);
  });
  await mockWorkforceApi(page, { session: manager });
  await page.goto('/');
  await expect(
    page.locator('.dashboard-summary__metric').filter({ hasText: 'Total' }),
  ).toBeVisible();
  await page.clock.runFor(3500);
  await expect.poll(() => bounds.general!.length).toBeGreaterThan(1);
  await expect.poll(() => bounds.preview!.length).toBe(bounds.general!.length);
  expect(bounds.general).toEqual(bounds.preview);
  expect(Date.parse(bounds.general!.at(-1)!)).toBeGreaterThan(Date.parse(bounds.general![0]!));
});

test('a delayed wider response cannot replace the restored own scope', async ({ page }) => {
  await mockWorkforceApi(page, { session: manager });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let finished!: () => void;
  const completed = new Promise<void>((resolve) => {
    finished = resolve;
  });
  await page.route('**/api/v1/dashboard/general?**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('scopeMode') !== 'PARENT') return route.fallback();
    requested();
    await gate;
    try {
      await route.fulfill({ json: dashboardFixture(manager, url).view });
    } finally {
      finished();
    }
  });
  await page.goto('/');
  const total = page
    .locator('.dashboard-summary__metric')
    .filter({ hasText: 'Total' })
    .locator('strong');
  await expect(total).toHaveText('12');
  await page.getByRole('button', { name: 'Department', exact: true }).click();
  await started;
  await page.goBack();
  await expect(total).toHaveText('12');
  release();
  await completed;
  await expect(total).toHaveText('12');
});
test('preview failure does not hide a successful aggregate', async ({ page }) => {
  await mockWorkforceApi(page, { session: manager });
  await page.route('**/api/v1/dashboard/preview?**', (route) =>
    route.fulfill({ status: 500, json: { code: 'INTERNAL_ERROR', message: 'Unavailable' } }),
  );
  await page.goto('/');
  await expect(
    page.locator('.dashboard-summary__metric').filter({ hasText: 'Total' }).locator('strong'),
  ).toHaveText('12');
  await expect(page.getByText('Inbox gagal dimuat')).toBeVisible();
  await expect(page.getByText('Dashboard gagal dimuat')).toHaveCount(0);
});

test('legacy General browse handles invalid calendar dates without fetching a broader range', async ({
  page,
}) => {
  const reads: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v1/dashboard/general') reads.push(request.url());
  });
  await mockWorkforceApi(page, { session: unionSession({ slot: 'HEAD' }) });
  await page.goto('/general?range=custom&dashFrom=2026-02-30&dashTo=2026-03-01');
  await expect(page.getByText('Periksa rentang tanggal')).toBeVisible();
  expect(reads).toEqual([]);
});

test('refreshes selector metadata when a master update changes the default department', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-08-30T03:00:00Z') });
  await mockWorkforceApi(page, { session: manager });
  let moved = false;
  let metadataReads = 0;
  await page.route('**/api/v1/dashboard/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['/api/v1/dashboard/metadata', '/api/v1/dashboard/general'].includes(url.pathname))
      return route.fallback();
    const fixture = dashboardFixture(manager, url);
    if (moved) {
      const id = orgKey('Production', 'Production Division', 'New Department');
      fixture.metadata.selected.department = id;
      fixture.metadata.scopeLabel = 'New Department';
      fixture.metadata.organization.department = [
        { id, label: 'New Department', parentId: orgKey('Production', 'Production Division') },
      ];
      fixture.metadata.organization.section = [];
      fixture.view.selected = { ...fixture.metadata.selected };
      fixture.view.scopeLabel = 'New Department';
    }
    const metadata = url.pathname.endsWith('/metadata');
    if (metadata) metadataReads++;
    return route.fulfill({ json: metadata ? fixture.metadata : fixture.view });
  });
  await page.goto('/');
  await expect(page.locator('.dashboard-org-summary')).toContainText('Production Control');
  expect(metadataReads).toBe(1);
  moved = true;
  await page.clock.runFor(3500);
  await expect(page.locator('.dashboard-org-summary')).toContainText('New Department');
  await expect.poll(() => metadataReads).toBe(2);
  await expect(page.getByRole('combobox', { name: 'Department', exact: true })).toContainText(
    'New Department',
  );
});
