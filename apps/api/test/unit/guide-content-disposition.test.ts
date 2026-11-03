import { describe, expect, it } from 'vitest';
import { contentDisposition } from '../../src/guides/guides.controller';

describe('guide Content-Disposition', () => {
  it('keeps a plain name as is', () => {
    expect(contentDisposition('attachment', 'Panduan Member.pdf')).toBe(
      `attachment; filename="Panduan Member.pdf"; filename*=UTF-8''Panduan%20Member.pdf`,
    );
  });

  it('keeps non-ASCII names in filename* and makes an ASCII fallback', () => {
    expect(contentDisposition('inline', 'Panduan—Responder (v2).pdf')).toBe(
      `inline; filename="Panduan_Responder _v2_.pdf"; filename*=UTF-8''Panduan%E2%80%94Responder%20%28v2%29.pdf`,
    );
  });

  it('cannot break out of the header or name a path', () => {
    const header = contentDisposition('attachment', '..\\a/"b"\r\nSet-Cookie: x');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toMatch(/^attachment; filename="\.\.a_b_Set-Cookie_ x\.pdf"; /);
  });

  it('falls back to panduan.pdf', () => {
    expect(contentDisposition('inline', null)).toMatch(/^inline; filename="panduan\.pdf"/);
    expect(contentDisposition('inline', '  ')).toMatch(/^inline; filename="panduan\.pdf"/);
  });
});
