import { test, expect, ensureWorkspace } from '../e2e/helpers/app';

test.describe('Keyboard Shortcuts @fast', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-130: Cmd+B toggles sidebar visibility', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // Sidebar should be visible initially
    const sidebar = appPage.getByRole('button', { name: /New Campaign/i });
    await expect(sidebar).toBeVisible();

    // Toggle sidebar off
    await appPage.keyboard.press('Meta+b');
    await expect(sidebar).not.toBeVisible();

    // Toggle sidebar back on
    await appPage.keyboard.press('Meta+b');
    await expect(sidebar).toBeVisible();
  });

  test('T-131: Cmd+, opens Settings', async ({ appPage }) => {
    await appPage.keyboard.press('Meta+,');
    await expect(appPage.getByRole('heading', { name: 'General' })).toBeVisible({ timeout: 5_000 });
  });

  test('T-133: Escape closes settings', async ({ appPage }) => {
    await appPage.keyboard.press('Escape');
    await expect(appPage.getByRole('button', { name: /New Campaign/i })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('T-132: Cmd+Shift+N opens New Run when campaign selected', async ({ appPage }) => {
    await appPage.keyboard.press('Meta+Shift+n');
    // Should navigate to new run form — look for submit button or sequence display
    await expect(
      appPage.getByRole('button', { name: /Submit/i }),
    ).toBeVisible({ timeout: 5_000 });
    // Go back
    await appPage.keyboard.press('Escape');
  });
});
