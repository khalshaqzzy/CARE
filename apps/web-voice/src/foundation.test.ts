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

  it('caches only a stripped, non-sensitive dashboard summary and never Private/chat media', () => {
    const serviceWorker = readFileSync(join(sourceDir, 'sw.ts'), 'utf8');
    // The summary cache is registered before the generic /api/ NetworkOnly catch-all.
    const apiRoute = serviceWorker.indexOf("url.pathname.startsWith('/api/')");
    const dashboardRoute = serviceWorker.indexOf('/api/v1/dashboard/member');
    expect(dashboardRoute).toBeGreaterThan(-1);
    expect(dashboardRoute).toBeLessThan(apiRoute);
    // recent + draft are stripped before cache write so Private titles never land offline.
    expect(serviceWorker).toContain('recent: [],');
    expect(serviceWorker).toContain('draft: null');
    // All authenticated/message/media routes stay strictly network-only.
    expect(serviceWorker).toContain('new NetworkOnly()');
  });

  it('keeps the mobile dock navigable through BottomNav onNavigate', () => {
    const app = readFileSync(join(sourceDir, 'App.tsx'), 'utf8');
    // BottomNav only invokes onNavigate(id); per-item onClick props are ignored.
    expect(app).toContain('onNavigate={');
    // Every dock destination must resolve to a route in the shared map.
    expect(app).toContain("home: '/'");
    expect(app).toContain("create: '/voices/new'");
    expect(app).toContain("history: '/history'");
    expect(app).toContain("'work-items': '/work-items'");
    expect(app).toContain("general: '/general'");
    expect(app).toContain("notifications: '/notifications'");
    expect(app).toContain("account: '/account'");
  });

  it('keeps the push handler generic and free of Private identity fields', () => {
    const serviceWorker = readFileSync(join(sourceDir, 'sw.ts'), 'utf8');
    const pushHandler = serviceWorker.slice(
      serviceWorker.indexOf("addEventListener('push'"),
      serviceWorker.indexOf("addEventListener('notificationclick'"),
    );
    expect(pushHandler).toContain("'Pembaruan CARE'");
    // Never derive a push payload locally from a Private reporter identity.
    expect(pushHandler).not.toMatch(/\breporter|noReg|no_reg|displayName|division|department\b/);
  });
});
