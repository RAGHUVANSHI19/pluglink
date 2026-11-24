import { defineConfig, devices } from '@playwright/test';

const defaultUrl = 'http://localhost:5173';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || defaultUrl;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    timezoneId: 'Asia/Kolkata',
    launchOptions: executablePath ? { executablePath } : undefined,
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run dev',
    url: defaultUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
