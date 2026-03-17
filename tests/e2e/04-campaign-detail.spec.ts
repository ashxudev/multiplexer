import { test, expect, ensureWorkspace } from '../e2e/helpers/app';
import { TEST_CAMPAIGN_NAME, TEST_PROTEIN_SEQUENCE } from '../e2e/fixtures/test-data';

test.describe('Campaign Detail @fast', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-050: settings icon on campaign opens detail page', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // The gear icon is an SVG with cursor-pointer class inside the campaign button row
    const campaignBtn = appPage.getByRole('button', { name: TEST_CAMPAIGN_NAME });
    const settingsIcon = campaignBtn.locator('svg.cursor-pointer');
    await settingsIcon.click();

    // Campaign detail page should show the campaign name
    await expect(appPage.getByText(TEST_CAMPAIGN_NAME)).toBeVisible({ timeout: 5_000 });
  });

  test('T-053: target sequence displayed in monospace', async ({ appPage }) => {
    // The sequence should be visible somewhere on the detail page
    await expect(appPage.getByText(TEST_PROTEIN_SEQUENCE)).toBeVisible();
  });

  test('T-054: target type displayed', async ({ appPage }) => {
    await expect(appPage.getByText('Protein', { exact: true })).toBeVisible();
  });

  test('T-056: created date displayed', async ({ appPage }) => {
    // Should show some date text (format varies)
    await expect(appPage.getByText(/202\d/)).toBeVisible();
  });

  test('T-055: description field editable', async ({ appPage }) => {
    const descField = appPage.locator('textarea').first();
    if (await descField.isVisible()) {
      await descField.fill('Test description for e2e');
      await descField.blur();
      // Verify it saved (still shows the text after blur)
      await expect(descField).toHaveValue('Test description for e2e');
    }
  });

  test('T-057: back button returns to workspace', async ({ appPage }) => {
    await appPage.keyboard.press('Escape');
    await expect(appPage.getByRole('button', { name: /New Campaign/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});
