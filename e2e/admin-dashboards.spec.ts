import { expect, test } from '@playwright/test';
import { mockAdminApi } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';

test('Voice Explorer summary follows the filters and slides away for the list', async ({
  page,
}) => {
  const summaryQueries: URLSearchParams[] = [];
  const listQueries: URLSearchParams[] = [];
  await mockAdminApi(page);
  await page.route('**/api/v1/admin/voices/summary**', (route) => {
    summaryQueries.push(new URL(route.request().url()).searchParams);
    return route.fallback();
  });
  await page.route('**/api/v1/voices?**', (route) => {
    listQueries.push(new URL(route.request().url()).searchParams);
    return route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${ADMIN}/voices`);

  const summary = page.getByRole('region', { name: 'Ringkasan Voice' });
  await expect(summary).toContainText('1.284');
  await expect(summary).toContainText('5 jam 12 mnt');
  await expect(summary.getByRole('heading', { name: 'Kategori' })).toBeVisible();
  // The explorer and its summary cover Voices sent in CARE; migrated ones have their own page.
  expect(summaryQueries.at(-1)?.get('origin')).toBe('CARE');
  expect(listQueries.at(-1)?.get('origin')).toBe('CARE');

  // Picking a status narrows the list and the summary together.
  await summary.getByRole('button', { name: /Diproses/ }).click();
  await expect(page).toHaveURL(/status=IN_PROGRESS/);
  await expect.poll(() => summaryQueries.at(-1)?.get('status')).toBe('IN_PROGRESS');
  await expect.poll(() => listQueries.at(-1)?.get('status')).toBe('IN_PROGRESS');

  // Hidden, the summary is one line of numbers; the choice survives a reload.
  await summary.getByRole('button', { name: 'Sembunyikan' }).click();
  await expect(summary.getByRole('button', { name: 'Tampilkan' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(summary).toContainText('terlambat');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Ringkasan Voice' }).getByRole('button', {
      name: 'Tampilkan',
    }),
  ).toBeVisible();
});

test('Voice Migrasi lists only migrated Voices without a summary', async ({ page }) => {
  const listQueries: URLSearchParams[] = [];
  await mockAdminApi(page);
  await page.route('**/api/v1/voices?**', (route) => {
    listQueries.push(new URL(route.request().url()).searchParams);
    return route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(ADMIN);

  const menu = page.getByRole('navigation', { name: 'Navigasi aplikasi' });
  for (const group of ['Ringkasan', 'Voice', 'Akun & Akses', 'Konfigurasi', 'Sistem'])
    await expect(menu.getByText(group, { exact: true })).toBeVisible();
  // Handover Admin and Koreksi Kategori live in Voice Explorer; the system settings in one page.
  for (const folded of [
    'Handover Admin',
    'Koreksi Kategori',
    'Kalender & Eskalasi',
    'Jawaban Cepat',
    'Panduan',
  ])
    await expect(menu.getByRole('button', { name: folded, exact: true })).toHaveCount(0);
  await menu.getByRole('button', { name: 'Voice Explorer', exact: true }).click();
  await expect(
    page.getByRole('tablist', { name: 'Bagian Voice Explorer' }).getByRole('tab'),
  ).toHaveText(['Semua Voice', /^Handover Admin/, 'Koreksi Kategori']);
  await page.goto(`${ADMIN}/escalation`);
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole('tablist', { name: 'Bagian Pengaturan Sistem' }).getByRole('tab'),
  ).toHaveText(['Kalender & Eskalasi', 'Jawaban Cepat', 'Panduan']);

  await menu.getByRole('button', { name: 'Voice Migrasi', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Voice Migrasi', exact: true })).toBeVisible();
  await expect.poll(() => listQueries.at(-1)?.get('origin')).toBe('MIGRATED');
  await expect(page.getByRole('region', { name: /Ringkasan/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unduh Excel' })).toBeVisible();
});

test('Route & Kategori keeps each job on its own tab', async ({ page }) => {
  await mockAdminApi(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${ADMIN}/remediation`);

  const tabs = page.getByRole('tablist', { name: 'Bagian Route & Kategori' });
  await expect(tabs.getByRole('tab')).toHaveText([/Remediation/, 'Kategori', 'Lokasi shop']);
  await expect(page.getByRole('region', { name: 'Antrian remediation' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Konfigurasi kategori' })).toHaveCount(0);

  await tabs.getByRole('tab', { name: 'Kategori' }).click();
  await expect(page).toHaveURL(/tab=categories/);
  await expect(page.getByRole('region', { name: 'Konfigurasi kategori' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Antrian remediation' })).toHaveCount(0);
});
