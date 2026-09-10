import { capture } from './helpers/capture';
import { expect, test } from '@playwright/test';
import { mockWorkforceApi, memberSession, unionSession, baseVoiceItem } from './helpers/mock-api';
import { dashboardFixture } from './helpers/dashboard-fixture';
import { visualPlatform } from './helpers/visual-platform';
const cases = [
  { id: 'department', caps: ['MEMBER', 'MANAGER'], position: 'Department Head' },
  {
    id: 'department-up',
    caps: ['MEMBER', 'MANAGER'],
    position: 'Department Head',
    query: 'level=department',
  },
  { id: 'default-pic', caps: ['MEMBER', 'MANAGER'], position: 'Staff · Default PIC' },
  { id: 'section', caps: ['MEMBER', 'SECTION_HEAD'], position: 'Section Head' },
  { id: 'division', caps: ['MEMBER', 'DIVISION_LEADERSHIP'], position: 'Division Head' },
  {
    id: 'division-global',
    caps: ['MEMBER', 'DIVISION_LEADERSHIP'],
    position: 'Division Head',
    query: 'level=division',
  },
  { id: 'director', caps: ['MEMBER', 'DIRECTOR'], position: 'Director' },
  { id: 'union-head', slot: 'HEAD' as const },
  { id: 'union-officer', slot: 'OFFICER_1' as const },
  { id: 'union-general', slot: 'HEAD' as const, query: 'dashboardTab=general' },
  { id: 'reporter', caps: ['MEMBER', 'MANAGER'], query: 'basis=REPORTER' },
  { id: 'filters', caps: ['MEMBER', 'MANAGER'], query: 'dashSeverity=HIGH&dashCategory=SAFETY' },
  { id: 'long-labels', caps: ['MEMBER', 'MANAGER'] },
  { id: 'unknown-section', caps: ['MEMBER', 'MANAGER'] },
  { id: 'empty', caps: ['MEMBER', 'MANAGER'] },
  { id: 'loading', caps: ['MEMBER', 'MANAGER'] },
  { id: 'error', caps: ['MEMBER', 'MANAGER'] },
];
for (const width of [360, 768, 1440])
  for (const scenario of cases) {
    test(`dashboard ${scenario.id} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.clock.setFixedTime(new Date('2026-08-30T03:00:00Z'));
      const session = scenario.slot
        ? unionSession({ slot: scenario.slot })
        : memberSession({
            capabilities: scenario.caps ?? [],
            structuralPosition: scenario.position ?? 'Department Head',
          });
      await mockWorkforceApi(page, {
        session,
        voiceList: {
          items: [baseVoiceItem({ severity: 'CRITICAL', status: 'OPEN' })],
          nextCursor: null,
        },
      });
      await page.route('**/api/v1/dashboard/*', async (route) => {
        const url = new URL(route.request().url());
        if (
          !url.searchParams.has('basis') ||
          !['/api/v1/dashboard/general', '/api/v1/dashboard/private'].includes(url.pathname)
        )
          return route.fallback();
        if (scenario.id === 'loading') return new Promise<void>(() => {});
        if (scenario.id === 'error')
          return route.fulfill({
            status: 400,
            json: { code: 'INVALID_DASHBOARD_FILTER', message: 'Filter tidak valid', errors: [] },
          });
        const { view } = dashboardFixture(session, url);
        if (scenario.id === 'empty') {
          view.total = 0;
          view.status = [];
          view.severity = [];
          view.category = [];
          view.organization = [];
          view.trend = [];
          view.previousTotal = 0;
        }
        if (scenario.id === 'long-labels')
          view.organization[0]!.label =
            'Manufacturing Engineering & Production Preparation — Assembly Equipment Development';
        return route.fulfill({ json: view });
      });
      await page.goto(`/?${scenario.query ?? ''}`);
      await expect(page.getByRole('heading', { name: 'Ringkasan Voice' })).toBeVisible();
      if (scenario.id === 'error')
        await expect(page.getByText('Dashboard gagal dimuat')).toBeVisible();
      else if (scenario.id === 'loading')
        await expect(page.getByLabel('Memuat dashboard organisasi')).toBeVisible();
      else
        await expect(
          page.locator('.dashboard-summary__metric').filter({ hasText: 'Total' }),
        ).toBeVisible();
      if (scenario.id === 'filters') {
        await page.getByRole('button', { name: 'Filter lainnya, 2 aktif' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      }
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await capture(page, `dashboard-${scenario.id}-${width}-${visualPlatform}.png`, {
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
