import { defineConfig } from '@playwright/test';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function deriveCdpPort(projectRoot: string): number {
  const hash = createHash('md5').update(projectRoot).digest('hex').slice(0, 4);
  return 10000 + (parseInt(hash, 16) % 50000);
}

const CDP_PORT = deriveCdpPort(path.resolve(__dirname));

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'html',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  metadata: {
    cdpPort: CDP_PORT,
  },
});
