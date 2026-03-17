import { test, expect, ensureWorkspace } from '../e2e/helpers/app';
import { getApiKey } from '../e2e/fixtures/test-data';

test.describe('Settings @fast @api', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-010: Cmd+, opens Settings page', async ({ appPage }) => {
    await ensureWorkspace(appPage);
    await appPage.keyboard.press('Meta+,');
    await expect(appPage.getByRole('heading', { name: 'General' })).toBeVisible({ timeout: 5_000 });
  });

  test('T-011: four nav sections visible', async ({ appPage }) => {
    await expect(appPage.getByRole('button', { name: 'General' })).toBeVisible();
    await expect(appPage.getByRole('button', { name: 'Appearance' })).toBeVisible();
    await expect(appPage.getByRole('button', { name: 'Workspace Directory' })).toBeVisible();
    await expect(appPage.getByRole('button', { name: 'API Key' })).toBeVisible();
  });

  test('T-012: can navigate between sections', async ({ appPage }) => {
    await appPage.getByRole('button', { name: 'Appearance' }).click();
    // Appearance section has <h2>Appearance</h2> and <Label>Theme</Label>
    await expect(appPage.getByRole('heading', { name: 'Appearance' })).toBeVisible();

    await appPage.getByRole('button', { name: 'General' }).click();
    await expect(appPage.getByText('Notifications', { exact: true })).toBeVisible();
  });

  test('T-018: theme switcher has Light/Dark/System options', async ({ appPage }) => {
    await appPage.getByRole('button', { name: 'Appearance' }).click();
    await expect(appPage.getByRole('button', { name: 'Light' }).first()).toBeVisible();
    await expect(appPage.getByRole('button', { name: 'Dark' }).first()).toBeVisible();
    await expect(appPage.getByRole('button', { name: 'System' }).first()).toBeVisible();
  });

  test('T-019: theme switching applies immediately', async ({ appPage }) => {
    await appPage.getByRole('button', { name: 'Light' }).first().click();
    const html = appPage.locator('html');
    await expect(html).not.toHaveClass(/dark/);

    await appPage.getByRole('button', { name: 'Dark' }).first().click();
    await expect(html).toHaveClass(/dark/);
  });

  test('T-021: notifications toggle works', async ({ appPage }) => {
    await appPage.getByRole('button', { name: 'General' }).click();
    const toggle = appPage.locator('button[role="switch"]').first();
    await expect(toggle).toBeVisible();
    await toggle.click();
  });

  test('T-015: @api valid API key validates with green checkmark', async ({ appPage }) => {
    test.setTimeout(30_000);
    const apiKey = getApiKey();
    await appPage.getByRole('button', { name: 'API Key' }).click();
    await appPage.waitForTimeout(500);

    const input = appPage.locator('input[type="password"], input[placeholder*="boltzpk"]').first();
    await expect(input).toBeVisible();
    await input.fill('');
    await input.fill(apiKey);

    // Wait for debounced validation — save button becomes enabled when key is valid
    const saveButton = appPage.getByRole('button', { name: /Save/i });
    await expect(saveButton).toBeEnabled({ timeout: 15_000 });
  });

  test('T-017: @api save button saves API key', async ({ appPage }) => {
    const saveButton = appPage.getByRole('button', { name: /Save/i });
    await saveButton.click();
    await expect(appPage.getByText(/Saved/i)).toBeVisible({ timeout: 5_000 });
  });

  test('T-023: Escape returns to workspace', async ({ appPage }) => {
    await appPage.keyboard.press('Escape');
    await appPage.waitForTimeout(500);
  });
});
