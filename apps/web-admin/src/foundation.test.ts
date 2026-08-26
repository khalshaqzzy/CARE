import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourceDir = dirname(fileURLToPath(import.meta.url));

describe('Admin foundation boundaries', () => {
  it('mounts auth and protected providers only inside the desktop gate', () => {
    const main = readFileSync(join(sourceDir, 'main.tsx'), 'utf8');
    expect(main).toContain("matchMedia('(min-width: 1280px)')");
    expect(main).toMatch(/desktop\s*\?\s*\(\s*<QueryClientProvider/);
    expect(main).toContain(': null');
  });

  it('has no PWA plugin, manifest, or service worker source', () => {
    const vite = readFileSync(join(sourceDir, '../vite.config.ts'), 'utf8');
    expect(vite).not.toMatch(/VitePWA|manifest|serviceWorker/);
    expect(existsSync(join(sourceDir, 'sw.ts'))).toBe(false);
    expect(existsSync(join(sourceDir, '../public/manifest.webmanifest'))).toBe(false);
  });
});
