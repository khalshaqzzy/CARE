import { useMemo } from 'react';
import { mediaUrl } from '../lib/formatters';
import type { Attachment } from '../workforce-api';

export function MediaGallery({
  attachments,
  label = 'Lampiran',
}: {
  attachments: Attachment[];
  label?: string;
}) {
  const safe = useMemo(
    () => attachments.filter((a) => a.mimeType.startsWith('image/')),
    [attachments],
  );
  if (!safe.length) return null;
  return (
    <div className="media-gallery">
      <span className="media-gallery__label">{label}</span>
      <div className="media-gallery__grid">
        {safe.map((attachment) => (
          <a
            key={attachment.id}
            className="media-gallery__thumb"
            href={mediaUrl(attachment.id)}
            target="_blank"
            rel="noreferrer"
            aria-label={`Buka lampiran ${attachment.id.slice(0, 6)}`}
          >
            <img
              src={mediaUrl(attachment.id)}
              alt={`Lampiran ${attachment.id.slice(0, 6)}`}
              loading="lazy"
            />
          </a>
        ))}
      </div>
    </div>
  );
}
