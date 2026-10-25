import { defineConfig, devices } from '@playwright/test';

// BASE_URL set   -> test an already deployed site (e.g. QA)
// BASE_URL empty -> start the demo app locally and test that
const baseURL = process.env.BASE_URL || 'http://localhost:3000';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: isCI,          // a forgotten test.only fails the run in CI
  retries: isCI ? 1 : 0,     // passes on retry = "flaky" in the report
  workers: isCI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['json', { outputFile: 'results/results.json' }],
  ],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm start',
        url: `${baseURL}/health`,
        reuseExistingServer: !isCI,
        timeout: 30_000,
      },
});
