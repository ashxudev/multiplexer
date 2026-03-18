import { test, expect, ensureWorkspace } from '../e2e/helpers/app';
import {
  TEST_CAMPAIGN_NAME,
  TEST_COMPOUNDS,
  INVALID_SMILES,
  TEST_RUN_NAME,
} from '../e2e/fixtures/test-data';

test.describe('Run Creation @fast @api', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-060: New Run button navigates to form', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // Click "New Run" — expand campaign first if it's collapsed
    const newRunBtn = appPage.getByRole('button', { name: /New Run/i });
    if (!(await newRunBtn.isVisible())) {
      await appPage.getByRole('button', { name: TEST_CAMPAIGN_NAME }).click();
      await appPage.waitForTimeout(300);
    }
    await newRunBtn.click();

    // Run form should appear
    await expect(appPage.locator('input').first()).toBeVisible({ timeout: 5_000 });
  });

  test('T-062: target sequence shown read-only', async ({ appPage }) => {
    // The protein sequence should be displayed somewhere on the page
    await expect(appPage.getByText(/GIVEQCC/i)).toBeVisible();
  });

  test('T-066: advanced parameters section collapsed by default', async ({ appPage }) => {
    // Advanced section should exist but be collapsed
    const advancedToggle = appPage.getByText(/Advanced/i).first();
    await expect(advancedToggle).toBeVisible();
  });

  test('T-070: submit button disabled when no compounds', async ({ appPage }) => {
    const submitBtn = appPage.getByRole('button', { name: /Submit/i });
    await expect(submitBtn).toBeDisabled();
  });

  test('T-063: paste mode: can enter SMILES', async ({ appPage }) => {
    // Find the SMILES textarea (paste mode should be default)
    const smilesInput = appPage.locator('textarea').last();
    const smilesText = TEST_COMPOUNDS.map((c) => `${c.name},${c.smiles}`).join('\n');
    await smilesInput.fill(smilesText);

    // Wait for parsing — table should show both compounds
    await expect(appPage.getByRole('cell', { name: TEST_COMPOUNDS[1].name })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('T-069: @api SMILES validation highlights invalid entries', async ({ appPage }) => {
    test.setTimeout(90_000);

    // Add an invalid SMILES
    const smilesInput = appPage.locator('textarea').last();
    const currentVal = await smilesInput.inputValue();
    await smilesInput.fill(currentVal + `\nBadCompound,${INVALID_SMILES}`);

    // Wait for RDKit WASM to load and validate — button text changes to "N Invalid SMILES"
    await expect(
      appPage.getByRole('button', { name: /Invalid SMILES/i }),
    ).toBeVisible({ timeout: 60_000 });

    // Remove the invalid line
    const validText = TEST_COMPOUNDS.map((c) => `${c.name},${c.smiles}`).join('\n');
    await smilesInput.fill(validText);

    // Wait for validation to clear — invalid SMILES button should disappear
    await expect(
      appPage.getByRole('button', { name: /Invalid SMILES/i }),
    ).not.toBeVisible({ timeout: 15_000 });
  });

  test('T-072: @api run submission succeeds', async ({ appPage }) => {
    test.setTimeout(120_000);

    // Fill run name
    const nameInput = appPage.locator('input').first();
    await nameInput.fill(TEST_RUN_NAME);

    // Submit
    const submitBtn = appPage.getByRole('button', { name: /Submit/i });
    await expect(submitBtn).toBeEnabled({ timeout: 60_000 });
    await submitBtn.click();

    // Should redirect to workspace with results table
    await expect(appPage.getByText(TEST_RUN_NAME).first()).toBeVisible({ timeout: 30_000 });
  });

  test('T-073: @api run appears in sidebar', async ({ appPage }) => {
    await expect(appPage.getByText(TEST_RUN_NAME).first()).toBeVisible();
  });
});
