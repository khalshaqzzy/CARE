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
  await expect(page.locator('.dashboard-context')).toContainText('Production Control');
  await page.getByRole('button', { name: 'Department', exact: true }).click();
  await expect(page).toHaveURL(/level=department/);
  await expect(page.locator('.dashboard-context')).toContainText('Production Division');
  await page.getByRole('button', { name: 'Pelapor', exact: true }).click();
  await expect(page).toHaveURL(/basis=REPORTER/);
  await expect(page).not.toHaveURL(/level=/);
  await page.goBack();
  await expect(page).toHaveURL(/level=department/);
  await page.reload();
  await expect(page.locator('.dashboard-context')).toContainText('Production Division');
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
  await expect(page.getByRole('heading', { name: 'Ringkasan Private Voice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pelapor', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('PIC Union')).toHaveCount(0);
  await expect(page.getByText(/menunggu penugasan/)).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Semua area' }).click();
  await page.getByRole('option', { name: 'Sunter 1', exact: true }).click();
  await expect(page).toHaveURL(/private.dashArea=SUNTER_1/);
  await page.getByRole('button', { name: 'General Voice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pelapor', exact: true })).toBeVisible();
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
  await expect(page.locator('.dashboard-context')).toBeVisible();
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
    await expect(page.locator('.dashboard-context')).toContainText('Production Division');
    await page.getByRole('button', { name: 'Section', exact: true }).click();
    await expect(page.locator('.dashboard-context')).toContainText('Production Control');
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
