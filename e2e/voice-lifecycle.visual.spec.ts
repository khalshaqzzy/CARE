import { capture } from './helpers/capture';
import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';
import { visualPlatform } from './helpers/visual-platform';

for (const width of [360, 768, 1440]) {
  for (const state of [
    'OPEN',
    'RESPONDED',
    'PROCESS_FORM',
    'REOPENED',
    'RESPONSE_FORM',
    'TARGET_OVERDUE',
    'CHAT_3',
  ]) {
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
          status: ['OPEN', 'RESPONSE_FORM'].includes(state)
            ? 'OPEN'
            : ['REOPENED', 'TARGET_OVERDUE'].includes(state)
              ? 'IN_PROGRESS'
              : 'RESPONDED',
          participants: [
            { id: 'reporter', displayName: 'Budi Santoso', role: 'REPORTER' },
            { id: 'owner', displayName: 'Muhammad Rizky Pratama', role: 'DEPARTMENT_HEAD' },
            { id: 'handler', displayName: 'Agus Setiawan', role: 'SECTION_HEAD' },
          ],
          handlingCycleNumber: 1,
          handlingTargets:
            state === 'TARGET_OVERDUE'
              ? [
                  {
                    id: 'target',
                    cycleNumber: 1,
                    days: 3,
                    setAt: '2026-09-01T01:00:00Z',
                    dueAt: '2026-09-04T16:59:59.999Z',
                    state: 'OVERDUE',
                  },
                ]
              : [],
          area: 'KARAWANG_1',
          title: 'Penerangan di jalur pejalan kaki',
          detail: 'Lampu di dekat jalur pejalan kaki perlu diperiksa agar area kerja tetap terang.',
          availableActions: ['OPEN', 'RESPONSE_FORM'].includes(state)
            ? ['RESPOND', 'ASSIGN', 'HANDOVER']
            : state === 'REOPENED'
              ? ['MESSAGE', 'CLOSE']
              : ['MESSAGE', 'PROCEED', 'ASSIGN'],
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
        await page.getByRole('spinbutton', { name: 'Target penyelesaian (hari)' }).fill('3');
      }
      if (state === 'RESPONSE_FORM') {
        await page.getByRole('button', { name: 'Respons Voice' }).click();
        await page
          .getByRole('textbox', { name: 'Keterangan penanganan' })
          .fill('Tim akan memeriksa lokasi dan mengabari perkembangan melalui percakapan ini.');
      }
      if (state === 'CHAT_3') await page.goto('/voices/lifecycle-visual/chat');
      await capture(page, `lifecycle-${state.toLowerCase()}-${width}-${visualPlatform}.png`, {
        animations: 'disabled',
        fullPage: true,
      });
    });
  }
}
