import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi } from './helpers/mock-api';

const ADMIN = 'http://127.0.0.1:4174';

type Guide = {
  id: string;
  kind: 'PDF' | 'VIDEO';
  title: string;
  forMember: boolean;
  forResponder: boolean;
  sortOrder: number;
  videoUrl: string | null;
  fileName: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
  uploadedBy: { displayName: string };
};

function guide(id: string, title: string, audience: Partial<Guide> = {}): Guide {
  return {
    id,
    kind: 'PDF',
    title,
    forMember: true,
    forResponder: false,
    sortOrder: 0,
    videoUrl: null,
    fileName: `${title}.pdf`,
    size: 245_000,
    createdAt: '2026-10-29T03:00:00.000Z',
    updatedAt: '2026-10-29T03:00:00.000Z',
    uploadedBy: { displayName: 'CARE Admin' },
    ...audience,
  };
}

/** A small in-memory guide store behind the admin endpoints. */
async function mockGuides(page: Page, initial: Guide[]) {
  let items = [...initial];
  const requests: { method: string; path: string; body: string }[] = [];
  await page.route('**/api/v1/admin/guides**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    requests.push({ method, path, body: request.postData() ?? '' });
    if (method === 'GET') return route.fulfill({ json: { items } });
    if (method === 'POST' && path.endsWith('/videos')) {
      const body = request.postDataJSON() as Pick<Guide, 'title' | 'videoUrl'>;
      const created = guide('6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1004', body.title, {
        kind: 'VIDEO',
        videoUrl: body.videoUrl,
        fileName: null,
        size: null,
        sortOrder: items.length,
      });
      items = [...items, created];
      return route.fulfill({ status: 201, json: created });
    }
    if (method === 'POST') {
      const created = guide('6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1003', 'Panduan Private Voice', {
        forMember: true,
        forResponder: true,
        sortOrder: items.length,
      });
      items = [...items, created];
      return route.fulfill({ status: 201, json: created });
    }
    if (method === 'PUT' && path.endsWith('/order')) {
      const { ids } = request.postDataJSON() as { ids: string[] };
      items = ids.map((id, index) => ({
        ...items.find((item) => item.id === id)!,
        sortOrder: index,
      }));
      return route.fulfill({ json: { items } });
    }
    if (method === 'DELETE') {
      const id = path.split('/').pop()!;
      items = items.filter((item) => item.id !== id);
      return route.fulfill({ json: { id } });
    }
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND', message: 'mock', errors: [] } });
  });
  return requests;
}

const SUBMIT = guide('6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1001', 'Panduan Submit Voice');
const RESPONDER = guide('6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1002', 'Panduan Responder', {
  forMember: false,
  forResponder: true,
  sortOrder: 1,
});

test.describe('Admin Panduan', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockAdminApi(page);
  });

  test('uploads a PDF for members and responders', async ({ page }) => {
    const requests = await mockGuides(page, [SUBMIT, RESPONDER]);
    await page.goto(`${ADMIN}/`);
    await page.getByRole('navigation').getByRole('button', { name: 'Panduan' }).click();
    await expect(page).toHaveURL(/\/guides$/);
    await expect(page.getByText('Panduan Submit Voice', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Upload PDF' }).click();
    const dialog = page.getByRole('dialog', { name: 'Upload PDF' });
    const save = dialog.getByRole('button', { name: 'Simpan' });
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Judul').fill('Panduan Private Voice');
    await dialog.getByRole('checkbox', { name: /Responder/ }).click();
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'private.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\n%%EOF\n'),
    });
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Panduan Private Voice', { exact: true })).toBeVisible();
    const upload = requests.find((request) => request.method === 'POST')!;
    expect(upload.body).toContain('name="forMember"\r\n\r\ntrue');
    expect(upload.body).toContain('name="forResponder"\r\n\r\ntrue');
    expect(upload.body).toContain('filename="private.pdf"');
  });

  test('moves a guide up and deletes one', async ({ page }) => {
    const requests = await mockGuides(page, [SUBMIT, RESPONDER]);
    await page.goto(`${ADMIN}/guides`);
    await page.getByRole('button', { name: 'Naikkan Panduan Responder' }).click();
    await expect
      .poll(() => requests.find((request) => request.path.endsWith('/order'))?.body)
      .toBe(JSON.stringify({ ids: [RESPONDER.id, SUBMIT.id] }));

    await page
      .getByRole('row', { name: /Panduan Submit Voice/ })
      .getByRole('button', { name: 'Hapus' })
      .click();
    await page
      .getByRole('dialog', { name: /Hapus/ })
      .getByRole('button', { name: 'Hapus' })
      .click();
    await expect(page.getByText('Panduan Submit Voice', { exact: true })).toHaveCount(0);
  });

  test('adds a video link for members', async ({ page }) => {
    const requests = await mockGuides(page, [SUBMIT]);
    await page.goto(`${ADMIN}/guides`);
    await page.getByRole('button', { name: 'Tambah video' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tambah video' });
    const save = dialog.getByRole('button', { name: 'Simpan' });
    await dialog.getByLabel('Judul').fill('Video cara submit Voice');
    await dialog.getByLabel('Link video').fill('http://youtu.be/abc');
    await expect(dialog.getByText('Link harus diawali https://')).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.getByLabel('Link video').fill('https://youtu.be/abc');
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Video · https://youtu.be/abc')).toBeVisible();
    const sent = requests.find((request) => request.path.endsWith('/videos'))!;
    expect(JSON.parse(sent.body)).toEqual({
      title: 'Video cara submit Voice',
      videoUrl: 'https://youtu.be/abc',
      forMember: true,
      forResponder: false,
    });
  });
});
