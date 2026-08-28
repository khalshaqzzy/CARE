import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

const responder = memberSession({
  capabilities: ['MEMBER', 'MANAGER'],
  structuralPosition: 'Manager',
});
const union = memberSession({ capabilities: ['MEMBER', 'UNION_HEAD'], structuralPosition: null });

const generalVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'GENERAL_RESPONDER',
  visibility: 'GENERAL' as const,
  status: 'IN_VERIFICATION',
  area: 'KARAWANG_1',
  title: 'Pencahayaan area produksi kurang',
  detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
  availableActions: ['ASK', 'PROCEED'],
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
    await dock.getByRole('button', { name: 'Riwayat' }).click();
    await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
    await dock.getByRole('button', { name: 'Buat', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pilih jenis Voice' })).toBeVisible();
  });

  test('desktop sidebar navigates to member history', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockWorkforceApi(page, { voice: generalVoice });
    await page.goto('/');
    const sidebar = page.getByRole('navigation', { name: 'Navigasi aplikasi' });
    await sidebar.getByRole('button', { name: 'Riwayat' }).click();
    await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
  });

  test('create wizard transitions from type choice to the detail form', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {});
    await page.goto('/voices/new');
    await expect(page.getByRole('heading', { name: 'Pilih jenis Voice' })).toBeVisible();
    await page.getByRole('radio', { name: /General Voice/ }).click();
    await page.getByRole('button', { name: 'Lanjutkan' }).click();
    await expect(page.getByRole('heading', { name: 'Detail Voice General' })).toBeVisible();
    // The required detail fields are present.
    await expect(page.getByRole('combobox', { name: 'Area Temuan' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Judul Voice/ })).toBeVisible();
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
    await expect(page.getByText('Percakapan')).toBeVisible();
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
    await mockWorkforceApi(page, { session: union });
    await page.goto('/general');
    await expect(page.getByRole('heading', { name: 'Tinjauan General' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Status' })).toBeVisible();
    // Leadership/union reads have no lifecycle mutations.
    await expect(page.getByRole('button', { name: 'Tutup' })).toHaveCount(0);
  });

  test('account page renders capabilities and push entry', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {});
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'Pengaturan akun' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notifikasi push' })).toBeVisible();
    await expect(page.getByText('Member')).toBeVisible();
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
