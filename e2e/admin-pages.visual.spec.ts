import { expect, test } from '@playwright/test';
import { mockAdminApi, type MockVoice } from './helpers/mock-api';

// Per-page Admin baselines for the premium redesign. Each page renders against
// the mocked contract with a pinned clock so timestamps are pixel-stable.
// Baselines live beside this spec (`admin-pages.visual.spec.ts-snapshots/`)
// and must be regenerated delete-first after intentional UI changes.

const voice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
  visibility: 'PRIVATE',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title: 'Keluhan fasilitas toilet area produksi',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  availableActions: [],
  severity: 'HIGH',
  updatedAt: '2026-08-01T01:00:00.000Z',
  currentHandlerName: 'Data Operator',
};

const pages: { path: string; heading: string; anchor: string; baseline: string }[] = [
  {
    path: '/',
    heading: 'Overview Operasional',
    anchor: 'Ringkasan operasional',
    baseline: 'admin-overview-1440.png',
  },
  {
    path: '/imports',
    heading: 'Import & Master Data',
    anchor: 'Ringkasan batch',
    baseline: 'admin-imports-1440.png',
  },
  {
    path: '/remediation',
    heading: 'Remediation & Route',
    anchor: 'Antrian remediation',
    baseline: 'admin-remediation-1440.png',
  },
  {
    path: '/union',
    heading: 'Union Accounts',
    anchor: 'Head (Akun Utama)',
    baseline: 'admin-union-1440.png',
  },
  { path: '/accounts', heading: 'Accounts', anchor: '000128', baseline: 'admin-accounts-1440.png' },
  {
    path: '/voices',
    heading: 'Voice Explorer',
    anchor: 'Keluhan fasilitas toilet area produksi',
    baseline: 'admin-voices-1440.png',
  },
  {
    path: '/audit',
    heading: 'Audit',
    anchor: 'VOICE_PRIVATE_DETAIL_READ',
    baseline: 'admin-audit-1440.png',
  },
  {
    path: '/system',
    heading: 'System Status',
    anchor: 'Konfigurasi AI',
    baseline: 'admin-system-1440.png',
  },
  {
    path: '/account',
    heading: 'Akun Saya',
    anchor: 'care-admin',
    baseline: 'admin-account-1440.png',
  },
];

for (const p of pages) {
  test(`admin ${p.baseline} visual`, async ({ page }) => {
    await mockAdminApi(page, { voices: { items: [voice], nextCursor: null } });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-08-01T10:00:00Z'));
    await page.goto(`http://127.0.0.1:4174${p.path === '/' ? '' : p.path}`);
    await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
    await expect(page.getByText(p.anchor).first()).toBeVisible();
    await expect(page).toHaveScreenshot(p.baseline, {
      animations: 'disabled',
      threshold: 0.25,
      // Same font-rasterization tolerance as the existing admin-shell baseline.
      maxDiffPixelRatio: 0.06,
    });
  });
}
