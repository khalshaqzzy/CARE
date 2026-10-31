import { expect, test, type Page } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

type Guide = {
  id: string;
  kind: 'PDF' | 'VIDEO';
  title: string;
  videoUrl: string | null;
  size: number | null;
  updatedAt: string;
};

const SUBMIT: Guide = {
  id: '6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1001',
  kind: 'PDF',
  title: 'Panduan Submit Voice',
  videoUrl: null,
  size: 245_000,
  updatedAt: '2026-10-29T03:00:00.000Z',
};
const RESPONDER: Guide = {
  id: '6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1002',
  kind: 'PDF',
  title: 'Panduan Responder',
  videoUrl: null,
  size: 512_000,
  updatedAt: '2026-10-29T03:00:00.000Z',
};
const VIDEO: Guide = {
  id: '6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1004',
  kind: 'VIDEO',
  title: 'Video cara submit Voice',
  videoUrl: 'https://youtu.be/abc123',
  size: null,
  updatedAt: '2026-10-31T03:00:00.000Z',
};

// Registered after mockWorkforceApi so it takes precedence for this path.
async function mockGuides(page: Page, items: Guide[]) {
  await page.route('**/api/v1/guides', (route) => route.fulfill({ json: { items } }));
}

test.describe('Panduan', () => {
  test('a member opens Panduan from the Home hero and gets the PDF link', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, [SUBMIT]);
    await page.goto('/');
    await page.getByRole('button', { name: 'Buka panduan' }).click();
    await expect(page).toHaveURL(/\/panduan$/);
    await expect(page.getByRole('heading', { name: 'Panduan', level: 1 })).toBeVisible();
    const link = page.getByRole('link', { name: /Panduan Submit Voice/ });
    await expect(link).toHaveAttribute('href', `/api/v1/guides/${SUBMIT.id}/file`);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toContainText('245 KB');
  });

  test('groups documents and videos, each in admin order', async ({ page }) => {
    await mockWorkforceApi(page, {
      session: memberSession({ capabilities: ['MEMBER', 'SECTION_HEAD'] }),
    });
    await mockGuides(page, [SUBMIT, VIDEO, RESPONDER]);
    await page.goto('/panduan');
    const documents = page.getByRole('group', { name: 'Dokumen' }).getByRole('link');
    await expect(documents).toHaveCount(2);
    await expect(documents.nth(0)).toContainText('Panduan Submit Voice');
    await expect(documents.nth(1)).toContainText('Panduan Responder');
    const video = page.getByRole('group', { name: 'Video' }).getByRole('link');
    await expect(video).toHaveCount(1);
    await expect(video).toContainText('Video · YouTube');
    await expect(video).toHaveAttribute('href', VIDEO.videoUrl!);
    await expect(video).toHaveAttribute('target', '_blank');
  });

  test('hides the Video group when there are only documents', async ({ page }) => {
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, [SUBMIT]);
    await page.goto('/panduan');
    await expect(page.getByRole('heading', { name: 'Dokumen' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Video' })).toHaveCount(0);
  });

  test('shows an empty state before the admin uploads anything', async ({ page }) => {
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, []);
    await page.goto('/panduan');
    await expect(page.getByRole('heading', { name: 'Belum ada panduan' })).toBeVisible();
  });

  test('Pengaturan and the desktop sidebar lead to Panduan', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, [SUBMIT]);
    await page.goto('/account');
    await page.getByRole('button', { name: /Panduan penggunaan CARE/ }).click();
    await expect(page).toHaveURL(/\/panduan$/);
    await page.goto('/');
    await page.getByRole('navigation').getByRole('button', { name: 'Panduan' }).click();
    await expect(page).toHaveURL(/\/panduan$/);
  });
});
