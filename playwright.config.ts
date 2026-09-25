import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, use: { baseURL, ...devices['Desktop Chrome'] },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'npm run dev -- --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100/orders/new', reuseExistingServer: !process.env.CI, timeout: 120000 },
});
