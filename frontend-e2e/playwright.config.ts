import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';

const baseURL = process.env.BASE_URL || 'http://localhost:4200';
const isCI = !!process.env.CI;
export default defineConfig({
  ...nxE2EPreset(__filename, {
    testDir: './src',
  }),

  timeout: 120_000,
  expect: { timeout: 10_000 },
  retries: isCI ? 2 : 1,
  workers: isCI ? 2 : undefined,

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    // Add header so backend can detect automated E2E requests and bypass throttling
    extraHTTPHeaders: {
      'x-e2e': '1',
    },
    // prefer built-in getBy* methods
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }],
    ['./reporters/enhanced-reporter.ts'],
  ],
});

