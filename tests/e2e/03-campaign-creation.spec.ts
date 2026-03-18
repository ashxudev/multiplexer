import { test, expect, ensureWorkspace } from '../e2e/helpers/app';
import { TEST_CAMPAIGN_NAME, TEST_PROTEIN_SEQUENCE } from '../e2e/fixtures/test-data';

test.describe('Campaign Creation @fast @api', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-030: New Campaign button navigates to form', async ({ appPage }) => {
    await ensureWorkspace(appPage);
    const btn = appPage.getByRole('button', { name: /New Campaign/i });
    await btn.click();
    // Campaign form should appear with heading
    await expect(appPage.getByRole('heading', { name: 'New Campaign' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('T-031: form has name, target type, sequence, and description fields', async ({
    appPage,
  }) => {
    // Name input
    await expect(appPage.locator('input').first()).toBeVisible();
    // Target type selector
    await expect(appPage.getByText(/Protein/i).first()).toBeVisible();
    // Sequence textarea
    await expect(appPage.locator('textarea').first()).toBeVisible();
  });

  test('T-037: create button disabled when name or sequence empty', async ({ appPage }) => {
    const createBtn = appPage.getByRole('button', { name: /Create/i });
    await expect(createBtn).toBeDisabled();
  });

  test('T-033: protein sequence validation rejects invalid characters', async ({ appPage }) => {
    const textarea = appPage.locator('textarea').first();
    await textarea.fill('INVALID123!!!');
    await textarea.blur();
    // Should show validation error
    await expect(appPage.getByText(/invalid/i).first()).toBeVisible({ timeout: 5_000 });
    // Clear for next test
    await textarea.fill('');
  });

  test('T-036: FASTA headers stripped on blur', async ({ appPage }) => {
    const textarea = appPage.locator('textarea').first();
    await textarea.fill('>sp|P01308|INS_HUMAN\nGIVEQCCTSICSLYQLENYCN');
    await textarea.blur();
    // After blur, the header should be stripped — only sequence remains
    const value = await textarea.inputValue();
    expect(value).not.toContain('>');
    expect(value).toContain('GIVEQCCTSICSLYQLENYCN');
  });

  test('T-038: @api campaign creation succeeds', async ({ appPage }) => {
    // Fill in the form
    const nameInput = appPage.locator('input').first();
    await nameInput.fill(TEST_CAMPAIGN_NAME);

    const textarea = appPage.locator('textarea').first();
    await textarea.fill(TEST_PROTEIN_SEQUENCE);

    const createBtn = appPage.getByRole('button', { name: /Create/i });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();

    // Should redirect to workspace
    await expect(appPage.getByRole('button', { name: /New Campaign/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('T-039: @api new campaign appears in sidebar', async ({ appPage }) => {
    await expect(appPage.getByText(TEST_CAMPAIGN_NAME).first()).toBeVisible({ timeout: 5_000 });
  });
});
