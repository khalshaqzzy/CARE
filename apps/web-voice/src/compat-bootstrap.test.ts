import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(rootDir, 'public/compat-bootstrap.js'), 'utf8');

function executeBootstrap() {
  let timer: (() => void) | undefined;
  const title = { textContent: '' };
  const message = { textContent: '' };
  const retry = { removeAttribute: vi.fn() };
  const root = {
    querySelector(selector: string) {
      if (selector.includes('title')) return title;
      if (selector.includes('message')) return message;
      return retry;
    },
    setAttribute: vi.fn(),
  };
  const windowObject: Record<string, unknown> = {
    setTimeout(callback: () => void) {
      timer = callback;
      return 1;
    },
    clearTimeout: vi.fn(),
  };
  windowObject.window = windowObject;
  const context = {
    window: windowObject,
    document: { getElementById: () => root },
    setTimeout: windowObject.setTimeout,
    Promise,
    Symbol,
    TypeError,
  };
  runInNewContext(
    `Object.fromEntries = undefined; String.prototype.replaceAll = undefined; Array.prototype.at = undefined; ${source}`,
    context,
  );
  return { context, windowObject, root, title, message, retry, fireTimer: () => timer?.() };
}

describe('legacy compatibility bootstrap', () => {
  it('stays ES5-compatible and avoids inline-eval helpers', () => {
    expect(source).not.toMatch(/\b(?:const|let|class)\b|=>|`|\?\.|\?\?/);
    expect(source).not.toContain('new Function');
    expect(source).not.toContain('eval(');
  });

  it('installs required runtime fallbacks before the app module', () => {
    const { context, windowObject } = executeBootstrap();
    expect(windowObject.globalThis).toBe(windowObject);
    expect(runInNewContext("Object.fromEntries([['a', 1]]).a", context)).toBe(1);
    expect(runInNewContext("'A_B'.replaceAll('_', '-');", context)).toBe('A-B');
    expect(runInNewContext('[1, 2, 3].at(-1)', context)).toBe(3);
    expect(typeof windowObject.queueMicrotask).toBe('function');
  });

  it('replaces the loading shell when boot times out', () => {
    const { fireTimer, root, title, message, retry } = executeBootstrap();
    fireTimer();
    expect(title.textContent).toBe('CARE gagal dimuat');
    expect(message.textContent).toContain('Periksa koneksi');
    expect(retry.removeAttribute).toHaveBeenCalledWith('hidden');
    expect(root.setAttribute).toHaveBeenCalledWith('data-care-boot-state', 'failed');
  });

  it('marks the root mounted and cancels the failure timeout', () => {
    const { windowObject, root } = executeBootstrap();
    (windowObject.__CARE_BOOT__ as { markMounted: () => void }).markMounted();
    expect(windowObject.clearTimeout).toHaveBeenCalled();
    expect(root.setAttribute).toHaveBeenCalledWith('data-care-boot-state', 'mounted');
  });
});
