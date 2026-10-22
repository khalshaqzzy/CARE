import { expect, test } from '@playwright/test';
import { mockAdminApi, voiceDetail, type MockVoice } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';

const responders = {
  total: 1240,
  loggedIn: 868,
  levels: [
    { level: 'GROUP_LEADER', label: 'Group Leader', total: 812, loggedIn: 498 },
    { level: 'SECTION_HEAD', label: 'Section Head', total: 301, loggedIn: 252 },
    { level: 'MANAGER', label: 'Department Head', total: 98, loggedIn: 91 },
    { level: 'DIVISION', label: 'Deputy / Division Head', total: 29, loggedIn: 27 },
  ],
};

test('Accounts resets a password without a temporary one and follows the filters', async ({
  page,
}) => {
  const summaryQueries: URLSearchParams[] = [];
  const accountQueries: URLSearchParams[] = [];
  await mockAdminApi(page);
  await page.route('**/api/v1/admin/accounts/responder-summary**', (route) => {
    summaryQueries.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: responders });
  });
  await page.route('**/api/v1/admin/organization-units/filters/divisions**', (route) =>
    route.fulfill({ json: ['Produksi 1'] }),
  );
  await page.route('**/api/v1/admin/accounts?**', async (route) => {
    accountQueries.push(new URL(route.request().url()).searchParams);
    return route.fallback();
  });
  await page.route('**/api/v1/admin/accounts/*/reset-password', (route) =>
    route.fulfill({
      json: {
        id: 'x',
        username: '000128',
        temporaryPassword: '000128',
        passwordChangeRequired: true,
      },
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ADMIN}/accounts`);

  const card = page.getByLabel('Login responder');
  await expect(card).toContainText('868');
  await page.getByRole('combobox', { name: 'Divisi' }).click();
  await page.getByRole('option', { name: 'Produksi 1', exact: true }).click();
  await expect.poll(() => summaryQueries.at(-1)?.get('division')).toBe('Produksi 1');

  await card.getByRole('button', { name: /^Group Leader:/ }).click();
  await expect(page).toHaveURL(/responderLevel=GROUP_LEADER/);
  await expect
    .poll(() => {
      const query = accountQueries.at(-1);
      return [query?.get('responderLevel'), query?.get('loggedIn')];
    })
    .toEqual(['GROUP_LEADER', 'false']);

  await page.getByRole('button', { name: 'Reset password 000128' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Ya, reset' }).click();
  await expect(dialog).toContainText('Password lama sudah dihapus.');
  await expect(dialog).toContainText('masuk dengan No. Reg saja');
  await expect(dialog).not.toContainText('Password sementara');
});

test('Import lists incomplete leaders and saves an edit in place', async ({ page }) => {
  const abnormality = {
    row: 233,
    noReg: '000519',
    name: 'Sari Wulandari',
    structuralPosition: 'Group Leader',
    values: { line: null, section: null, department: 'Painting', division: 'Produksi 1' },
    missing: ['line', 'section'],
  };
  const preview = (abnormalities: unknown[]) => ({
    id: '00000000-0000-4000-8000-0000000000b1',
    checksum: 'a'.repeat(64),
    version: abnormalities.length ? 1 : 2,
    expiresAt: '2099-01-01T00:00:00.000Z',
    status: 'PREVIEWED',
    summary: {
      rowCount: 7018,
      unitCount: 182,
      create: 41,
      update: 120,
      deactivate: 12,
      unchanged: 6845,
      routeGaps: [],
      department14Rows: 0,
      globalPicInvalid: false,
      unionGaps: [],
      abnormalities,
    },
    errors: [],
    createdAt: '2026-10-22T01:00:00.000Z',
  });
  let saved: unknown = null;
  await mockAdminApi(page, { importDetail: preview([abnormality]) as never });
  await page.route('**/api/v1/admin/organization-imports/*/rows/*', (route) => {
    saved = route.request().postDataJSON();
    return route.fulfill({ json: preview([]) });
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${ADMIN}/imports?previewId=00000000-0000-4000-8000-0000000000b1`);

  const list = page.getByLabel('Data belum lengkap');
  await expect(list).toContainText('1 data belum lengkap');
  await expect(page.getByRole('button', { name: 'Konfirmasi import' })).toBeDisabled();
  const save = list.getByRole('button', { name: 'Simpan' });
  await list.getByLabel('Line 000519').fill('Line 3');
  await expect(save).toBeDisabled();
  await list.getByLabel('Seksi 000519').fill('Seksi Cat');
  await save.click();
  await expect.poll(() => saved).toEqual({ line: 'Line 3', section: 'Seksi Cat' });
});

test('Voice list opens the full read-only detail with time left and rating', async ({ page }) => {
  const voice: MockVoice = {
    id: '00000000-0000-4000-8000-000000000001',
    displayId: 'CARE-202610-000120',
    audience: 'LEADERSHIP_GENERAL_READ_ONLY',
    visibility: 'GENERAL',
    status: 'CLOSED',
    area: 'KARAWANG_1',
    title: 'Kebocoran oli di line press 3',
    detail: 'Oli menetes dari mesin press nomor 3.',
    availableActions: [],
  };
  await mockAdminApi(page, {
    voices: {
      items: [
        {
          id: voice.id,
          displayId: voice.displayId,
          title: voice.title,
          visibility: 'GENERAL',
          area: 'KARAWANG_1',
          severity: 'HIGH',
          status: 'IN_PROGRESS',
          categoryNameSnapshot: 'Keselamatan',
          currentHandlerName: 'Budi Santoso',
          reporterName: 'Andi Pratama',
          reporterDepartment: 'Stamping',
          targetDueAt: '2026-10-23T03:00:00.000Z',
          ratingScore: null,
          updatedAt: '2026-10-21T03:00:00.000Z',
        },
      ],
      nextCursor: null,
    } as never,
    voiceDetail: {
      ...(voiceDetail(voice) as Record<string, unknown>),
      closureCycles: [
        {
          id: 'c1',
          cycleNumber: 1,
          note: 'Seal sudah diganti.',
          closedAt: '2026-10-22T02:10:00.000Z',
          reopenedAt: null,
          reviewState: 'ACCEPTED',
          actor: { id: 'h1', displayName: 'Budi Santoso' },
          rating: { score: 4, feedback: 'Cepat ditangani', reopen: false },
        },
      ],
    } as never,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-22T03:00:00Z'));
  await page.goto(`${ADMIN}/voices`);
  const row = page.getByRole('row', { name: /Kebocoran oli/ });
  await expect(row).toContainText('Andi Pratama');
  await expect(row).toContainText('Sisa 1 hari');
  await page.getByRole('link', { name: voice.title }).click();

  await expect(page).toHaveURL(new RegExp(`/voices/${voice.id}$`));
  await expect(page.getByRole('heading', { name: voice.title })).toBeVisible();
  const completion = page.getByLabel('Komentar responder & rating');
  await expect(completion).toContainText('Seal sudah diganti.');
  await expect(completion.getByLabel('Rating 4 dari 5')).toBeVisible();
  await expect(completion).toContainText('Cepat ditangani');
  await page.getByRole('link', { name: 'Voice Explorer' }).first().click();
  await expect(page).toHaveURL(/\/voices$/);
});
