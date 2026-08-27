import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { mockAdminApi, type MockVoice } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';

const voice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
  visibility: 'PRIVATE',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title:
    'Keluhan fasilitas toilet yang sangat panjang dan berulang-ulang untuk menguji batas clamp satu atau dua baris',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  availableActions: [],
};

// Every authenticated Admin page, with a stable "content rendered" anchor. The
// Account page needs no /api fetch (uses the session directly).
const pages: { path: string; heading: RegExp | string }[] = [
  { path: '/', heading: 'Overview operasional' },
  { path: '/imports', heading: 'Import & Master Data' },
  { path: '/remediation', heading: 'Remediation & Route' },
  { path: '/union', heading: 'Union Accounts' },
  { path: '/accounts', heading: 'Accounts' },
  { path: '/voices', heading: 'Voice Explorer' },
  { path: '/audit', heading: 'Audit' },
  { path: '/system', heading: 'System Status' },
  { path: '/account', heading: 'Akun Saya' },
];

test.describe('Admin accessibility contract', () => {
  for (const width of [1280, 1440]) {
    for (const page of pages) {
      test(`passes WCAG 2.1 AA + no document overflow on ${page.path} at ${width}px`, async ({
        page: p,
      }) => {
        await mockAdminApi(p, { voices: { items: [voice], nextCursor: null } });
        await p.setViewportSize({ width, height: 900 });
        await p.goto(`${ADMIN}${page.path}`);
        await expect(p.getByRole('heading', { name: page.heading })).toBeVisible();

        const results = await new AxeBuilder({ page: p })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length }))).toEqual([]);

        const overflow = await p.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(1);
      });
    }
  }

  test('keeps long-content Voice titles clamped without document overflow', async ({ page }) => {
    await mockAdminApi(page, { voices: { items: [voice], nextCursor: null } });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ADMIN}/voices`);
    await expect(page.getByText(voice.title)).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    // The title cell is clamped to two lines so it cannot stretch the table.
    const lines = await page
      .getByText(voice.title)
      .evaluate((el) => Math.ceil(el.getBoundingClientRect().height / 24));
    expect(lines).toBeLessThanOrEqual(2);
  });

  test('traps focus in a dialog/drawer and returns it to the trigger on close', async ({
    page,
  }) => {
    await mockAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ADMIN}/accounts`);
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();

    const detail = page.getByRole('button', { name: 'Detail' }).first();
    await detail.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Focus is moved into the dialog on open; it must not remain on the trigger.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null))
      .toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(detail).toBeFocused();
  });

  test('renders overlays correctly under prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockAdminApi(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${ADMIN}/accounts`);
    await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible();

    await page.getByRole('button', { name: 'Detail' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
