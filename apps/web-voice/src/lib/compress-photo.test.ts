import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_EDGE, compressPhoto, fitWithin } from './compress-photo';

const photo = (bytes: number, name = 'IMG_0001.HEIC.png', type = 'image/png') =>
  new File([new Uint8Array(bytes)], name, { type, lastModified: 1 });

function stubCanvas(outputBytes: number, outputType = 'image/jpeg') {
  const drawn: number[][] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      fillStyle: '',
      fillRect: () => undefined,
      drawImage: (_image: unknown, ...box: number[]) => drawn.push(box),
    }),
    toBlob: (done: (blob: Blob | null) => void) =>
      done(new Blob([new Uint8Array(outputBytes)], { type: outputType })),
  };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close: () => undefined })),
  );
  return { canvas, drawn };
}

afterEach(() => vi.unstubAllGlobals());

describe('fitWithin', () => {
  it('scales the longest edge down and keeps the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: MAX_UPLOAD_EDGE, height: 1440 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1440, height: MAX_UPLOAD_EDGE });
  });

  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('compressPhoto', () => {
  it('shrinks a large photo to a smaller JPEG', async () => {
    const { canvas, drawn } = stubCanvas(400_000);
    const result = await compressPhoto(photo(4_000_000));
    expect(result.type).toBe('image/jpeg');
    expect(result.name).toBe('IMG_0001.HEIC.jpg');
    expect(result.size).toBe(400_000);
    expect([canvas.width, canvas.height]).toEqual([MAX_UPLOAD_EDGE, 1440]);
    expect(drawn).toEqual([[0, 0, MAX_UPLOAD_EDGE, 1440]]);
  });

  it('returns the same result for the same file so retries match', async () => {
    stubCanvas(400_000);
    const file = photo(4_000_000);
    expect(await compressPhoto(file)).toBe(await compressPhoto(file));
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('leaves small files untouched', async () => {
    stubCanvas(100);
    const file = photo(200_000);
    expect(await compressPhoto(file)).toBe(file);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('keeps the original when the browser cannot encode JPEG or it is not smaller', async () => {
    stubCanvas(400_000, 'image/png');
    const unsupported = photo(4_000_000);
    expect(await compressPhoto(unsupported)).toBe(unsupported);
    stubCanvas(5_000_000);
    const larger = photo(4_000_000);
    expect(await compressPhoto(larger)).toBe(larger);
  });

  it('falls back to the original when decoding fails', async () => {
    stubCanvas(400_000);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('decode failed');
      }),
    );
    const file = photo(4_000_000);
    expect(await compressPhoto(file)).toBe(file);
  });
});
