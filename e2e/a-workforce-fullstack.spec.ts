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
  // The workforce bundle can take time to boot on a busy CI runner; give the
  // smoke room without loosening the assertion budgets.
  test.setTimeout(90_000);
  await page.goto(`${ORIGIN}/login`);
  await expect(page.getByRole('heading', { name: 'Selamat datang kembali' })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByLabel('Username').fill(USERNAME);
  // Role + name — getByLabel('Password') would also match the PasswordInput
  // visibility toggle ("Tampilkan password"), and the label text is
  // "Password *" because of the required marker.
  await page.getByRole('textbox', { name: 'Password' }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();

  // First login is restricted and forces a password change.
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await page.getByLabel('Password saat ini').fill(USERNAME);
  // The required new-password field's accessible name is "Password baru *"; anchor
  // the regex at the start so it does not also match "Konfirmasi password baru".
  await page.getByLabel(/^Password baru/).fill(NEW_PASSWORD);
  await page.getByLabel('Konfirmasi password baru').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Simpan password' }).click();

  // Member home loads real dashboard data from the seeded voices.
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Pencahayaan area produksi kurang')).toBeVisible({
    timeout: 10_000,
  });

  // Open the seeded General voice and read its detail/timeline from the API.
  await page.getByRole('button', { name: 'Buka CARE-202608-900001' }).click();
  await expect(
    page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
  ).toBeVisible();
  await expect(page.getByText('Timeline')).toBeVisible();
});
