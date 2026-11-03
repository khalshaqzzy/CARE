import { describe, expect, it } from 'vitest';
import { fileNameFrom, pageAt, ZOOM_STEPS, zoomStep } from './guide-viewer-utils';

describe('zoomStep', () => {
  it('moves one step and stops at either end', () => {
    expect(zoomStep(1, 1)).toBe(1.25);
    expect(zoomStep(1, -1)).toBe(0.75);
    expect(zoomStep(ZOOM_STEPS[0], -1)).toBe(ZOOM_STEPS[0]);
    expect(zoomStep(ZOOM_STEPS.at(-1)!, 1)).toBe(ZOOM_STEPS.at(-1));
  });
});

describe('pageAt', () => {
  const bounds = [
    { top: 0, bottom: 100 },
    { top: 112, bottom: 212 },
    { top: 224, bottom: 324 },
  ];
  it('finds the page under the reading line', () => {
    expect(pageAt(bounds, 50)).toBe(1);
    expect(pageAt(bounds, 100)).toBe(2);
    expect(pageAt(bounds, 150)).toBe(2);
    expect(pageAt(bounds, 300)).toBe(3);
  });
  it('stays on the last page past the end and copes with no pages', () => {
    expect(pageAt(bounds, 900)).toBe(3);
    expect(pageAt([], 10)).toBe(1);
  });
});

describe('fileNameFrom', () => {
  it('prefers the UTF-8 name, then the ASCII one, then the fallback', () => {
    expect(
      fileNameFrom(
        `attachment; filename="Panduan_v2.pdf"; filename*=UTF-8''Panduan%E2%80%94v2.pdf`,
        'x.pdf',
      ),
    ).toBe('Panduan—v2.pdf');
    expect(fileNameFrom('attachment; filename="FAQ.pdf"', 'x.pdf')).toBe('FAQ.pdf');
    expect(fileNameFrom(`attachment; filename*=UTF-8''%E0%A4%A`, 'x.pdf')).toBe('x.pdf');
    expect(fileNameFrom(null, 'x.pdf')).toBe('x.pdf');
  });
});
