import { expect, test } from '@playwright/test';

const ORIGIN = 'http://127.0.0.1:4173';
const USERNAME = '000128';
const PASSWORD = '000128';
const NEW_PASSWORD = 'care-member-e2e-123';
const enabled = process.env.FULLSTACK_E2E === '1';

// The seeded member `000128` (Budi Santoso) starts with passwordChangeRequired.
// This smoke runs before the Admin full-stack journey (which later resets /
// deactivates the seeded workforce), so it starts from a fresh seed each run.
test.skip(
  !enabled,
  'Full-stack requires a running CARE API + seeded test DB (set FULLSTACK_E2E=1).',
);

test('member full-stack smoke: login, forced password, home and voice detail', async ({ page }) => {
  await page.goto(`${ORIGIN}/login`);
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();

  // First login is restricted and forces a password change.
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await page.getByLabel('Password saat ini').fill(USERNAME);
  await page.getByLabel('Password baru').fill(NEW_PASSWORD);
  await page.getByLabel('Konfirmasi password baru').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Simpan password' }).click();

  // Member home loads real dashboard data from the seeded voices.
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
  await expect(page.getByText('Pencahayaan area produksi kurang')).toBeVisible({
    timeout: 10_000,
  });

  // Open the seeded General voice and read its detail/timeline from the API.
  await page.getByText('Pencahayaan area produksi kurang').click();
  await expect(
    page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
  ).toBeVisible();
  await expect(page.getByText('Timeline')).toBeVisible();
});
