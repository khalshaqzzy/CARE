import type { components } from '@care/contracts';
type Session = components['schemas']['SessionResponse'];
import { expect, type Page } from '@playwright/test';
import { memberSession, mockWorkforceApi, unionSession } from './mock-api';
export async function mockRecovery(
  page: Page,
  options: {
    union?: boolean;
    tm?: boolean;
    defaultPassword?: boolean;
    error?: boolean;
    rateLimited?: boolean;
  } = {},
) {
  let session = (options.union ? unionSession() : memberSession()) as Session;
  const identifier = options.union ? 'union-office' : options.tm ? 'TM123456' : '00123456';
  let required = options.defaultPassword ?? false;
  let loggedIn = false;
  await mockWorkforceApi(page, { unauthenticated: true });
  await page.route('**/api/v1/auth/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const reply = (body: unknown, status = 201) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const current = (): Session => ({
      ...session,
      account: { ...session.account, username: identifier },
      passwordChangeRequired: required,
    });
    if (path.endsWith('/session'))
      return reply(loggedIn ? current() : { code: 'UNAUTHENTICATED' }, loggedIn ? 200 : 401);
    if (path.endsWith('/csrf')) return reply({ token: 'csrf-token' }, 200);
    if (path.endsWith('/login/start')) {
      if (required && !options.union) {
        loggedIn = true;
        return reply({ next: 'CHANGE_PASSWORD', session: current() });
      }
      return reply({ next: 'PASSWORD_REQUIRED' });
    }
    if (path.endsWith('/login')) {
      loggedIn = true;
      return reply(current());
    }
    if (path.endsWith('/eligibility')) return reply({ eligible: !options.tm && !options.union });
    if (path.endsWith('/password-reset')) {
      if (options.rateLimited) return reply({ code: 'RATE_LIMITED' }, 429);
      if (options.error) return reply({ code: 'RESET_VERIFICATION_FAILED' }, 400);
      required = true;
      loggedIn = false;
      return reply({ success: true });
    }
    if (path.endsWith('/defer-password-change')) {
      session = { ...session, passwordChangeRequired: false };
      return reply({ ...current(), passwordChangeRequired: false });
    }
    if (path.endsWith('/change-password')) {
      required = false;
      return reply({ success: true });
    }
    if (path.endsWith('/logout')) {
      loggedIn = false;
      return reply({ success: true });
    }
    return route.fallback();
  });
  return identifier;
}
export async function enterIdentifier(page: Page, identifier: string) {
  await page.getByLabel('No. Reg').fill(identifier);
  await page.getByRole('button', { name: 'Lanjutkan', exact: true }).click();
}
export async function chooseBirthDate(page: Page) {
  await expect(page.getByLabel('Tanggal', { exact: true })).toBeFocused();
  await page.getByLabel('Tahun', { exact: true }).selectOption('1990');
  await page.getByLabel('Bulan', { exact: true }).selectOption('02');
  await page.getByLabel('Tanggal', { exact: true }).selectOption('28');
}
export async function assertContained(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
}
