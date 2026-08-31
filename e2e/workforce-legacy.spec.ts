import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

const voice = {
  id: 'voice-legacy',
  displayId: 'CARE-202608-000011',
  audience: 'GENERAL_RESPONDER',
  visibility: 'GENERAL' as const,
  status: 'IN_VERIFICATION',
  area: 'KARAWANG_1',
  title: 'Legacy Safari tetap dapat bekerja',
  detail: 'Journey online harus tersedia tanpa service worker dan Web Push.',
  availableActions: ['ASK', 'MESSAGE', 'PROCEED'],
};

async function emulateLegacyApis(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    delete (Object as unknown as { fromEntries?: unknown }).fromEntries;
    delete (String.prototype as unknown as { replaceAll?: unknown }).replaceAll;
    delete (Array.prototype as unknown as { at?: unknown }).at;
    delete (window as unknown as { queueMicrotask?: unknown }).queueMicrotask;
    delete (window as unknown as { PointerEvent?: unknown }).PointerEvent;
    delete (window as unknown as { ResizeObserver?: unknown }).ResizeObserver;
    delete (window as unknown as { PushManager?: unknown }).PushManager;
    delete (window as unknown as { Notification?: unknown }).Notification;
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
  });
}

test('iOS 11.3 runs the authenticated workforce in core-online mode', async ({ page }) => {
  await emulateLegacyApis(page);
  const pushRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/notifications/push/')) pushRequests.push(request.url());
  });
  await mockWorkforceApi(page, { voice });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Budi Santoso' })).toBeVisible();
  await expect(page.getByText('CARE berjalan dalam mode online')).toBeVisible();
  await expect(page.locator('[data-care-boot-state="loading"]')).toHaveCount(0);

  await page.goto('/voices/new');
  await page.getByRole('radio', { name: /General Voice/ }).click();
  await page.getByRole('button', { name: 'Lanjutkan' }).click();
  await expect(page.getByRole('heading', { name: 'Detail Voice General' })).toBeVisible();
  await page.getByRole('button', { name: 'Pilih area temuan' }).click();
  await page.getByRole('radio', { name: 'Karawang 1' }).click();
  await page.getByRole('textbox', { name: /Detail Lokasi/ }).fill('Line 1 dekat mesin A');
  await page.getByRole('textbox', { name: /Judul Voice/ }).fill('Uji create Safari lama');
  await page
    .getByRole('textbox', { name: /Detail Voice/ })
    .fill('Alur create harus tetap mengirim mutation langsung ke API secara online.');
  await page.getByRole('button', { name: 'Simpan & Analisis' }).click();
  await expect(page.getByRole('heading', { name: 'Tinjau sebelum kirim' })).toBeVisible();

  await page.goto('/history');
  await expect(page.getByText('Legacy Safari tetap dapat bekerja')).toBeVisible();
  await expect(page.locator('select.care-native-select').first()).toBeVisible();

  await page.goto('/notifications');
  await expect(page.getByText('Web Push memerlukan iOS 16.4 atau lebih baru')).toBeVisible();
  expect(pushRequests).toEqual([]);
  expect(
    await page.evaluate(() => ({
      fromEntries: typeof Object.fromEntries,
      replaceAll: typeof String.prototype.replaceAll,
      at: typeof Array.prototype.at,
      queueMicrotask: typeof window.queueMicrotask,
    })),
  ).toEqual({
    fromEntries: 'function',
    replaceAll: 'function',
    at: 'function',
    queueMicrotask: 'function',
  });

  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Akun' })).toBeVisible();
});

test('iOS 11.3 keeps responder detail and online actions available', async ({ page }) => {
  await emulateLegacyApis(page);
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') mutations.push(new URL(request.url()).pathname);
  });
  await mockWorkforceApi(page, {
    session: memberSession({ capabilities: ['MEMBER', 'MANAGER'], structuralPosition: 'Manager' }),
    voice,
  });
  await page.goto('/voices/voice-legacy');
  await expect(
    page.getByRole('heading', { name: 'Legacy Safari tetap dapat bekerja' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Percakapan' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tanya Reporter' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Proses' })).toBeVisible();
  await page.getByPlaceholder('Tulis pesan…').fill('Pesan dari Safari lama');
  await page.locator('.conversation input[type="file"]').setInputFiles({
    name: 'legacy.png',
    mimeType: 'image/png',
    buffer: Buffer.from('legacy-image'),
  });
  await page.getByRole('button', { name: 'Kirim pesan' }).click();
  await expect.poll(() => mutations.some((path) => path.endsWith('/messages'))).toBe(true);

  await page.getByRole('button', { name: 'Proses' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Proses Voice' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Proses' }).click();
  await expect.poll(() => mutations.some((path) => path.endsWith('/proceed'))).toBe(true);
});

test('iOS 11.3 renders the forced-password gate instead of a blank root', async ({ page }) => {
  await emulateLegacyApis(page);
  await mockWorkforceApi(page, {
    session: { ...memberSession(), passwordChangeRequired: true },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ganti password sementara' })).toBeVisible();
  await expect(page.getByLabel('Password saat ini')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan password' })).toBeVisible();
});
