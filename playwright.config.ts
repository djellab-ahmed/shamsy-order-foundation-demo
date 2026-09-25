import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3101';
export default defineConfig({
  testDir: './tests/e2e', timeout: 30000, use: { baseURL, ...devices['Desktop Chrome'] },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: 'SHAMSY_E2E_SERVER=1 npm run dev -- --hostname 127.0.0.1 --port 3101', url: 'http://127.0.0.1:3101/orders/new', reuseExistingServer: false, timeout: 120000 },
});
