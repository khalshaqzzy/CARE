import { capture } from './helpers/capture';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';
import { visualPlatform } from './helpers/visual-platform';

for (const width of [360, 768, 1440]) {
  for (const state of ['OPEN', 'MONITORED', 'PROCESS_FORM', 'REOPENED']) {
    test(`lifecycle ${state} at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await mockWorkforceApi(page, {
        session: memberSession({
          capabilities: ['MEMBER', 'MANAGER'],
          structuralPosition: 'Department Head',
        }),
        voice: {
          id: 'lifecycle-visual',
          displayId: 'CARE-202609-000091',
          visibility: 'GENERAL',
          status: state === 'OPEN' ? 'OPEN' : state === 'REOPENED' ? 'IN_PROGRESS' : 'MONITORED',
          area: 'KARAWANG_1',
          title: 'Penerangan di jalur pejalan kaki',
          detail: 'Lampu di dekat jalur pejalan kaki perlu diperiksa agar area kerja tetap terang.',
          availableActions:
            state === 'OPEN'
              ? ['MONITOR', 'ASSIGN', 'HANDOVER']
              : state === 'REOPENED'
                ? ['MESSAGE', 'CLOSE']
                : ['PROCEED', 'ASSIGN'],
          ...(state === 'REOPENED'
            ? {
                closureCycles: [
                  {
                    id: 'cycle-1',
                    cycleNumber: 1,
                    note: 'Lampu telah diganti.',
                    closedAt: '2026-09-07T01:00:00Z',
                    reopenedAt: '2026-09-08T01:00:00Z',
                    reviewState: 'REJECTED',
                    evidence: [],
                    rating: {
                      score: 2,
                      feedback: 'Lampu masih berkedip pada malam hari.',
                      reopen: true,
                    },
                  },
                ],
              }
            : {}),
        },
      });
      await page.goto('/voices/lifecycle-visual');
      await expect(page.locator('.voice-progress')).toBeVisible();
      if (state === 'PROCESS_FORM') {
        await page.getByRole('button', { name: 'Proses Voice', exact: true }).click();
        await page
          .getByRole('textbox', { name: 'Keterangan penanganan' })
          .fill(
            'Tim maintenance akan memeriksa sambungan listrik dan mengganti lampu yang bermasalah pada shift pagi.',
          );
      }
      await capture(page, `lifecycle-${state.toLowerCase()}-${width}-${visualPlatform}.png`, {
        animations: 'disabled',
        fullPage: true,
      });
    });
  }
}
