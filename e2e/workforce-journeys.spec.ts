import { expect, test } from '@playwright/test';
import {
  memberSession,
  mockWorkforceApi,
  unionPrivateVoiceDetail,
  unionSession,
} from './helpers/mock-api';

const responder = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Manager',
});
const unionHead = unionSession({ slot: 'HEAD' });
const unionOfficer = unionSession({ slot: 'OFFICER_1' });

const generalVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'GENERAL_RESPONDER',
  visibility: 'GENERAL' as const,
  status: 'IN_VERIFICATION',
  area: 'KARAWANG_1',
  title: 'Pencahayaan area produksi kurang',
  detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
  availableActions: ['ASK', 'MESSAGE', 'PROCEED'],
};

test.describe('workforce journeys (mocked contract)', () => {
  test('member home renders an actionable empty state and recent voice', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { voice: generalVoice });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Buat Voice/ }).first()).toBeVisible();
    await expect(page.getByText('Pencahayaan area produksi kurang')).toBeVisible();
  });

  test('mobile dock navigates to history and the create wizard', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { voice: generalVoice });
    await page.goto('/');
    const dock = page.getByRole('navigation', { name: 'Navigasi utama' });
    await dock.getByRole('button', { name: 'Voice Saya' }).click();
    await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
    await dock.getByRole('button', { name: 'Buat', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mulai Voice baru' })).toBeVisible();
  });

  test('desktop sidebar navigates to member history', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockWorkforceApi(page, { voice: generalVoice });
    await page.goto('/');
    const sidebar = page.getByRole('navigation', { name: 'Navigasi aplikasi' });
    await sidebar.getByRole('button', { name: 'Voice Saya' }).click();
    await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
  });

  test('create wizard transitions from type choice to the detail form', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {});
    await page.goto('/voices/new');
    await expect(page.getByRole('heading', { name: 'Mulai Voice baru' })).toBeVisible();
    await page.getByRole('radio', { name: /General Voice/ }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByRole('heading', { name: 'Detail Voice General' })).toBeVisible();
    // The required detail fields are present; areas open from the Ubah sheet.
    await expect(page.getByRole('textbox', { name: /Judul Voice/ })).toBeVisible();
    await page.getByRole('button', { name: /area temuan/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('radio', { name: 'Karawang 1' }).click();
    await expect(page.getByText('Karawang 1')).toBeVisible();
  });

  test('history lists the member own voices', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { voice: generalVoice });
    await page.goto('/history');
    await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
    await expect(page.getByText('Pencahayaan area produksi kurang')).toBeVisible();
  });

  test('voice detail renders timeline, conversation and responder actions', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: responder, voice: generalVoice });
    await page.goto('/voices/voice-1');
    await expect(
      page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
    ).toBeVisible();
    await expect(page.getByText('Timeline')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Percakapan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tindakan' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tanya Reporter' })).toBeVisible();
  });

  test('notifications center lists items, unread count and an unconfigured push card', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {});
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Pusat notifikasi' })).toBeVisible();
    await expect(page.getByText('Voice baru ditugaskan')).toBeVisible();
    await expect(page.getByText('Notifikasi push belum dikonfigurasi')).toBeVisible();
  });

  test('union general browse is read-only with a suppression surface', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: unionHead });
    await page.goto('/general');
    await expect(page.getByRole('heading', { name: 'Tinjauan General' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Status' })).toBeVisible();
    // Leadership/union reads have no lifecycle mutations.
    await expect(page.getByRole('button', { name: 'Tutup' })).toHaveCount(0);
  });

  test('union home does not request or show the unavailable Member summary', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: unionHead });
    let memberDashboardRequests = 0;
    await page.route('**/api/v1/dashboard/member', async (route) => {
      memberDashboardRequests += 1;
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'NOT_FOUND', message: 'Not found' }),
      });
    });
    await page.goto('/');
    await expect(page.getByText('Private Voice').first()).toBeVisible();
    await expect(page.getByText('General (read-only)')).toBeVisible();
    await expect(page.getByText('Gagal memuat ringkasan')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Buat Voice' })).toHaveCount(0);
    expect(memberDashboardRequests).toBe(0);
  });

  test('union home lists private voices with the assignment queue for the head', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: unionHead,
      privateDashboard: {
        total: 4,
        status: [
          { label: 'OPEN', value: 2 },
          { label: 'IN_PROGRESS', value: 2 },
        ],
        severity: [],
        category: [],
        trend: [],
        division: [],
        department: [],
        suppression: {
          enabled: false,
          threshold: 0,
          division: { suppressedBuckets: 0, suppressedValue: 0 },
          department: { suppressedBuckets: 0, suppressedValue: 0 },
        },
        filters: {
          area: null,
          category: null,
          severity: null,
          status: null,
          from: null,
          to: null,
        },
        generatedAt: '2026-08-03T00:00:00.000Z',
        pendingAssignment: 2,
      },
      voice: {
        id: 'voice-p1',
        displayId: 'CARE-202608-000002',
        audience: 'UNION_ANONYMOUS',
        visibility: 'PRIVATE',
        status: 'OPEN',
        area: 'KARAWANG_2',
        title: 'Laporan papan nama rusak',
        detail: 'Papan nama area shift 3 tergantung satu baut saja.',
        availableActions: [],
        category: null,
      },
    });
    await page.goto('/');
    // Assignment summary card for the Union Head.
    await expect(page.getByText('2 Private Voice menunggu penugasan')).toBeVisible();
    // Localized dashboard labels, never raw enums.
    await expect(page.getByText('Terbuka').first()).toBeVisible();
    await expect(page.getByText('Diproses').first()).toBeVisible();
    // Private operational list with the shared voice card.
    await expect(page.getByText('Laporan papan nama rusak')).toBeVisible();
    // Union never sees reporter self surfaces.
    await expect(page.getByText('Voice Anda')).toHaveCount(0);
  });

  test('union officer home hides the assignment queue', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: unionOfficer });
    await page.goto('/');
    await expect(page.getByText('menunggu penugasan')).toHaveCount(0);
    await expect(page.getByText('Private Voice').first()).toBeVisible();
  });

  test('union private inbox is role-aware and filterable for the head', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: unionHead,
      voice: {
        id: 'voice-p1',
        displayId: 'CARE-202608-000002',
        audience: 'UNION_ANONYMOUS',
        visibility: 'PRIVATE',
        status: 'OPEN',
        area: 'KARAWANG_2',
        title: 'Laporan papan nama rusak',
        detail: 'Papan nama area shift 3 tergantung satu baut saja.',
        availableActions: [],
        category: null,
      },
      unassignedVoiceList: { items: [], nextCursor: null },
    });
    await page.goto('/work-items');
    await expect(page.getByRole('heading', { name: 'Private Voice' })).toBeVisible();
    await expect(
      page.getByText('Seluruh Private Voice melalui Union Head, diurutkan berdasarkan severity.'),
    ).toBeVisible();
    await expect(page.getByText('Laporan papan nama rusak')).toBeVisible();

    // Switching the assignment filter drains the queue view.
    await page.getByRole('combobox', { name: 'Penugasan' }).click();
    await page.getByRole('option', { name: 'Perlu ditugaskan' }).click();
    await expect(page.getByText('Semua Private Voice sudah ditugaskan')).toBeVisible();

    // Returning to "Semua" restores the full private list.
    await page.getByRole('combobox', { name: 'Penugasan' }).click();
    await page.getByRole('option', { name: 'Semua' }).click();
    await expect(page.getByText('Laporan papan nama rusak')).toBeVisible();
  });

  test('union officer private inbox copy reflects the assigned scope', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: unionOfficer });
    await page.goto('/work-items');
    await expect(page.getByRole('heading', { name: 'Private Voice' })).toBeVisible();
    await expect(
      page.getByText('Private Voice yang ditugaskan kepada Anda untuk ditangani.'),
    ).toBeVisible();
    // Officers never get the assignment filter.
    await expect(page.getByRole('combobox', { name: 'Penugasan' })).toHaveCount(0);
    await expect(page.getByText('Belum ada penugasan')).toBeVisible();
  });

  test('union head can assign a union officer from the private voice detail', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: unionHead,
      voiceDetail: unionPrivateVoiceDetail({
        id: 'voice-p1',
        displayId: 'CARE-202608-000002',
        audience: 'UNION_ANONYMOUS',
        visibility: 'PRIVATE',
        status: 'OPEN',
        area: 'KARAWANG_2',
        title: 'Laporan papan nama rusak',
        detail: 'Papan nama area shift 3 tergantung satu baut saja.',
        availableActions: ['ASK', 'PROCEED', 'ASSIGN', 'MESSAGE'],
        identified: false,
        alias: 'Reporter Biru 47',
      }),
    });
    await page.goto('/voices/voice-p1');
    await expect(page.getByRole('heading', { name: 'Laporan papan nama rusak' })).toBeVisible();
    // Anonymous consent surface: alias only, never identity fields.
    await expect(page.getByText('Reporter Biru 47')).toBeVisible();
    await expect(page.getByText('Identitas disembunyikan')).toBeVisible();
    await expect(page.getByText('Sari Wulandari')).toHaveCount(0);
    // Localized status in the meta grid.
    await expect(page.getByText('Terbuka').first()).toBeVisible();

    await page.getByRole('button', { name: 'Tugaskan', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      page.getByText('Pilih Union Officer yang akan menangani Voice ini.'),
    ).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Penanggung' }).click();
    await expect(page.getByRole('option', { name: /Union Officer 1/ })).toBeVisible();
    await page.getByRole('option', { name: /Union Officer 1/ }).click();
    await dialog.getByRole('button', { name: 'Tugaskan', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('union identified detail shows the consented reporter snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: unionHead,
      voiceDetail: unionPrivateVoiceDetail({
        id: 'voice-p2',
        displayId: 'CARE-202608-000003',
        audience: 'UNION_IDENTIFIED',
        visibility: 'PRIVATE',
        status: 'IN_VERIFICATION',
        area: 'SUNTER_1',
        title: 'Permintaan penggantian kursi istirahat',
        detail: 'Kursi area istirahat shift 2 rusak pada sandaran.',
        availableActions: ['ASK', 'PROCEED', 'REASSIGN', 'MESSAGE'],
        identified: true,
      }),
    });
    await page.goto('/voices/voice-p2');
    await expect(page.getByText('Sari Wulandari')).toBeVisible();
    await expect(page.getByText('000129')).toBeVisible();
    await expect(page.getByText('Identitas ditampilkan')).toBeVisible();
    // Verifikasi status terlokalisasi.
    await expect(page.getByText('Verifikasi').first()).toBeVisible();
  });

  test('member status card stays within the mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: memberSession({ displayName: 'VIANTEO SUHANDI' }),
    });
    await page.goto('/');
    const hero = page.locator('.member-hero');
    const summary = page.locator('.status-summary__card');
    await expect(hero).toBeVisible();
    await expect(summary).toBeVisible();
    for (const locator of [hero, summary, page.locator('.status-summary__segments')]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    }
    const heroBox = await hero.boundingBox();
    expect(heroBox!.x).toBeCloseTo((360 - heroBox!.width) / 2, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

  test('account page renders capabilities and push entry', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {});
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Pengaturan akun' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifikasi push' })).toBeVisible();
    await expect(page.getByText('Member', { exact: true })).toBeVisible();
  });

  test('error states never leak stack frames or machine codes', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { error: { status: 500, code: 'INTERNAL_SERVER_ERROR' } });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
    await expect(page.getByText('Gagal memuat ringkasan')).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/\bat .*\.(ts|tsx|js|jsx):\d+:\d+/);
    expect(body).not.toContain('INTERNAL_SERVER_ERROR');
  });
});
