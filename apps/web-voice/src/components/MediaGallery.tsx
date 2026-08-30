import { useMemo } from 'react';
import { Paperclip } from 'lucide-react';
import { mediaUrl } from '../lib/formatters';
import type { Attachment } from '../workforce-api';

/**
 * Authorized image attachments. `grid` keeps the classic thumbnail wall used
 * by chat and closure evidence; `row` renders the compact count + strip card
 * used for Voice attachments.
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
  if (!safe.length) return null;
  if (variant === 'row') {
    return (
      <div className="media-row">
        <span className="media-row__count">
          <Paperclip size={16} aria-hidden="true" />
          {safe.length} lampiran
        </span>
        <div className="media-row__thumbs">
          {safe.map((attachment) => (
            <a
              key={attachment.id}
              className="media-row__thumb"
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
