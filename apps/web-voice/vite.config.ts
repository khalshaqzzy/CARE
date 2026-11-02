import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjsVersion = (
  JSON.parse(readFileSync(join(pdfjsRoot, 'package.json'), 'utf8')) as {
    version: string;
  }
).version;

/**
 * Serves the pdf.js legacy build at /pdfjs/<version>/ for the Panduan viewer
 * (ADR-0075). It stays outside assets/, so it is neither part of the legacy
 * bootstrap bundle nor precached, and the viewer loads it only on browsers
 * that can run it.
 */
function pdfjsVendor(): Plugin {
  const files: Record<string, string> = {
    'pdf.min.js': join(pdfjsRoot, 'legacy/build/pdf.min.mjs'),
    'pdf.worker.min.js': join(pdfjsRoot, 'legacy/build/pdf.worker.min.mjs'),
  };
  for (const font of readdirSync(join(pdfjsRoot, 'standard_fonts')))
    files[`standard_fonts/${font}`] = join(pdfjsRoot, 'standard_fonts', font);
  const base = `/pdfjs/${pdfjsVersion}/`;
  return {
    name: 'care-pdfjs-vendor',
    config: () => ({ define: { __PDFJS_BASE__: JSON.stringify(base) } }),
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const source = request.url?.startsWith(base) ? files[request.url.slice(base.length)] : '';
        if (!source) return next();
        response.setHeader(
          'Content-Type',
          source.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream',
        );
        response.end(readFileSync(source));
      });
    },
    generateBundle() {
      for (const [name, source] of Object.entries(files))
        this.emitFile({
          type: 'asset',
          fileName: `${base.slice(1)}${name}`,
          source: readFileSync(source),
        });
    },
  };
}

export default defineConfig({
  plugins: [
    pdfjsVendor(),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      includeManifestIcons: false,
      injectManifest: {
        target: 'safari11.3',
        globPatterns: ['assets/**/*.{js,css,woff2,png}', 'offline.html'],
        globIgnores: ['**/design-system-*.js', '**/design-system-*.css', '**/*.map'],
      },
      manifest: {
        id: '/',
        name: 'CARE Member Voice',
        short_name: 'CARE',
        description: 'Kanal member voice TMMIN yang aman dan dapat ditelusuri.',
        scope: '/',
        start_url: '/',
        display: 'standalone',
        theme_color: '#0b63e5',
        background_color: '#f3f5f7',
        // Lets /install ask Chromium whether this PWA is already on the phone.
        related_applications: [{ platform: 'webapp', url: '/manifest.webmanifest' }],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 4173,
    proxy: { '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  build: {
    target: 'safari11.3',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('DesignPage')) return 'design-system';
          return undefined;
        },
      },
    },
  },
});
