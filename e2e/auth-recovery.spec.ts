import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  assertContained,
  chooseBirthDate,
  enterIdentifier,
  mockRecovery,
} from './helpers/auth-recovery';

for (const width of [360, 390, 768, 1440]) {
  test(`shared login and recovery journey at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const identifier = await mockRecovery(page);
    await page.goto('/login');
    await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveCount(0);
    const top = (await page.locator('.auth-card').boundingBox())!.y;
    await enterIdentifier(page, identifier);
    await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeFocused();
    expect((await page.locator('.auth-card').boundingBox())!.y).toBeCloseTo(top, 0);
    await assertContained(page);
    await page.getByRole('button', { name: 'Ubah No. Reg' }).click();
    await expect(page.getByLabel('No. Reg')).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await page.getByRole('link', { name: 'Lupa Password?' }).click();
    await expect(page.getByLabel('No. Reg')).toHaveValue(identifier);
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await chooseBirthDate(page);
    await assertContained(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByText('Password anda sudah direset, silahkan login kembali.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
    await expect(page.getByLabel('Password saat ini')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lain kali' })).toBeVisible();
    await assertContained(page);
  });
}
test('Ubah No. Reg restores editing and the date row keeps Tanggal visible', async ({ page }) => {
  await mockRecovery(page);
  await page.goto('/login');
  await enterIdentifier(page, '00123456');
  // The removed step heading must not reappear next to the control.
  await expect(page.getByText('Password akun', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ubah No. Reg' }).click();
  await expect(page.getByLabel('No. Reg')).toBeEditable();
  await expect(page.getByLabel('No. Reg')).toBeFocused();
  await page.getByLabel('No. Reg').fill('00999999');
  await expect(page.getByLabel('No. Reg')).toHaveValue('00999999');

  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await page.getByRole('link', { name: 'Lupa Password?' }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByText('Verifikasi akun', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Ketersediaan reset', { exact: true })).toHaveCount(0);
  await chooseBirthDate(page);
  // Tanggal must be at least as wide as Bulan so its label never clips.
  const dayBox = (await page.getByLabel('Tanggal', { exact: true }).boundingBox())!;
  const monthBox = (await page.getByLabel('Bulan', { exact: true }).boundingBox())!;
  expect(dayBox.width).toBeGreaterThanOrEqual(monthBox.width - 1);
  await page.getByRole('button', { name: 'Ubah No. Reg' }).click();
  await expect(page.getByLabel('No. Reg')).toBeEditable();
  await expect(page.getByLabel('No. Reg')).toBeFocused();
});

for (const options of [{ tm: true }, { union: true }]) {
  test(`unavailable recovery ${options.tm ? 'TM' : 'Union'}`, async ({ page }) => {
    const identifier = await mockRecovery(page, options);
    await page.goto('/forgot-password');
    await enterIdentifier(page, identifier);
    await expect(page.getByText('Reset Password belum tersedia untuk akun Anda.')).toBeVisible();
    await expect(page.getByLabel('Tahun', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reset password', exact: true })).toHaveCount(0);
  });
}
test('Union default uses the same form, requires password and cannot defer', async ({ page }) => {
  const identifier = await mockRecovery(page, { union: true, defaultPassword: true });
  await page.goto('/login');
  await enterIdentifier(page, identifier);
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('temporary');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await expect(page.getByLabel('Password saat ini')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lain kali' })).toHaveCount(0);
});
for (const rateLimited of [false, true])
  test(`reset failure retains inputs ${rateLimited}`, async ({ page }) => {
    const identifier = await mockRecovery(page, { error: true, rateLimited });
    await page.goto('/forgot-password');
    await enterIdentifier(page, identifier);
    await chooseBirthDate(page);
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      rateLimited ? 'Terlalu banyak percobaan' : 'tanggal lahir tidak sesuai',
    );
    await expect(page.getByLabel('Tahun', { exact: true })).toHaveValue('1990');
  });
test('reduced motion and keyboard reveal remain operable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockRecovery(page);
  await page.goto('/login');
  await page.getByLabel('No. Reg').fill('00123456');
  await page.getByLabel('No. Reg').press('Enter');
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('pending and failed lookups keep the identifier and allow a safe retry', async ({ page }) => {
  await mockRecovery(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/auth/login/start', async (route) => {
    await pending;
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'RATE_LIMITED' }),
    });
  });
  await page.goto('/login');
  await enterIdentifier(page, '00123456');
  await expect(page.getByRole('button', { name: 'Lanjutkan' })).toBeDisabled();
  await expect(page.getByLabel('No. Reg')).toHaveAttribute('readonly', '');
  release();
  await expect(page.getByRole('alert')).toContainText('Terlalu banyak percobaan');
  await expect(page.getByRole('button', { name: 'Lanjutkan' })).toBeEnabled();
  await page.route('**/api/v1/auth/login/start', (route) => route.abort('internetdisconnected'));
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('alert')).toContainText('Koneksi terputus');
  await expect(page.getByLabel('No. Reg')).toHaveValue('00123456');
  await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toHaveCount(0);
});
