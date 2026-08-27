import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4174,
    proxy: Object.fromEntries(
      ['/api/v1', '/health', '/ready', '/release.json'].map((path) => [
        path,
        { target: 'http://127.0.0.1:3000', changeOrigin: false },
      ]),
    ),
  },
  preview: { port: 4174 },
});
