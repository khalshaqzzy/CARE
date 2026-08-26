import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));

describe('workforce foundation boundaries', () => {
  it('keeps /design lazy, public, mock-only, and outside auth bootstrap', () => {
    const main = readFileSync(join(sourceDir, 'main.tsx'), 'utf8');
    const design = readFileSync(join(sourceDir, 'design/DesignPage.tsx'), 'utf8');
    expect(main).toContain("lazy(() => import('./design/DesignPage.js'))");
    expect(main.indexOf('isDesignRoute ?')).toBeLessThan(main.indexOf('<QueryClientProvider'));
    expect(design).toContain("meta.content = 'noindex, nofollow'");
    expect(design).not.toMatch(/fetch\s*\(|@care\/frontend-core|\/api\/v1/);
  });

  it('uses injectManifest and keeps private/network routes network-only', () => {
    const serviceWorker = readFileSync(join(sourceDir, 'sw.ts'), 'utf8');
    const vite = readFileSync(join(sourceDir, '../vite.config.ts'), 'utf8');
    expect(vite).toContain("strategies: 'injectManifest'");
    expect(vite).toContain("'**/design-system-*.js'");
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain('new NetworkOnly()');
    expect(serviceWorker).not.toMatch(/BackgroundSync|background-sync|Queue\(/);
  });
});
