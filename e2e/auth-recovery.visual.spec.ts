import { expect, test } from '@playwright/test';
import { capture } from './helpers/capture';
import {
  assertContained,
  chooseBirthDate,
  enterIdentifier,
  mockRecovery,
} from './helpers/auth-recovery';
const scenarios = [
  'login-initial',
  'login-password',
  'login-union',
  'reset-initial',
  'reset-date',
  'reset-tm',
  'reset-union',
  'reset-error',
  'reset-success',
  'password-default',
  'password-union',
] as const;
for (const width of [360, 768, 1440])
  for (const scenario of scenarios)
    test(`auth ${scenario} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const identifier = await mockRecovery(page, {
        union: scenario.includes('union'),
        tm: scenario === 'reset-tm',
        defaultPassword: scenario.startsWith('password-'),
        error: scenario === 'reset-error',
      });
      await page.goto(scenario.startsWith('reset-') ? '/forgot-password' : '/login');
      if (!scenario.endsWith('initial')) await enterIdentifier(page, identifier);
      if (['reset-date', 'reset-error', 'reset-success'].includes(scenario))
        await chooseBirthDate(page);
      if (['reset-error', 'reset-success'].includes(scenario))
        await page.getByRole('button', { name: 'Reset password', exact: true }).click();
      if (scenario === 'password-union') {
        await page.getByRole('textbox', { name: 'Password', exact: true }).fill('temporary');
        await page.getByRole('button', { name: 'Masuk', exact: true }).click();
      }
      if (scenario === 'reset-success')
        await expect(
          page.getByText('Password anda sudah direset, silahkan login kembali.'),
        ).toBeVisible();
      if (scenario === 'reset-error')
        await expect(page.getByRole('alert')).toContainText('tanggal lahir tidak sesuai');
      if (['login-password', 'login-union'].includes(scenario))
        await expect(page.getByRole('textbox', { name: 'Password', exact: true })).toBeFocused();
      if (scenario.startsWith('password-'))
        await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
      await assertContained(page);
      await capture(page, `auth-${scenario}-${width}.png`, { fullPage: true });
    });
