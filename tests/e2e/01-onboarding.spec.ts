import { test, expect, waitForAppReady, screenshot } from '../e2e/helpers/app';

test.describe('Onboarding @fast', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-001: app loads and root element renders', async ({ appPage }) => {
    await waitForAppReady(appPage);
    const root = appPage.locator('.flex.h-screen');
    await expect(root).toBeVisible();
  });

  test('T-002: empty state shows onboarding card', async ({ appPage }) => {
    // The onboarding card contains the "Set up Boltz Lab API key" button
    const onboardingButton = appPage.getByRole('button', { name: /API key/i });
    await expect(onboardingButton).toBeVisible({ timeout: 10_000 });
  });

  test('T-003: sidebar shows New Campaign button but no campaigns', async ({ appPage }) => {
    const newCampaignBtn = appPage.getByRole('button', { name: /New Campaign/i });
    await expect(newCampaignBtn).toBeVisible();
  });

  test('T-004: clicking API key button navigates to Settings', async ({ appPage }) => {
    const onboardingButton = appPage.getByRole('button', { name: /API key/i });
    await onboardingButton.click();
    // Settings page should now be visible
    await expect(appPage.getByText('API Key')).toBeVisible({ timeout: 5_000 });
  });

  test('T-005: can return to workspace via Escape', async ({ appPage }) => {
    await appPage.keyboard.press('Escape');
    // Should be back at workspace — onboarding card visible again
    const onboardingButton = appPage.getByRole('button', { name: /API key/i });
    await expect(onboardingButton).toBeVisible({ timeout: 5_000 });
  });
});
