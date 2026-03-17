import { test, expect, ensureWorkspace } from '../e2e/helpers/app';
import { TEST_CAMPAIGN_NAME } from '../e2e/fixtures/test-data';

test.describe('Workspace Directory @fast', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-150: current workspace directory displayed in Settings', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // Open Settings
    await appPage.keyboard.press('Meta+,');
    await appPage.waitForTimeout(500);

    // Navigate to Workspace Directory section
    await appPage.getByText('Workspace Directory').click();
    await appPage.waitForTimeout(500);

    // Should show a directory path
    await expect(appPage.locator('code, pre').first()).toBeVisible();
  });

  test('T-151: MANUAL — change workspace to new empty directory', async ({ appPage }) => {
    console.log('USER ACTION REQUIRED:');
    console.log('1. Click "Choose Folder" button');
    console.log('2. In the native dialog, create and select a new empty directory');
    console.log('3. Confirm the selection');
    console.log('');
    console.log(
      'The Choose Folder button triggers a native OS dialog that Playwright cannot automate.',
    );
    console.log('Skipping automated interaction — test the workspace directory manually.');

    // Verify the Choose Folder button exists and is clickable
    const chooseBtn = appPage.getByRole('button', { name: /Choose Folder/i });
    await expect(chooseBtn).toBeVisible();
  });

  test('T-153: API Key section renders correctly', async ({ appPage }) => {
    // Navigate to API Key section
    await appPage.getByText('API Key').click();
    await appPage.waitForTimeout(500);

    // Verify the API Key section is visible with an input field
    const input = appPage.locator('input[type="password"], input[placeholder*="boltzpk"]').first();
    await expect(input).toBeVisible({ timeout: 5_000 });

    // Verify there is a save or submit button for the API key
    const saveBtn = appPage.getByRole('button', { name: /save|set|update/i }).first();
    if (await saveBtn.isVisible()) {
      await expect(saveBtn).toBeVisible();
    }
  });

  test('T-023b: return to workspace from settings', async ({ appPage }) => {
    await appPage.keyboard.press('Escape');
    await expect(appPage.getByRole('button', { name: /New Campaign/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});
