/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is published at https://<user>.github.io/setoffiq/, so assets need
// that prefix in production. Locally the app is served from the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/setoffiq/' : '/',
  plugins: [react()],
  // In development, serve the data snapshots from the live site. The copies in
  // public/data are only a build fallback and go stale within the hour; a
  // day-old flight snapshot in dev once looked exactly like a production bug.
  server: {
    proxy: {
      '/data': {
        target: 'https://sayamdev.github.io',
        changeOrigin: true,
        rewrite: (path) => `/setoffiq${path}`,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
