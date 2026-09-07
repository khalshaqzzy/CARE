import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, ChevronLeft, ChevronRight, RotateCw } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { Loader } from './feedback.js';

export interface LightboxImage {
  src: string;
  alt: string;
}

export interface LightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: LightboxImage[];
  index: number;
  onIndexChange: (index: number) => void;
}

const SWIPE_THRESHOLD_PX = 48;

/**
 * Full-screen image viewer for authorized media. The host owns the open/index
 * state, so clicks, keyboard, swipe, and thumbnail jumps all funnel through
 * one controlled component. Focus trap, Escape, scroll lock, and focus return
 * come from the same dialog primitives the regular Dialog uses.
 */
export function Lightbox({ open, onOpenChange, images, index, onIndexChange }: LightboxProps) {
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; axis: 'x' | 'y' | null } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  const total = images.length;
  const bounded = Math.min(Math.max(index, 0), Math.max(total - 1, 0));
  const current = images[bounded] as LightboxImage | undefined;

  // Reset the transient load state when the viewer opens, moves to another
  // image, or a retry changes the effective URL.
  const [rendered, setRendered] = useState<{ open: boolean; src: string; attempt: number } | null>(
    null,
  );
  if (open && current && !isSameLoad(rendered, open, current.src, attempt)) {
    setRendered({ open, src: current.src, attempt });
    setStatus('loading');
  }

  // WebKit can complete an image that is already in its memory cache without
  // ever dispatching load/error (React sets src before the element is
  // inserted), which would leave the stage on "loading" forever. The ref runs
  // right after insertion, so a synchronously complete image is settled here.
  const settleIfComplete = (element: HTMLImageElement | null) => {
    if (!element || !element.complete) return;
    setStatus((state) =>
      state === 'loading' ? (element.naturalWidth > 0 ? 'ready' : 'error') : state,
    );
  };

  // Gate the reveal on decode(): WebKit fires load before a large photo has
  // been decoded, and revealing the stage then can composite as blank on iOS.
  const markReady = (element: HTMLImageElement) => {
    void element
      .decode()
      .then(() => setStatus('ready'))
      .catch(() => setStatus('ready'));
  };

  if (!current) return null;

  const src = attempt > 0 ? `${current.src}?retry=${attempt}` : current.src;

  const step = (delta: number) => {
    const next = bounded + delta;
    if (next >= 0 && next < total) onIndexChange(next);
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    dragRef.current = { startX: touch.clientX, startY: touch.clientY, axis: null };
  };
  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame || total <= 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - drag.startX;
    const dy = touch.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      drag.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    if (drag.axis !== 'x') return;
    const atEdge = (bounded === 0 && dx > 0) || (bounded === total - 1 && dx < 0);
    frame.style.transform = `translateX(${atEdge ? dx * 0.35 : dx}px)`;
  };
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    const frame = frameRef.current;
    if (!drag) return;
    if (frame) {
      frame.classList.add('care-lightbox__frame--snap');
      frame.style.transform = 'translateX(0)';
      window.setTimeout(() => frame.classList.remove('care-lightbox__frame--snap'), 300);
    }
    if (drag.axis !== 'x' || total <= 1) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - drag.startX;
    if (dx < -SWIPE_THRESHOLD_PX) step(1);
    if (dx > SWIPE_THRESHOLD_PX) step(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="care-lightbox__overlay" />
        <DialogPrimitive.Content
          className="care-lightbox"
          onOpenAutoFocus={() => {
            lastFocusedRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            const last = lastFocusedRef.current;
            if (last && last.isConnected) {
              event.preventDefault();
              last.focus();
            }
          }}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="care-sr-only">
            {`Gambar ${bounded + 1} dari ${total}`}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="care-sr-only">
            Gunakan tombol panah untuk berpindah gambar dan tombol kembali untuk menutup.
          </DialogPrimitive.Description>

          <div className="care-lightbox__top">
            <DialogPrimitive.Close className="care-lightbox__glass" aria-label="Kembali">
              <ArrowLeft size={18} aria-hidden="true" />
              <span>Kembali</span>
            </DialogPrimitive.Close>
            <span className="care-lightbox__counter" aria-live="polite">
              {bounded + 1} / {total}
            </span>
          </div>

          <div
            className="care-lightbox__stage"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <div className="care-lightbox__frame" ref={frameRef}>
              <img
                key={src}
                ref={settleIfComplete}
                src={src}
                alt={current.alt}
                className="care-lightbox__img"
                data-state={status}
                decoding="async"
                draggable={false}
                onLoad={(event) => markReady(event.currentTarget)}
                onError={() => setStatus('error')}
              />
            </div>
            {status === 'loading' ? (
              <div className="care-lightbox__loading">
                <Loader label="Memuat gambar" size="lg" />
              </div>
            ) : null}
            {status === 'error' ? (
              <div className="care-lightbox__error" role="alert">
                <p>Gambar tidak dapat dimuat.</p>
                <button
                  type="button"
                  className="care-lightbox__glass"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  <RotateCw size={16} aria-hidden="true" />
                  <span>Coba lagi</span>
                </button>
              </div>
            ) : null}
            {total > 1 ? (
              <>
                <button
                  type="button"
                  className="care-lightbox__nav care-lightbox__nav--prev"
                  aria-label="Gambar sebelumnya"
                  disabled={bounded === 0}
                  onClick={() => step(-1)}
                >
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="care-lightbox__nav care-lightbox__nav--next"
                  aria-label="Gambar berikutnya"
                  disabled={bounded === total - 1}
                  onClick={() => step(1)}
                >
                  <ChevronRight size={22} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>

          {total > 1 ? (
            <div className="care-lightbox__thumbs" role="group" aria-label="Pilih gambar">
              {images.map((image, i) => (
                <button
                  key={`${image.src}-${i}`}
                  type="button"
                  className="care-lightbox__thumb"
                  aria-label={`Gambar ${i + 1}`}
                  aria-current={i === bounded ? 'true' : undefined}
                  onClick={() => onIndexChange(i)}
                >
                  <img src={image.src} alt="" loading="lazy" decoding="async" draggable={false} />
                </button>
              ))}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function isSameLoad(
  rendered: { open: boolean; src: string; attempt: number } | null,
  open: boolean,
  src: string,
  attempt: number,
) {
  return (
    rendered !== null &&
    rendered.open === open &&
    rendered.src === src &&
    rendered.attempt === attempt
  );
}
