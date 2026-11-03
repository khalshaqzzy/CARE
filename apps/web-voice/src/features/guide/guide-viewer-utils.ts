/** Helpers for the Panduan PDF reader (ADR-0075) that do not need pdf.js. */

export const guideFileUrl = (id: string) => `/api/v1/guides/${id}/file`;

/** Zoom is relative to "fit width" (1 = the page fills the reading column). */
export const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
export const ZOOM_DEFAULT = 1;

/** The next zoom step in a direction, or the same value at either end. */
export function zoomStep(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + 0.001) ?? current;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 0.001) ?? current;
}

/**
 * The page under a horizontal line (the bottom of the sticky bars), from the
 * pages' vertical bounds in document order. Binary search keeps scrolling cheap
 * for long guides.
 */
export function pageAt(bounds: readonly { top: number; bottom: number }[], line: number): number {
  if (!bounds.length) return 1;
  let low = 0;
  let high = bounds.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (bounds[middle]!.bottom <= line) low = middle + 1;
    else high = middle;
  }
  return low + 1;
}

/** The element that scrolls `element` vertically: the app shell or the page. */
export function scrollParent(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if (/(auto|scroll)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** The uploaded file name from `Content-Disposition`, preferring the UTF-8 form. */
export function fileNameFrom(header: string | null, fallback: string): string {
  const encoded = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Fall through to the ASCII name.
    }
  }
  return header?.match(/filename="([^"]+)"/i)?.[1] ?? fallback;
}

/**
 * Saves the original PDF. The request is same-origin with the session cookie,
 * so it works inside an installed PWA (a new tab on iOS would not carry the
 * cookie), and a failure stays in CARE instead of navigating to an error.
 */
export async function downloadGuide(id: string, title: string): Promise<void> {
  const response = await fetch(`${guideFileUrl(id)}?download=1`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const name = fileNameFrom(
    response.headers.get('Content-Disposition'),
    `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'panduan'}.pdf`,
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  if (!('download' in link)) {
    // Very old browsers without the download attribute show the PDF instead.
    window.location.assign(url);
    return;
  }
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Let the browser start reading the blob before it is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
