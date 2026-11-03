import { chromium, expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
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

/** A three-page PDF printed by Chromium, so the viewer renders real pages. */
let samplePdf: Buffer;
test.beforeAll(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(
    ['Masuk ke CARE', 'Isi Voice dan lampirkan foto', 'Kirim dan pantau']
      .map((text) => `<section style="page-break-after:always"><h1>${text}</h1></section>`)
      .join(''),
  );
  samplePdf = await page.pdf({ format: 'A4' });
  await browser.close();
});

async function mockGuideFile(page: Page) {
  // Matches the reader (`/file`) and the download (`/file?download=1`).
  await page.route(new RegExp(`/api/v1/guides/${SUBMIT.id}/file(\\?.*)?$`), (route) =>
    route.fulfill({
      body: samplePdf,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': new URL(route.request().url()).searchParams.has('download')
          ? `attachment; filename="Panduan_Submit.pdf"; filename*=UTF-8''Panduan%20Submit%20Voice.pdf`
          : 'inline; filename="Panduan_Submit.pdf"',
      },
    }),
  );
}

async function openReader(page: Page, width = 360) {
  await page.setViewportSize({ width, height: 800 });
  await mockWorkforceApi(page, { session: memberSession() });
  await mockGuides(page, [SUBMIT]);
  await mockGuideFile(page);
  await page.goto(`/panduan/${SUBMIT.id}`);
  await expect(
    page.getByRole('group', { name: 'Halaman 1 dari 3' }).locator('canvas'),
  ).toBeVisible();
}

test.describe('Panduan', () => {
  test('a member opens Panduan from the Home hero and gets the in-app reader', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, [SUBMIT]);
    await page.goto('/');
    await page.getByRole('button', { name: 'Buka panduan' }).click();
    await expect(page).toHaveURL(/\/panduan$/);
    await expect(page.getByRole('heading', { name: 'Panduan', level: 1 })).toBeVisible();
    const link = page.getByRole('link', { name: /Panduan Submit Voice/ });
    await expect(link).toHaveAttribute('href', `/panduan/${SUBMIT.id}`);
    await expect(link).not.toHaveAttribute('target', '_blank');
    await expect(link).toContainText('245 KB');
  });

  test('reads a PDF inside CARE, finds a word and goes back', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, [SUBMIT]);
    await mockGuideFile(page);
    await page.goto('/panduan');
    await page.getByRole('link', { name: /Panduan Submit Voice/ }).click();
    await expect(page).toHaveURL(new RegExp(`/panduan/${SUBMIT.id}$`));
    await expect(
      page.getByRole('heading', { name: 'Panduan Submit Voice', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Halaman 1 dari 3' }).locator('canvas'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unduh PDF' })).toBeVisible();

    await page.getByRole('button', { name: 'Cari di panduan' }).click();
    await page.getByLabel('Cari kata di panduan').fill('foto');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Hal 2 · 1/1')).toBeVisible();
    await expect(page.locator('.guide-viewer__hit').first()).toBeInViewport();
    await page.getByLabel('Cari kata di panduan').fill('tidak ada kata ini');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Tidak ada')).toBeVisible();

    await page.getByRole('button', { name: 'Kembali ke Panduan' }).click();
    await expect(page).toHaveURL(/\/panduan$/);
  });

  test('moves between pages and zooms with sharp re-rendered pages', async ({ page }) => {
    await openReader(page);
    const pageInput = page.getByRole('textbox', { name: 'Halaman, 1 sampai 3' });
    await expect(pageInput).toHaveValue('1');
    await expect(page.getByText('/ 3', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Halaman sebelumnya' })).toBeDisabled();

    await page.getByRole('button', { name: 'Halaman berikutnya' }).click();
    await expect(pageInput).toHaveValue('2');
    await expect(page.getByRole('group', { name: 'Halaman 2 dari 3' })).toBeInViewport();

    await pageInput.fill('3');
    await pageInput.press('Enter');
    await expect(pageInput).toHaveValue('3');
    await expect(page.getByRole('button', { name: 'Halaman berikutnya' })).toBeDisabled();
    const third = page.getByRole('group', { name: 'Halaman 3 dari 3' });
    await expect(third.locator('canvas')).toBeVisible();

    // Scrolling back updates the page number.
    await page.getByRole('group', { name: 'Halaman 1 dari 3' }).scrollIntoViewIfNeeded();
    await expect(pageInput).toHaveValue('1');

    const canvasWidth = () =>
      page
        .getByRole('group', { name: 'Halaman 1 dari 3' })
        .locator('canvas')
        .evaluate((canvas: HTMLCanvasElement) => canvas.width);
    const fitWidth = await canvasWidth();
    await page.getByRole('button', { name: 'Perbesar' }).click();
    await page.getByRole('button', { name: 'Perbesar' }).click();
    await expect(page.getByRole('button', { name: /^Zoom 150%/ })).toBeVisible();
    // pdf.js re-renders at the new size instead of stretching the bitmap.
    await expect.poll(canvasWidth).toBeGreaterThan(fitWidth * 1.4);
    // Wider than the phone: the pages scroll sideways, the page itself does not.
    const strip = page.locator('.guide-viewer__pages');
    expect(
      await strip.evaluate((element) => element.scrollWidth > element.clientWidth),
    ).toBeTruthy();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBeTruthy();
    // The page being read stays in view.
    await expect(page.getByRole('group', { name: 'Halaman 1 dari 3' })).toBeInViewport();

    await page.getByRole('button', { name: /^Zoom 150%/ }).click();
    await expect(page.getByRole('button', { name: /^Zoom 100%/ })).toBeVisible();
    for (let i = 0; i < 2; i += 1) await page.getByRole('button', { name: 'Perkecil' }).click();
    await expect(page.getByRole('button', { name: /^Zoom 50%/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Perkecil' })).toBeDisabled();
  });

  test('downloads the original PDF with its uploaded name', async ({ page }) => {
    await openReader(page, 1440);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Unduh PDF' }).click(),
    ]);
    // The UTF-8 name wins over the ASCII fallback.
    expect(download.suggestedFilename()).toBe('Panduan Submit Voice.pdf');
    const saved = await readFile(await download.path());
    expect(saved.equals(samplePdf)).toBeTruthy();
  });

  test('says so when the download fails and stays in the reader', async ({ page }) => {
    await openReader(page);
    await page.route(/\/file\?download=1$/, (route) =>
      route.fulfill({ status: 401, json: { code: 'UNAUTHENTICATED' } }),
    );
    await page.getByRole('button', { name: 'Unduh PDF' }).click();
    await expect(page.getByText('PDF gagal diunduh')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/panduan/${SUBMIT.id}$`));
  });

  test('older browsers get a button that downloads the PDF instead', async ({ page }) => {
    await page.addInitScript(() => {
      // Pretend to be a browser pdf.js 4 cannot run on.
      delete (window as { structuredClone?: unknown }).structuredClone;
    });
    await mockWorkforceApi(page, { session: memberSession() });
    await mockGuides(page, [SUBMIT]);
    await page.goto(`/panduan/${SUBMIT.id}`);
    await expect(page.getByRole('button', { name: 'Unduh PDF' })).toHaveCount(2);
    await expect(page.getByText('Browser ini belum bisa menampilkan panduan')).toBeVisible();
    await expect(page.locator('.guide-viewer__page')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kembali ke Panduan' })).toBeVisible();
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
