// Phone photos are 3–5 MB at 4000 px; the API stores them at 1920 px anyway,
// so shrinking before upload saves the member's data and upload time.
export const MAX_UPLOAD_EDGE = 1920;
const SKIP_BELOW_BYTES = 500_000;
const JPEG_QUALITY = 0.82;

export function fitWithin(width: number, height: number, maxEdge = MAX_UPLOAD_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

// Same File in, same bytes out: a retried send keeps its idempotency fingerprint.
const prepared = new WeakMap<File, Promise<File>>();

export function compressPhoto(file: File): Promise<File> {
  let pending = prepared.get(file);
  if (!pending) {
    pending = shrink(file).catch(() => file);
    prepared.set(file, pending);
  }
  return pending;
}

async function shrink(file: File): Promise<File> {
  if (
    file.size <= SKIP_BELOW_BYTES ||
    !file.type.startsWith('image/') ||
    typeof createImageBitmap !== 'function'
  )
    return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    // JPEG has no alpha; keep transparent screenshots readable.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.type !== 'image/jpeg' || blob.size >= file.size) return file;
    const name = `${file.name.replace(/\.[^.]*$/, '') || 'foto'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}
