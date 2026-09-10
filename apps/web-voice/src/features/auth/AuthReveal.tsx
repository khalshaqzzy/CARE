import { useEffect, useRef, type ReactNode } from 'react';

/** Mount only visible controls; animate measured content, then allow natural error wrapping. */
export function AuthReveal({ open, children }: { open: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let timer: number | undefined;
    const frame = requestAnimationFrame(() => {
      element.style.height = `${element.scrollHeight}px`;
      element.style.opacity = '1';
      timer = window.setTimeout(
        () => {
          element.style.height = 'auto';
          element
            .querySelector<HTMLInputElement | HTMLSelectElement>('input, select')
            ?.focus({ preventScroll: true });
        },
        reduced ? 0 : 520,
      );
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open]);
  if (!open) return null;
  return (
    <div ref={ref} className="auth-reveal">
      <div className="auth-reveal__content">{children}</div>
    </div>
  );
}
