import { useMemo, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { Lightbox } from '@care/ui';
import { mediaUrl } from '../lib/formatters';
import type { Attachment } from '../workforce-api';

/**
 * Authorized image attachments. `grid` keeps the classic thumbnail wall used
 * by chat and closure evidence; `row` renders the compact count + strip card
 * used for Voice attachments. Tapping a thumbnail opens the shared in-page
 * viewer; media never navigates to the raw API URL.
 */
export function MediaGallery({
  attachments,
  label = 'Lampiran',
  variant = 'grid',
}: {
  attachments: Attachment[];
  label?: string;
  variant?: 'grid' | 'row';
}) {
  const safe = useMemo(
    () => attachments.filter((a) => a.mimeType.startsWith('image/')),
    [attachments],
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (!safe.length) return null;
  const images = safe.map((attachment) => ({
    src: mediaUrl(attachment.id),
    alt: `Lampiran ${attachment.id.slice(0, 6)}`,
  }));
  const viewerOpen = viewerIndex !== null && viewerIndex < safe.length;
  const activeIndex = viewerOpen ? viewerIndex : 0;
  const viewer = (
    <Lightbox
      open={viewerOpen}
      onOpenChange={(open) => setViewerIndex(open ? activeIndex : null)}
      images={images}
      index={activeIndex}
      onIndexChange={setViewerIndex}
    />
  );

  if (variant === 'row') {
    return (
      <div className="media-row">
        <span className="media-row__count">
          <Paperclip size={16} aria-hidden="true" />
          {safe.length} lampiran
        </span>
        <div className="media-row__thumbs">
          {images.map((image, index) => (
            <button
              key={image.src}
              type="button"
              className="media-row__thumb"
              aria-label={`Lihat gambar ${index + 1} dari ${safe.length}`}
              onClick={() => setViewerIndex(index)}
            >
              <img src={image.src} alt={image.alt} loading="lazy" />
            </button>
          ))}
        </div>
        {viewer}
      </div>
    );
  }
  return (
    <div className="media-gallery">
      <span className="media-gallery__label">{label}</span>
      <div className="media-gallery__grid">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            className="media-gallery__thumb"
            aria-label={`Lihat gambar ${index + 1} dari ${safe.length}`}
            onClick={() => setViewerIndex(index)}
          >
            <img src={image.src} alt={image.alt} loading="lazy" />
          </button>
        ))}
      </div>
      {viewer}
    </div>
  );
}
