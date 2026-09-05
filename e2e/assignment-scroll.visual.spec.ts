import { visualPlatform } from './helpers/visual-platform';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

// Keep strict visual comparisons within one OS/architecture font rasterizer.

for (const width of [360, 768, 1440]) {
  test(`assignment many candidates at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-08-05T10:00:00Z'));
    await mockWorkforceApi(page, {
      session: memberSession({ capabilities: ['MEMBER', 'MANAGER'] }),
      voice: {
        id: 'voice-1',
        displayId: 'CARE-202608-000001',
        audience: 'GENERAL_RESPONDER',
        visibility: 'GENERAL',
        area: 'KARAWANG_1',
        status: 'OPEN',
        title: 'Perbaikan fasilitas',
        detail: 'Perbaikan fasilitas',
        availableActions: ['ASSIGN'],
      },
      assignmentCandidates: Array.from({ length: 30 }, (_, i) => ({
        id: `sh-${i + 1}`,
        displayName: `Section Head ${String(i + 1).padStart(2, '0')}`,
        activeCount: i % 5,
      })),
    });
    await page.goto('/voices/voice-1');
    await page.getByRole('button', { name: 'Tugaskan', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('textbox', { name: 'Cari penanggung' })).toBeVisible();
    await expect(dialog).toHaveScreenshot(`assignment-list-${width}-${visualPlatform}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
    await dialog.getByRole('radio', { name: /Section Head 30/ }).click();
    await expect(
      dialog.locator('.care-dialog__footer').getByRole('button', { name: 'Tugaskan' }),
    ).toBeInViewport();
    await expect(dialog).toHaveScreenshot(`assignment-selected-${width}-${visualPlatform}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.001,
    });
  });
}
