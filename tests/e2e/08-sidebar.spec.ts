import { test, expect, ensureWorkspace } from '../e2e/helpers/app';
import { TEST_CAMPAIGN_NAME, TEST_RUN_NAME } from '../e2e/fixtures/test-data';

test.describe('Sidebar @fast', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-120: campaign listed in sidebar', async ({ appPage }) => {
    await ensureWorkspace(appPage);
    await expect(appPage.getByText(TEST_CAMPAIGN_NAME).first()).toBeVisible();
  });

  test('T-121: campaign expand/collapse toggle', async ({ appPage }) => {
    const campaignBtn = appPage.getByRole('button', { name: TEST_CAMPAIGN_NAME });
    const runText = appPage.getByText(TEST_RUN_NAME).first();

    // Ensure campaign is expanded first
    if (!(await runText.isVisible())) {
      await campaignBtn.click();
      await appPage.waitForTimeout(300);
    }
    await expect(runText).toBeVisible({ timeout: 5_000 });

    // Click to collapse — run should disappear
    await campaignBtn.click();
    await expect(runText).not.toBeVisible();

    // Click to expand again — run should reappear
    await campaignBtn.click();
    await expect(runText).toBeVisible({ timeout: 5_000 });
  });

  test('T-122: runs listed under expanded campaign', async ({ appPage }) => {
    await expect(appPage.getByText(TEST_RUN_NAME).first()).toBeVisible();
  });

  test('T-124: New Run button under campaign', async ({ appPage }) => {
    const newRunBtn = appPage.getByRole('button', { name: /New Run/i });
    await expect(newRunBtn).toBeVisible();
  });

  test('T-125: New Campaign button at top of sidebar', async ({ appPage }) => {
    const newCampaignBtn = appPage.getByRole('button', { name: /New Campaign/i });
    await expect(newCampaignBtn).toBeVisible();
  });
});
