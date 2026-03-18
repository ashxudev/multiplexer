import { test, expect, ensureWorkspace, screenshot } from '../e2e/helpers/app';

test.describe('Layout @fast', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-140: sidebar visible at default width', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    const sidebar = appPage.getByRole('button', { name: /New Campaign/i });
    await expect(sidebar).toBeVisible();
  });

  test('T-141: Cmd+B hides sidebar, Cmd+B shows it again', async ({ appPage }) => {
    // Hide
    await appPage.keyboard.press('Meta+b');
    const sidebar = appPage.getByRole('button', { name: /New Campaign/i });
    await expect(sidebar).not.toBeVisible();

    // Show
    await appPage.keyboard.press('Meta+b');
    await expect(sidebar).toBeVisible();
  });

  test('T-143: three-panel layout structure intact', async ({ appPage }) => {
    await screenshot(appPage, 'layout-three-panel');

    // The root should contain the flex layout
    const root = appPage.locator('.flex.h-screen');
    await expect(root).toBeVisible();
  });
});
