import { expect, test } from '@playwright/test';
import { mockAdminApi, type MockVoice } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';

const voice: MockVoice = {
  id: 'voice-1',
  displayId: 'CARE-202608-000001',
  audience: 'ADMIN_PRIVATE_FULL_IDENTITY_READ_ONLY',
  visibility: 'PRIVATE',
  status: 'IN_PROGRESS',
  area: 'KARAWANG_1',
  title: 'Keluhan fasilitas toilet',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  availableActions: [],
};

// Each page with its data endpoint(s) mocked so the happy path renders content.
const happy: { path: string; heading: RegExp | string; anchor: string }[] = [
  { path: '/', heading: 'Overview operasional', anchor: 'Akun aktif' },
  { path: '/imports', heading: 'Import & Master Data', anchor: 'Unggah file organisasi' },
  { path: '/remediation', heading: 'Remediation & Route', anchor: 'MISSING_DEPARTMENT_HEAD' },
  { path: '/union', heading: 'Union Accounts', anchor: 'Union Head' },
  { path: '/accounts', heading: 'Accounts', anchor: '000128' },
  { path: '/voices', heading: 'Voice Explorer', anchor: voice.title },
  { path: '/audit', heading: 'Audit', anchor: 'VOICE_PRIVATE_DETAIL_READ' },
  { path: '/system', heading: 'System Status', anchor: '/health' },
  { path: '/account', heading: 'Akun Saya', anchor: 'care-admin' },
];

// Error-mode pages (everything but the session returns a safe 500 envelope).
const errorPages = happy.filter((p) => p.path !== '/account');

// Empty-state pages (list-backed endpoints) with their empty message.
const empty: { path: string; message: string }[] = [
  { path: '/imports', message: 'Belum ada import' },
  { path: '/remediation', message: 'Tidak ada isu' },
  { path: '/union', message: 'Belum ada akun' },
  { path: '/accounts', message: 'Tidak ada akun' },
  { path: '/voices', message: 'Tidak ada Voice' },
  { path: '/audit', message: 'Tidak ada audit' },
];

test.describe('Admin mocked-contract journeys', () => {
  test.describe('happy path', () => {
    for (const p of happy) {
      test(`renders ${p.path}`, async ({ page }) => {
        await mockAdminApi(page, { voices: { items: [voice], nextCursor: null } });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`${ADMIN}${p.path}`);
        await expect(page.getByRole('heading', { name: p.heading })).toBeVisible();
        await expect(page.getByText(p.anchor).first()).toBeVisible();
      });
    }

    test('navigates to every primary page through the Admin sidebar', async ({ page }) => {
      await mockAdminApi(page, { voices: { items: [voice], nextCursor: null } });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(ADMIN);
      const sidebar = page.getByRole('navigation', { name: 'Navigasi aplikasi' });
      for (const destination of [
        { label: 'Import & Master Data', heading: 'Import & Master Data' },
        { label: 'Remediation & Route', heading: 'Remediation & Route' },
        { label: 'Union Accounts', heading: 'Union Accounts' },
        { label: 'Accounts', heading: 'Accounts' },
        { label: 'Voice Explorer', heading: 'Voice Explorer' },
        { label: 'Audit', heading: 'Audit' },
        { label: 'System Status', heading: 'System Status' },
        { label: 'Overview', heading: 'Overview operasional' },
      ]) {
        await sidebar.getByRole('button', { name: destination.label, exact: true }).click();
        await expect(page.getByRole('heading', { name: destination.heading })).toBeVisible();
      }
    });

    for (const terminal of ['FAILED', 'CONFIRMED'] as const) {
      test(`refreshes import history when detail polling reaches ${terminal}`, async ({ page }) => {
        await mockAdminApi(page, {
          importStatuses: ['PROCESSING', terminal],
          importFailureCode: 'PROCESSING_TIMEOUT',
        });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`${ADMIN}/imports?previewId=batch-1`);
        await expect(page.getByText('PROCESSING').first()).toBeVisible();
        await expect(page.getByText(terminal).first()).toBeVisible({ timeout: 10_000 });
        const history = page.getByRole('table').last();
        await expect(history.getByText(terminal)).toBeVisible();
        if (terminal === 'FAILED')
          await expect(history.getByText('PROCESSING_TIMEOUT')).toBeVisible();
      });
    }
  });

  test.describe('error state', () => {
    for (const p of errorPages) {
      test(`surfaces a safe retryable error on ${p.path}`, async ({ page }) => {
        await mockAdminApi(page, { error: { status: 500, code: 'INTERNAL' } });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`${ADMIN}${p.path}`);
        const alert = page.getByRole('alert').first();
        await expect(alert).toBeVisible();
        // No raw stack frame / machine code leaks into the error surface.
        await expect(alert).not.toContainText(/at\s+\S+:\d+/);
        await expect(alert).not.toContainText('INTERNAL');
      });
    }
  });

  test.describe('empty state', () => {
    for (const p of empty) {
      test(`shows the empty state on ${p.path}`, async ({ page }) => {
        await mockAdminApi(page, {
          accounts: { items: [], nextCursor: null },
          imports: { items: [], nextCursor: null },
          remediation: { items: [], nextCursor: null },
          union: [],
          audit: { items: [], nextCursor: null },
          voices: { items: [], nextCursor: null },
        });
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`${ADMIN}${p.path}`);
        await expect(page.getByText(p.message).first()).toBeVisible();
      });
    }
  });
});
