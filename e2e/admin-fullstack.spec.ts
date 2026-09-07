import { expect, test } from '@playwright/test';

const ADMIN = 'http://127.0.0.1:4174';
const USERNAME = process.env.E2E_ADMIN_USERNAME ?? 'e2e-admin';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'e2e-admin-password-1';
const NEW_PASSWORD = 'e2e-admin-password-2';
const enabled = process.env.FULLSTACK_E2E === '1';

test.skip(
  !enabled,
  'Full-stack requires a running CARE API + seeded test DB (set FULLSTACK_E2E=1).',
);

const validCsv = [
  'Noreg,Nama,Posisi (struktural),Directorat,Division,Department,Section',
  '009000,Test User A,Member,Manufacturing,Division C,Department C,Section C',
  '009001,Test User B,Department Head,Manufacturing,Division C,Department C,Section C',
].join('\n');

const invalidCsv = [
  'Noreg,Nama,Directorat,Division,Department,Section',
  '009000,Test User A,Manufacturing,Division C,Department C,Section C',
].join('\n');

async function loginAndChangePassword(page: import('@playwright/test').Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel('Username Admin').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk ke Admin' }).click();

  // The seeded admin requires a password change, so the session is restricted
  // and the app redirects to /change-password before allowing Overview.
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await page.getByLabel('Password saat ini').fill(PASSWORD);
  await page.getByLabel('Password baru').fill(NEW_PASSWORD);
  await page.getByLabel('Konfirmasi password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Simpan password' }).click();

  await expect(page.getByRole('heading', { name: 'Overview operasional' })).toBeVisible();
}

test('Admin full-stack journey: login, forced password, per-page wiring', async ({ page }) => {
  await loginAndChangePassword(page);

  // Overview renders real aggregate data written by the seed.
  await expect(page.getByText('Akun aktif')).toBeVisible();

  // Imports (read-only): the seeded CONFIRMED batch shows, and an invalid file
  // is rejected. The mutating valid-import confirm runs last, after the other
  // pages, because confirming a snapshot supersedes the seeded organization and
  // would deactivate the seeded workforce.
  await page.goto(`${ADMIN}/imports`);
  await expect(page.getByRole('heading', { name: 'Import & Master Data' })).toBeVisible();
  await expect(page.getByText('CONFIRMED').first()).toBeVisible();

  await page.setInputFiles('input[type="file"]', {
    name: 'invalid.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(invalidCsv),
  });
  await page.getByRole('button', { name: 'Validasi data' }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();

  // Remediation shows the open routing issue.
  await page.goto(`${ADMIN}/remediation`);
  await expect(page.getByRole('heading', { name: 'Remediation & Route' })).toBeVisible();
  await expect(page.getByText('Department Head belum tersedia').first()).toBeVisible();

  // Union: the three fixed slots are populated from the seed. The Head node
  // carries the design title "Head (Akun Utama)", so match the account names
  // as substrings rather than exact node titles.
  await page.goto(`${ADMIN}/union`);
  await expect(page.getByRole('heading', { name: 'Union Accounts' })).toBeVisible();
  await expect(page.getByText('Union Head').first()).toBeVisible();
  await expect(page.getByText('Union 1').first()).toBeVisible();
  await expect(page.getByText('Union 2').first()).toBeVisible();

  // Accounts: reset a workforce password through the detail drawer; a successful
  // reset closes the confirm dialog (session revocation is covered in the
  // integration suite), proving the reset mutation wiring against the real API.
  await page.goto(`${ADMIN}/accounts`);
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();
  await page.locator('tr', { hasText: '000128' }).getByRole('button', { name: 'Detail' }).click();
  const resetDialog = page.getByRole('dialog', { name: 'Reset password' });
  await page.getByRole('button', { name: /Reset password/ }).click();
  await expect(resetDialog).toBeVisible();
  await resetDialog.getByRole('button', { name: 'Ya, reset' }).click();
  await expect(resetDialog).toBeHidden();

  // Voice Explorer: the Private voice shows the full immutable reporter identity
  // read-only and exposes no lifecycle action.
  await page.goto(`${ADMIN}/voices`);
  await expect(page.getByRole('heading', { name: 'Voice Explorer' })).toBeVisible();
  const privateRow = page.locator('tr', { hasText: 'Keluhan fasilitas toilet' });
  await expect(privateRow).toBeVisible();
  await privateRow.getByRole('button', { name: 'Detail' }).click();
  await expect(page.getByText(/Budi Santoso \(000128\)/)).toBeVisible({ timeout: 10_000 });
  // Read-only: no lifecycle action affordance is exposed.
  await expect(page.getByText(/Tidak ada kontrol aksi/)).toBeVisible();

  // Audit: reading the Private voice recorded a redacted read event; the seeded
  // + generated events render and can be filtered via the Action select.
  await page.goto(`${ADMIN}/audit`);
  await expect(page.getByRole('heading', { name: 'Audit' })).toBeVisible();
  await expect(page.getByText('VOICE_PRIVATE_DETAIL_READ').first()).toBeVisible();
  // Filters are URL-driven; navigate with the action param (the Action control
  // is a Radix select, not a native <select>).
  await page.goto(`${ADMIN}/audit?action=VOICE_PRIVATE_DETAIL_READ`);
  await expect(page.getByText('VOICE_PRIVATE_DETAIL_READ').first()).toBeVisible();

  // System Status surface renders the real health/readiness/release.
  await page.goto(`${ADMIN}/system`);
  await expect(page.getByRole('heading', { name: 'System Status' })).toBeVisible();
  await expect(page.getByText('/health')).toBeVisible();
  await expect(page.getByText('/ready')).toBeVisible();
  await expect(page.getByText('/release.json')).toBeVisible();

  // Imports (mutation) LAST: a valid CSV can be previewed and confirmed; the
  // confirm supersedes the seeded organization, so it must come after every
  // assertion that depends on the seeded org.
  await page.goto(`${ADMIN}/imports`);
  await page.setInputFiles('input[type="file"]', {
    name: 'e2e.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(validCsv),
  });
  await page.getByRole('button', { name: 'Validasi data' }).click();
  await expect(page.getByText('Checksum').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Konfirmasi import' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByRole('button', { name: 'Konfirmasi import' }).click();
  await page.getByRole('button', { name: 'Ya, konfirmasi' }).click();
  await expect(page.getByText('Import telah dikonfirmasi.')).toBeVisible({ timeout: 20_000 });
});
