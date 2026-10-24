import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development the API and sync server run in Docker behind nginx on :8080.
const backend = 'http://127.0.0.1:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': backend,
      '/sync': { target: backend, ws: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
