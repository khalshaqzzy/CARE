import { expect, test } from '@playwright/test';
import { mockWorkforceApi } from './helpers/mock-api';

const voice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'REPORTER_SELF',
  visibility: 'GENERAL' as const,
  status: 'IN_VERIFICATION',
  area: 'KARAWANG_1',
  title: 'Pencahayaan area produksi kurang',
  detail: 'Lampu di stasiun 3 redup sehingga operator kesulitan membaca instruksi.',
  availableActions: [],
};

test('workforce history visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, { voice });
  // Pin the clock so relative "updated" timestamps are deterministic.
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/history');
  await expect(page.getByRole('heading', { name: 'Voice milik Anda' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-history-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});

test('workforce notifications visual at 360', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockWorkforceApi(page, {});
  await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { name: 'Pusat notifikasi' })).toBeVisible();
  await expect(page).toHaveScreenshot('workforce-notifications-360.png', {
    animations: 'disabled',
    threshold: 0.25,
    maxDiffPixelRatio: 0.06,
  });
});
