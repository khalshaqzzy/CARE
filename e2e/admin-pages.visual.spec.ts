import { capture } from './helpers/capture';
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
    await capture(page, p.baseline, {
      animations: 'disabled',
      // Same font-rasterization tolerance as the existing admin-shell baseline.
    });
  });
}

const adminHandoverFixture = {
  id: 'handover-1',
  status: 'PENDING',
  createdAt: '2026-09-23T02:10:00.000Z',
  manager: { id: 'manager-1', displayName: 'Dedi Slamet' },
  managerDetail: 'Butuh penanganan lintas department untuk area produksi.',
  adminDetail: null,
  voice: {
    id: 'voice-1',
    displayId: 'CARE-202609-000071',
    title: 'Pencahayaan area produksi kurang',
    detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
    status: 'OPEN',
    version: 2,
    categoryNameSnapshot: 'Fasilitas',
    currentCategoryNameSnapshot: 'Fasilitas',
    area: 'KARAWANG_1',
    severity: 'MEDIUM',
    routeOwner: { id: 'admin-1', displayName: 'CARE Admin' },
  },
} as const;

test('admin handover queue native baseline', async ({ page }) => {
  await mockAdminApi(page, {
    adminHandovers: {
      items: [
        {
          id: adminHandoverFixture.id,
          createdAt: adminHandoverFixture.createdAt,
          manager: adminHandoverFixture.manager,
          managerDetail: adminHandoverFixture.managerDetail,
          voice: adminHandoverFixture.voice,
        },
      ],
      nextCursor: null,
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-09-23T03:00:00.000Z'));
  await page.goto('http://127.0.0.1:4174/handovers');
  await expect(page.getByRole('heading', { name: 'Menunggu penentuan tujuan' })).toBeVisible();
  await expect(page.getByText(adminHandoverFixture.managerDetail)).toBeVisible();
  await capture(page, 'admin-handover-queue-1440.png');
});

test('admin handover decision native baseline', async ({ page }) => {
  await mockAdminApi(page, {
    adminHandoverDetail: adminHandoverFixture,
    adminHandoverOptions: {
      currentCategoryId: null,
      items: [
        {
          id: 'unit-1',
          directorate: 'Manufacturing',
          division: 'Production',
          department: 'Plant Engineering',
          available: true,
          disabledReason: null,
          pic: { id: 'manager-2', displayName: 'Siti Rahmawati' },
          categories: [],
        },
        {
          id: 'unit-2',
          directorate: 'Manufacturing',
          division: 'Safety',
          department: 'Safety Operations',
          available: true,
          disabledReason: null,
          pic: { id: 'manager-3', displayName: 'Andi Pratama' },
          categories: [{ id: 'category-1', key: 'SAFETY', name: 'Keselamatan Kerja' }],
        },
      ],
    },
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.clock.setFixedTime(new Date('2026-09-23T03:00:00.000Z'));
  await page.goto('http://127.0.0.1:4174/handovers/handover-1');
  await expect(page.getByRole('heading', { name: 'Tentukan tujuan Voice' })).toBeVisible();
  await page.getByRole('radio', { name: /Plant Engineering/ }).click();
  await expect(page.getByText('Kategori operasional khusus Voice')).toBeVisible();
  await capture(page, 'admin-handover-decision-1440.png');
});
