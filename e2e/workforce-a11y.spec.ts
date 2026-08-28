import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

type RouteCase = {
  path: string;
  heading: RegExp | string;
  viewport: { width: number; height: number };
  opts?: Parameters<typeof mockWorkforceApi>[1];
};

async function open(page: Page, route: RouteCase) {
  await page.setViewportSize(route.viewport);
  await mockWorkforceApi(page, route.opts ?? {});
  await page.goto(route.path);
  await expect(page.getByRole('heading', { name: route.heading })).toBeVisible();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  return results.violations;
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    return document.documentElement.scrollWidth - document.documentElement.clientWidth;
  });
}

const memberRoutes: RouteCase[] = [
  { path: '/', heading: 'Budi Santoso', viewport: { width: 360, height: 800 } },
  { path: '/voices/new', heading: 'Pilih jenis Voice', viewport: { width: 360, height: 800 } },
  { path: '/history', heading: 'Voice milik Anda', viewport: { width: 360, height: 800 } },
  { path: '/notifications', heading: 'Pusat notifikasi', viewport: { width: 360, height: 800 } },
  { path: '/account', heading: 'Pengaturan akun', viewport: { width: 360, height: 800 } },
];

const responder = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Manager',
});
const union = memberSession({ capabilities: ['MEMBER', 'UNION_HEAD'], structuralPosition: null });

test.describe('workforce accessibility and responsive surface', () => {
  for (const route of memberRoutes) {
    test(`axe + no overflow on ${route.path}`, async ({ page }) => {
      await open(page, route);
      expect(await axe(page)).toEqual([]);
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });
  }

  for (const width of [360, 768, 1440]) {
    test(`detail page has no document overflow at ${width}px`, async ({ page }) => {
      await open(page, {
        path: '/voices/voice-1',
        heading: 'Keluhan fasilitas toilet',
        viewport: { width, height: 900 },
        opts: {
          voice: {
            id: 'voice-1',
            displayId: 'CARE-202608-000001',
            audience: 'REPORTER_SELF',
            visibility: 'PRIVATE',
            status: 'IN_PROGRESS',
            area: 'KARAWANG_1',
            title: 'Keluhan fasilitas toilet',
            detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
            availableActions: [],
          },
        },
      });
      expect(await overflow(page)).toBeLessThanOrEqual(1);
    });
  }

  test('responder work-items is axe clean at 360px', async ({ page }) => {
    await open(page, {
      path: '/work-items',
      heading: 'Voice Member',
      viewport: { width: 360, height: 800 },
      opts: {
        session: responder,
        voice: {
          id: 'voice-1',
          displayId: 'CARE-202608-000001',
          audience: 'GENERAL_RESPONDER',
          visibility: 'GENERAL',
          status: 'IN_VERIFICATION',
          area: 'KARAWANG_1',
          title: 'Pencahayaan area produksi kurang',
          detail: 'Lampu di stasiun 3 redup.',
          availableActions: ['ASK', 'PROCEED'],
        },
      },
    });
    expect(await axe(page)).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test('union/leadership general browse is axe clean at 360px', async ({ page }) => {
    await open(page, {
      path: '/general',
      heading: 'Tinjauan General',
      viewport: { width: 360, height: 800 },
      opts: { session: union },
    });
    expect(await axe(page)).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test('login page is axe clean and keyboard focusable', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { unauthenticated: true });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Selamat datang kembali' })).toBeVisible();
    expect(await axe(page)).toEqual([]);
    await page.evaluate(() => document.body.focus());
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeFocused();
  });

  test('reduced-motion renders overlays without conflict', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, { path: '/', heading: 'Budi Santoso', viewport: { width: 360, height: 800 } });
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test('mobile bottom navigation meets a 44px touch target', async ({ page }) => {
    await open(page, { path: '/', heading: 'Budi Santoso', viewport: { width: 360, height: 800 } });
    const bottomNav = page.getByRole('navigation', { name: 'Navigasi utama' });
    await expect(bottomNav).toBeVisible();
    const targets = await bottomNav.locator('button').evaluateAll((els) =>
      els.map((el) => {
        const rect = el.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
      }),
    );
    expect(targets.length).toBeGreaterThanOrEqual(4);
    for (const target of targets) {
      expect(target.h).toBeGreaterThanOrEqual(44);
      expect(target.w).toBeGreaterThanOrEqual(44);
    }
  });
});
