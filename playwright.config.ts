import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-level tests for the storefront and admin panel.
 *
 * These run against a server that is already up — the API on :4000 and Vite on
 * :5173 — because the suite shares the seeded PostgreSQL database with
 * `npm run verify`. Start both, then:
 *
 *   npm run e2e            headless, desktop + mobile
 *   npm run e2e:headed     watch it happen
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Checkout writes real orders, so the specs must not race each other.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
