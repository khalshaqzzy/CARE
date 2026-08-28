import '@testing-library/jest-dom/vitest';
import { toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

expect.extend(toHaveNoViolations);

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: ResizeObserverMock,
  configurable: true,
});
Object.defineProperty(globalThis.HTMLElement.prototype, 'hasPointerCapture', {
  value: () => false,
  configurable: true,
});
Object.defineProperty(globalThis.HTMLElement.prototype, 'setPointerCapture', {
  value: () => undefined,
  configurable: true,
});
Object.defineProperty(globalThis.HTMLElement.prototype, 'releasePointerCapture', {
  value: () => undefined,
  configurable: true,
});
