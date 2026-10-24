import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the Docker stack (npm run up), exactly as the app is used.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  workers: 2,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.EQAPMAP_URL ?? 'http://localhost:8080',
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
