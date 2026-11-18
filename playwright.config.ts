/**
 * RemediAide — Playwright E2E Configuration
 *
 * Base URL: http://localhost:3000 (Next.js dev server).
 * Tests live in tests/e2e/**‌/*.spec.ts
 *
 * Run:  npx playwright test
 * UI:   npx playwright test --ui
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // sequential — shared DB state across tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Cookies & storage persist within a describe block via storageState
    actionTimeout: 8_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  // NOTE: start the dev server manually with `npm run dev` before running E2E tests.
  // webServer is omitted here so CI pipelines can control the server lifecycle.
});
