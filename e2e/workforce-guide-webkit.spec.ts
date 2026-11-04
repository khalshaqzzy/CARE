import { expect, test, type Page } from '@playwright/test';
import { memberSession, mockWorkforceApi } from './helpers/mock-api';

const GUIDE = {
  id: '6a0f3f7e-2d1c-4c55-9a51-0c6b8f6a1101',
  kind: 'PDF' as const,
  title: 'Panduan Member',
  videoUrl: null,
  size: 1_000,
  updatedAt: '2026-11-03T03:00:00.000Z',
};

/** A one-page 200 × 200 pt PDF; `objects` start at 4 (catalog, pages and page are fixed). */
function onePagePdf(resources: string, content: string, objects: string[] = []) {
  const all = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources ${resources} /Contents ${objects.length + 4} 0 R >>`,
    ...objects,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  all.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

/**
 * A blue page with a pink layer shown only through a luminosity soft mask that
 * is black (hidden) outside a white centre square — how design tools export a
 * soft glow. pdf.js 4 applied luminosity masks with `ctx.filter`, which WebKit
 * lacks, so Safari showed the whole page pink.
 */
function maskedGlowPdf() {
  const mask = '0 g 0 0 200 200 re f 1 g 50 50 100 100 re f';
  return onePagePdf(
    '<< /ExtGState << /Glow 4 0 R >> >>',
    '0.04 0.25 0.82 rg 0 0 200 200 re f /Glow gs 1 0.41 0.71 rg 0 0 200 200 re f',
    [
      '<< /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G 5 0 R >> >>',
      `<< /Type /XObject /Subtype /Form /BBox [0 0 200 200] /Group << /S /Transparency /CS /DeviceRGB >> /Length ${mask.length} >>\nstream\n${mask}\nendstream`,
    ],
  );
}

/** A page filled by a 16 × 16 green JPEG 2000 image (decoded by pdf.js, not the browser). */
function jpeg2000Pdf() {
  const jpx = Buffer.from(
    'AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAEAAAABAAAwcHAAAAAAAPY29scgEAAAAAABAAAACqanAyY/9P/1EALwAAAAAAEAAAABAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAQEBAAB/1wAEEBASEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS4z/5AACgAAAAAAJgAB/5PfgAgHx9QCBMfUAgiAgICAgICAgICAgID/2Q==',
    'base64',
  ).toString('latin1');
  return onePagePdf('<< /XObject << /Img 4 0 R >> >>', 'q 200 0 0 200 0 0 cm /Img Do Q', [
    `<< /Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /JPXDecode /Length ${jpx.length} >>\nstream\n${jpx}\nendstream`,
  ]);
}

async function openGuide(page: Page, pdf: Buffer) {
  await mockWorkforceApi(page, { session: memberSession() });
  await page.route('**/api/v1/guides', (route) => route.fulfill({ json: { items: [GUIDE] } }));
  await page.route(new RegExp(`/api/v1/guides/${GUIDE.id}/file(\\?.*)?$`), (route) =>
    route.fulfill({ body: pdf, headers: { 'content-type': 'application/pdf' } }),
  );
  await page.goto(`/panduan/${GUIDE.id}`);
  const canvas = page.getByRole('group', { name: 'Halaman 1 dari 1' }).locator('canvas');
  // The first open loads and compiles the pdf.js worker, which takes longer in WebKit.
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  return (x: number, y: number) =>
    canvas.evaluate(
      (element, [fx, fy]) => {
        const target = element as HTMLCanvasElement;
        const data = target
          .getContext('2d')!
          .getImageData(Math.floor(target.width * fx), Math.floor(target.height * fy), 1, 1).data;
        return [data[0], data[1], data[2]];
      },
      [x, y],
    );
}

// A current iPhone, so the app runs as on a supported iOS rather than iOS 11.3.
test.use({
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
});

test.describe('Panduan on Safari', () => {
  test('shows PDF colours as uploaded, including soft-masked glows', async ({ page }) => {
    const pixel = await openGuide(page, maskedGlowPdf());
    // The glow shows in the centre once the page has rendered ...
    await expect
      .poll(async () => {
        const [red, green, blue] = await pixel(0.5, 0.5);
        return red > 240 && green > 90 && green < 120 && blue > 165 && blue < 195;
      })
      .toBe(true);
    // ... and stays hidden by the mask elsewhere, so the page is blue, not pink.
    const [red, , blue] = await pixel(0.05, 0.05);
    expect(blue).toBeGreaterThan(200);
    expect(red).toBeLessThan(40);
  });

  test('renders JPEG 2000 images in a guide', async ({ page }) => {
    const pixel = await openGuide(page, jpeg2000Pdf());
    await expect
      .poll(async () => {
        const [red, green, blue] = await pixel(0.5, 0.5);
        return red < 20 && green > 140 && green < 180 && blue > 60 && blue < 100;
      })
      .toBe(true);
  });
});
