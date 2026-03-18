import { test as base, chromium, type Page, type BrowserContext } from '@playwright/test';
import { createHash } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function deriveCdpPort(): number {
  const projectRoot = path.resolve(__dirname, '../../..');
  const hash = createHash('md5').update(projectRoot).digest('hex').slice(0, 4);
  return 10000 + (parseInt(hash, 16) % 50000);
}

type AppFixtures = {
  appPage: Page;
  appContext: BrowserContext;
};

export const test = base.extend<AppFixtures>({
  appContext: async ({}, use) => {
    const cdpPort = deriveCdpPort();
    const browser = await chromium.connectOverCDP(`http://localhost:${cdpPort}`, {
      isLocal: true,
    });
    const context = browser.contexts()[0];
    await use(context);
    // Don't disconnect — the app stays running across tests
  },
  appPage: async ({ appContext }, use) => {
    const pages = appContext.pages();
    const page = pages[0];
    if (!page) throw new Error('No pages found in Electron context');
    await use(page);
  },
});

export { expect } from '@playwright/test';

/** Wait for the app's root React element to render. */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForSelector('.flex.h-screen', { timeout: 30_000 });
}

/** Ensure we're on the workspace view by pressing Escape until we get there. */
export async function ensureWorkspace(page: Page): Promise<void> {
  await waitForAppReady(page);
  // Press Escape up to 3 times to dismiss settings/forms/detail panels
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

/** Save a screenshot to the playwright/ directory. */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `playwright/${name}.png` });
}
