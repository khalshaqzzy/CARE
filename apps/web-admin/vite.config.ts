import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 4174,
    proxy: { '/api/v1': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
  },
  preview: { port: 4174 },
});
