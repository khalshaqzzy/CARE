import { expect, test } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

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
  availableActions: [],
};

const anonDetail = {
  id: 'voice-2',
  displayId: 'CARE-202608-000002',
  audience: 'PRIVATE_UNION_ANONYMOUS',
  visibility: 'PRIVATE',
  area: 'KARAWANG_1',
  locationDetail: 'Lantai 3, dekat mesin produksi',
  title: 'Keluhan fasilitas toilet',
  detail: 'Toilet lantai 2 tidak berfungsi sejak pagi.',
  category: null,
  severity: 'MEDIUM',
  status: 'OPEN',
  version: 1,
  submittedAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  classificationSource: 'AI',
  routeOwner: { id: 'union-head-1', displayName: 'Union Head' },
  currentHandler: null,
  attachments: [],
  locationReview: null,
  closureCycles: [],
  availableActions: ['ASK'],
  // Anonymous contract must carry NO reporter identity fields.
};

const attachmentDetail = {
  ...generalVoice,
  audience: 'REPORTER_SELF',
  availableActions: [],
  attachments: [
    {
      id: 'att-1',
      purpose: 'VOICE',
      mimeType: 'image/png',
      size: 68,
      state: 'READY',
      width: 1,
      height: 1,
      createdAt: '2026-08-01T00:00:00.000Z',
    },
  ],
};

test.describe('workforce UI security probes', () => {
  test('private HIDE never leaks reporter identity to Union', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: union, voiceDetail: anonDetail });
    await page.goto('/voices/voice-2');
    await expect(page.getByRole('heading', { name: 'Keluhan fasilitas toilet' })).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('Budi Santoso');
    expect(body).not.toContain('000128');
    expect(body).not.toContain('Manufacturing');
  });

  test('aggregate read never exposes a Voice id/title beyond the list scope', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, {
      session: union,
      generalDashboard: {
        total: 12,
        status: [{ label: 'OPEN', value: 5 }],
        severity: [{ label: 'HIGH', value: 3 }],
        category: [{ label: 'SAFETY', value: 8 }],
        trend: [{ label: 'week', value: 12 }],
        division: [{ label: 'Division A', value: 12 }],
        department: [{ label: 'Department A', value: 12 }],
        suppression: {
          enabled: false,
          threshold: 0,
          division: { suppressedBuckets: 0, suppressedValue: 0 },
          department: { suppressedBuckets: 0, suppressedValue: 0 },
        },
        filters: { area: null, category: null, severity: null, status: null, from: null, to: null },
        generatedAt: '2026-08-01T00:00:00.000Z',
      },
    });
    await page.goto('/general');
    await expect(page.getByRole('heading', { name: 'Tinjauan General' })).toBeVisible();
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/CARE-2026\d{2}-\d{6}/);
    expect(body).not.toContain('Pencahayaan area produksi kurang');
  });

  test('CSRF token is attached to sensitive mutations', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    let csrfHeader: string | null = null;
    await mockWorkforceApi(page, { unread: 2 });
    // Register the capture route after the broad mock so it wins priority.
    await page.route('**/api/v1/notifications/read-all', async (route) => {
      csrfHeader = route.request().headers()['x-csrf-token'] ?? null;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ updated: 1 }),
      });
    });
    await page.goto('/notifications');
    await page.getByRole('button', { name: 'Tandai semua dibaca' }).click();
    await expect.poll(() => csrfHeader).toBe('csrf-token');
  });

  test('a member voice with no server actions shows no lifecycle affordance', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { voice: generalVoice });
    await page.goto('/voices/voice-1');
    await expect(
      page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tindakan' })).toHaveCount(0);
  });

  test('attachments are served only through the authorized media endpoint', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { voiceDetail: attachmentDetail });
    await page.goto('/voices/voice-1');
    await expect(
      page.getByRole('heading', { name: 'Pencahayaan area produksi kurang' }),
    ).toBeVisible();
    const images = await page
      .locator('img')
      .evaluateAll((els) => els.map((el) => el.getAttribute('src')));
    expect(images.some((src) => src?.startsWith('/api/v1/media/'))).toBe(true);
    expect(images.every((src) => !src?.startsWith('/media/') && !src?.includes('/storage/'))).toBe(
      true,
    );
  });
});
