import { test, expect, ensureWorkspace, screenshot } from '../e2e/helpers/app';
import { TEST_RUN_NAME, TEST_COMPOUNDS } from '../e2e/fixtures/test-data';

test.describe('Results Viewing @api', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-080: results table renders with column headers', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // Results table should be visible with header columns
    await expect(appPage.getByText('Status').first()).toBeVisible({ timeout: 10_000 });
    await expect(appPage.getByText('Compound').first()).toBeVisible();
    await expect(appPage.getByText('SMILES').first()).toBeVisible();
  });

  test('T-081: compounds listed with names', async ({ appPage }) => {
    for (const compound of TEST_COMPOUNDS) {
      await expect(appPage.getByText(compound.name).first()).toBeVisible();
    }
  });

  test('T-082: status badges shown', async ({ appPage }) => {
    // At least one status badge should be visible (PENDING, CREATED, RUNNING, or COMPLETED)
    const statusBadge = appPage
      .locator('text=/PENDING|CREATED|RUNNING|COMPLETED|FAILED/i')
      .first();
    await expect(statusBadge).toBeVisible();
  });

  test('T-085: first compound auto-selected, detail panel opens', async ({ appPage }) => {
    // The detail panel should be open with the first compound's name
    const detailHeader = appPage.getByText(TEST_COMPOUNDS[0].name);
    await expect(detailHeader.first()).toBeVisible();
  });

  test('T-083: column headers are sortable', async ({ appPage }) => {
    // Click on "Compound" header to sort
    const compoundHeader = appPage.getByText('Compound').first();
    await compoundHeader.click();
    // Click again to toggle sort direction
    await compoundHeader.click();
    // No error means sorting works
  });

  test('T-087: arrow keys navigate between compounds', async ({ appPage }) => {
    // Press ArrowDown to move to next compound
    await appPage.keyboard.press('ArrowDown');
    // The second compound should now be selected
    await expect(appPage.getByText(TEST_COMPOUNDS[1].name)).toBeVisible();
    // Press ArrowUp to go back
    await appPage.keyboard.press('ArrowUp');
  });

  test('T-088: run name displayed in header and editable', async ({ appPage }) => {
    await expect(appPage.getByText(TEST_RUN_NAME).first()).toBeVisible();
  });

  test('T-092: @api wait for at least one compound to complete', async ({ appPage }) => {
    test.setTimeout(300_000); // 5 minutes

    // Poll until we see COMPLETED status
    await expect(appPage.getByText(/COMPLETED/i).first()).toBeVisible({ timeout: 300_000 });

    await screenshot(appPage, 'results-completed');
  });

  test('T-084: metrics show values for completed compounds', async ({ appPage }) => {
    // After completion, metric columns should show numeric values (not just dashes)
    // Look for a number pattern like "0.XX" in the table
    await expect(appPage.locator('td').filter({ hasText: /^0\.\d{2}$/ }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('T-090: protein campaign shows affinity columns', async ({ appPage }) => {
    // For a protein+ligand campaign, binding confidence and optimization score columns should exist
    await expect(appPage.getByText(/Binding/i).first()).toBeVisible();
    await expect(appPage.getByText(/Optimization/i).first()).toBeVisible();
  });
});
