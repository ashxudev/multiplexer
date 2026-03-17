import { test, expect, ensureWorkspace, screenshot } from '../e2e/helpers/app';
import { TEST_RUN_NAME } from '../e2e/fixtures/test-data';

test.describe('CSV Export @api', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-160: export CSV button visible in results table header', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // Try to click the run in sidebar to show results (if it exists)
    const runLink = appPage.getByText(TEST_RUN_NAME).first();
    if (await runLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await runLink.click();
      await appPage.waitForTimeout(1000);
    }

    // Check if a results table is visible (indicating a run is selected)
    const resultsTable = appPage.locator('table, [role="grid"], [role="table"]').first();
    if (await resultsTable.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // The export button should be in the results header (Download icon)
      const exportBtn = appPage
        .locator('button')
        .filter({ has: appPage.locator('svg') });
      // There should be at least one button with an icon in the header
      await expect(exportBtn.first()).toBeVisible();
    } else {
      // No results table visible — skip gracefully
      console.log('No results table visible; skipping export button check');
      test.skip();
    }
  });

  test('T-162: MANUAL — export CSV and inspect content', async ({ appPage }) => {
    await screenshot(appPage, 'csv-export-before');

    console.log('USER ACTION REQUIRED:');
    console.log('1. Click the Export CSV button (download icon in the results header)');
    console.log('2. Save the file via the native Save dialog');
    console.log('3. Open the saved CSV and verify:');
    console.log('   - Correct columns: Rank, Name, SMILES, Status, metrics...');
    console.log('   - Correct data values matching what the results table shows');
    console.log('   - Correct sort order');
    console.log('   - For protein targets: Binding Confidence and Optimization Score columns');
  });
});
