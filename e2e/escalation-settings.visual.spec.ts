import { expect, test, type Page } from '@playwright/test';
import { capture } from './helpers/capture';
import { mockAdminApi } from './helpers/mock-api';

// Admin working calendar and per-severity escalation deadlines.

const ADMIN = 'http://127.0.0.1:4174';
const deadline = (
  severity: string,
  respondAmount: number,
  processAmount: number,
  unit = 'WORKING_DAY',
) => ({
  severity,
  respondAmount,
  processAmount,
  unit,
  version: 1,
  updatedAt: '2026-10-01T00:00:00Z',
});

function initialSettings() {
  return {
    calendar: {
      useStandard: false,
      version: 2,
      updatedAt: '2026-10-01T00:00:00Z',
      exceptions: [
        {
          id: '50000000-0000-4000-8000-000000000001',
          date: '2026-10-20',
          kind: 'HOLIDAY',
          label: 'Libur perusahaan',
        },
        {
          id: '50000000-0000-4000-8000-000000000002',
          date: '2026-10-17',
          kind: 'WORKDAY',
          label: 'Masuk pengganti',
        },
      ],
    },
    deadlines: [
      deadline('LOW', 2, 3),
      deadline('MEDIUM', 1, 2),
      deadline('HIGH', 1, 1),
      deadline('CRITICAL', 4, 24, 'CALENDAR_HOUR'),
    ],
  };
}

async function openSettings(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-01T03:00:00Z'));
  await mockAdminApi(page, {});
  let state = initialSettings();
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  await page.route('**/api/v1/admin/escalation-settings**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() : null;
    if (request.method() !== 'GET') requests.push({ method: request.method(), path, body });
    if (request.method() === 'PUT' && path.endsWith('/calendar'))
      state = {
        ...state,
        calendar: { ...state.calendar, useStandard: body.useStandard, version: 3 },
      };
    if (request.method() === 'POST' && path.endsWith('/exceptions'))
      state = {
        ...state,
        calendar: {
          ...state.calendar,
          exceptions: [
            ...state.calendar.exceptions,
            { id: '50000000-0000-4000-8000-000000000003', ...body },
          ],
        },
      };
    if (request.method() === 'DELETE')
      state = {
        ...state,
        calendar: {
          ...state.calendar,
          exceptions: state.calendar.exceptions.filter((row) => !path.endsWith(row.id)),
        },
      };
    if (request.method() === 'PUT' && path.endsWith('/deadlines'))
      state = {
        ...state,
        deadlines: body.deadlines.map((row: Record<string, unknown>) => ({
          ...row,
          version: 2,
          updatedAt: '2026-10-01T03:00:00Z',
        })),
      };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state),
    });
  });
  await page.goto(`${ADMIN}/escalation`);
  await expect(page.getByRole('heading', { name: 'Kalender & Eskalasi' })).toBeVisible();
  return requests;
}

for (const width of [1280, 1440]) {
  test(`admin escalation settings at ${width}`, async ({ page }) => {
    await openSettings(page, width);
    const calendar = page.getByRole('region', { name: 'Kalender hari kerja' });
    await expect(calendar.getByText('Oktober 2026')).toBeVisible();
    await expect(calendar.getByText('Libur perusahaan')).toBeVisible();
    await expect(calendar.getByRole('button', { name: '20', exact: true })).toHaveAttribute(
      'data-kind',
      'off',
    );
    await expect(calendar.getByRole('button', { name: '17', exact: true })).toHaveAttribute(
      'data-kind',
      'work',
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await capture(page, `admin-escalation-settings-${width}.png`, { fullPage: true });
  });
}

test('admin edits the working calendar and severity deadlines', async ({ page }) => {
  const requests = await openSettings(page, 1440);
  const calendar = page.getByRole('region', { name: 'Kalender hari kerja' });

  await calendar.getByRole('button', { name: '28', exact: true }).click();
  await calendar.getByRole('textbox', { name: 'Keterangan' }).fill('Cuti bersama');
  await calendar.getByRole('button', { name: 'Tambah hari khusus' }).click();
  await expect(calendar.getByText('Cuti bersama')).toBeVisible();
  await calendar.getByRole('button', { name: 'Hapus 20 Okt 2026' }).click();
  await expect(calendar.getByText('Libur perusahaan')).toHaveCount(0);

  const deadlines = page.getByRole('region', { name: 'Batas waktu per jenjang' });
  const save = deadlines.getByRole('button', { name: 'Simpan batas waktu' });
  await expect(save).toBeDisabled();
  await deadlines.getByRole('spinbutton', { name: 'Respons Medium' }).fill('2');
  await save.click();
  await expect(save).toBeDisabled();

  await calendar.getByRole('switch').click();
  await expect(calendar.getByText('Kalender standar aktif')).toBeVisible();
  await expect(calendar.getByRole('button', { name: '20', exact: true })).toBeDisabled();

  expect(requests).toEqual([
    {
      method: 'POST',
      path: '/api/v1/admin/escalation-settings/calendar/exceptions',
      body: { date: '2026-10-28', kind: 'HOLIDAY', label: 'Cuti bersama' },
    },
    {
      method: 'DELETE',
      path: '/api/v1/admin/escalation-settings/calendar/exceptions/50000000-0000-4000-8000-000000000001',
      body: null,
    },
    expect.objectContaining({
      method: 'PUT',
      path: '/api/v1/admin/escalation-settings/deadlines',
      body: {
        deadlines: expect.arrayContaining([
          {
            severity: 'MEDIUM',
            respondAmount: 2,
            processAmount: 2,
            unit: 'WORKING_DAY',
            expectedVersion: 1,
          },
        ]),
      },
    }),
    {
      method: 'PUT',
      path: '/api/v1/admin/escalation-settings/calendar',
      body: { useStandard: true, expectedVersion: 2 },
    },
  ]);
  await capture(page, 'admin-escalation-settings-edited-1440.png', { fullPage: true });
});
