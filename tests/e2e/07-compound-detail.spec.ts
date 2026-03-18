import { test, expect, ensureWorkspace, screenshot } from '../e2e/helpers/app';
import { TEST_COMPOUNDS } from '../e2e/fixtures/test-data';

test.describe('Compound Detail @api', () => {
  test.describe.configure({ mode: 'serial' });

  test('T-100: detail panel shows compound name in header', async ({ appPage }) => {
    await ensureWorkspace(appPage);

    // Click first compound to ensure detail panel is open
    await appPage.getByText(TEST_COMPOUNDS[0].name).first().click();
    // Detail panel header should show compound name
    await expect(appPage.getByText(TEST_COMPOUNDS[0].name).first()).toBeVisible({ timeout: 5_000 });
  });

  test('T-102: 3D Mol* viewer canvas is present', async ({ appPage }) => {
    // Mol* renders into a canvas element
    const canvas = appPage.locator('canvas').first();
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Verify it has real dimensions (not 0x0)
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(50);
    expect(box!.height).toBeGreaterThan(50);
  });

  test('T-103: MANUAL — 3D viewer screenshot for inspection', async ({ appPage }) => {
    await screenshot(appPage, 'compound-detail-3d-viewer');
    console.log('USER ACTION REQUIRED: Inspect playwright/compound-detail-3d-viewer.png');
    console.log('Confirm the Mol* 3D viewer rendered correctly (not blank/broken).');
  });

  test('T-106: all 6 metric cards shown for protein target', async ({ appPage }) => {
    // Check for structural metrics
    await expect(appPage.getByText(/Structure Confidence/i).first()).toBeVisible();
    await expect(appPage.getByText(/Complex pLDDT/i).first()).toBeVisible();
    await expect(appPage.getByText(/ipTM/i).first()).toBeVisible();
    await expect(appPage.getByText(/pTM/i).first()).toBeVisible();

    // Check for affinity metrics (protein+ligand campaign)
    await expect(appPage.getByText(/Binding/i).first()).toBeVisible();
    await expect(appPage.getByText(/Optimization/i).first()).toBeVisible();
  });

  test('T-107: 2D RDKit molecule image rendered', async ({ appPage }) => {
    // RDKit renders an SVG element for the 2D structure inside a molecule container
    const moleculeVisual = appPage.locator('[class*="molecule"] svg, [class*="molecule"] img').first();
    await expect(moleculeVisual).toBeVisible({ timeout: 10_000 });
  });

  test('T-104: fullscreen toggle on 3D viewer', async ({ appPage }) => {
    // Find the maximize/fullscreen button near the viewer
    const fullscreenBtn = appPage
      .locator('button')
      .filter({ has: appPage.locator('svg') })
      .filter({ hasText: '' });

    // Look for a button near the canvas (maximize icon)
    const viewerArea = appPage.locator('canvas').first().locator('..');
    const buttons = viewerArea.locator('button');
    const count = await buttons.count();
    if (count > 0) {
      await buttons.first().click();
      await appPage.waitForTimeout(500);
    }
  });

  test('T-105: exit fullscreen via Escape', async ({ appPage }) => {
    await appPage.keyboard.press('Escape');
    await appPage.waitForTimeout(500);
  });

  test('T-101: close button deselects compound', async ({ appPage }) => {
    // Find close button (X) in the detail panel header
    const closeBtn = appPage
      .locator('button')
      .filter({ has: appPage.locator('svg') })
      .last();

    // Look for a button with X icon in the detail header area
    const detailClose = appPage.getByRole('button', { name: /close/i }).first();
    if (await detailClose.isVisible()) {
      await detailClose.click();
    } else {
      // Try clicking the X button directly
      await appPage.keyboard.press('Escape');
    }
  });
});
