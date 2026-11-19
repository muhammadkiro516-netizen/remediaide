// Local run of tests/e2e/ml-mode.spec.ts with the installed Google Chrome (bundled Chromium may not launch on new macOS).
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /ml-mode\.spec\.ts/,
  timeout: 60_000,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000', channel: 'chrome', headless: true },
});
