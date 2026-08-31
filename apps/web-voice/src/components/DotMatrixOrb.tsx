import { useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { computeOrbOpacity, isWithinCircularMask, ORB_CYCLE_MS, ORB_SIZE } from '../lib/orb-math';

type DotMatrixOrbProps = {
  /** Completed analysis stages, 0..1. */
  progress: number;
  /** Drives the bloom loop; false freezes the current frame in place. */
  animating: boolean;
  size?: number;
};

export function DotMatrixOrb({ progress, animating, size = ORB_SIZE }: DotMatrixOrbProps) {
  const reducedMotion = useReducedMotion();
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const phaseRef = useRef(0);

  useEffect(() => {
    const paint = (phase: number) => {
      for (let row = 0; row < size; row += 1) {
        for (let col = 0; col < size; col += 1) {
          const el = dotRefs.current[row * size + col];
          if (!el || !isWithinCircularMask(row, col, size)) continue;
          el.style.opacity = String(
            computeOrbOpacity({
              row,
              col,
              size,
              phase,
              progress: progressRef.current,
            }),
          );
        }
      }
    };

    // Reduced motion (and frozen states) render a single deterministic frame;
    // a rAF loop is not covered by Playwright's `animations: 'disabled'`.
    if (reducedMotion || !animating) {
      paint(phaseRef.current);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      const phase = ((now - start) % ORB_CYCLE_MS) / ORB_CYCLE_MS;
      phaseRef.current = phase;
      paint(phase);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [animating, reducedMotion, size]);

  const dots = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col;
      dots.push(
        <span
          key={index}
          ref={(el) => {
            dotRefs.current[index] = el;
          }}
          className="processing-card__orb-dot"
          style={isWithinCircularMask(row, col, size) ? undefined : { visibility: 'hidden' }}
        />,
      );
    }
  }

  return (
    <div
      className="processing-card__orb"
      aria-hidden="true"
      style={{ '--orb-cols': size } as React.CSSProperties}
    >
      {dots}
    </div>
  );
}
