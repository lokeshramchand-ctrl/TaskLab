import { defineConfig } from '@playwright/test';

// Smoke run against the deployed site (set LOMU_URL / LOMU_USER / LOMU_PASS). No local server is started.
export default defineConfig({
  testDir: 'tests/prod',
  timeout: 240_000,
  workers: 1,
  retries: 0,
  use: { baseURL: process.env.LOMU_URL ?? 'https://lomu.deploy-ui.lokeshrc.me', viewport: { width: 1360, height: 860 } },
});
