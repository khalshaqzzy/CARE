import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
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
