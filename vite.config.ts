/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is published at https://<user>.github.io/setoffiq/, so assets need
// that prefix in production. Locally the app is served from the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/setoffiq/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
