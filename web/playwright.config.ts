import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// The e2e suite runs against its own server on a separate port and a throwaway data
// directory, so it never touches a real LoMu account or database.
const PORT = 4199;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure' },
  webServer: {
    // A stale .next cache from earlier dev runs can make Turbopack's HMR reload the page in a loop, so start clean.
    command: `node -e "require('fs').rmSync('.next',{recursive:true,force:true})" && npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/auth/status`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: { LOMU_DATA_DIR: path.join(os.tmpdir(), `lomu-e2e-${process.pid}`), LOMU_CACHE_DIR: path.join(os.tmpdir(), 'lomu-yt-cache') },
  },
});
