# Multiplexer E2E Verification Protocol (Playwright MCP)

Interactive end-to-end test protocol for Claude to execute via Playwright MCP tools against the production binary. This is the primary QA verification method — Claude drives the real app interactively, inspecting accessibility trees, taking screenshots, and verifying every flow.

## Prerequisites

### Launch the production binary

```bash
bash scripts/prod-test.sh
```

Wait ~5 seconds for the app window to appear, then verify CDP is responding:

```bash
CDP_PORT=$(python3 -c "
import hashlib, sys
h = int(hashlib.md5(sys.argv[1].encode()).hexdigest()[:4], 16)
print(10000 + (h % 50000))
" "$(pwd)")
curl -s http://localhost:$CDP_PORT/json/version | head -1
```

If this returns JSON, the app is ready. Proceed with the protocol.

### Clean state

The `prod-test.sh` script uses isolated temp directories, so each launch starts clean. If you need to re-run from scratch, stop and clean up first:

```bash
bash scripts/prod-test-stop.sh
rm -rf /tmp/multiplexer-prod-playwright-* /tmp/multiplexer-prod-test-*
bash scripts/prod-test.sh
```

### MCP tool reference

All interactions use tools prefixed with `mcp__playwright_electron__`:
- `browser_snapshot` — Get accessibility tree with `ref` IDs
- `browser_click` — Click an element by `ref`
- `browser_type` — Type text into focused element
- `browser_fill_form` — Fill form fields
- `browser_press_key` — Keyboard shortcuts (e.g., `Meta+b`)
- `browser_select_option` — Select dropdown values
- `browser_take_screenshot` — Capture PNG to `playwright/` directory
- `browser_hover` — Hover over an element
- `browser_evaluate` — Run JS in page context
- `browser_wait_for` — Wait for element state

### Test data

```
API Key:        (see CLAUDE.md for the Boltz Lab API key)
Protein:        GIVEQCCTSICSLYQLENYCN
Campaign Name:  E2E Test Campaign
Run Name:       E2E Test Run
Compound 1:     Aspirin,CC(=O)Oc1ccccc1C(=O)O
Compound 2:     Ethanol,CCO
Invalid SMILES: BadCompound,NOT_A_REAL_SMILES
```

---

## Phase 1: Onboarding (Empty State)

**Goal:** Verify the app launches to a clean empty state with onboarding prompts.

### 1.1 App loads

1. `browser_snapshot` — Verify the page rendered. Look for a root flex layout element.
2. `browser_take_screenshot` → `playwright/01-onboarding-empty.png`
3. **Verify:** The main content area shows the pixel art "MULTIPLEXER" logo/text and an onboarding card.

### 1.2 Onboarding card

1. `browser_snapshot` — Find the "Set up Boltz Lab API key" button (or similar onboarding CTA).
2. **Verify:** The button is visible and clickable.
3. **Verify:** The sidebar shows a "New Campaign" button but no campaigns listed.

### 1.3 Navigate to Settings via onboarding

1. Click the API key onboarding button using its `ref`.
2. `browser_snapshot` — Verify the Settings page appeared.
3. **Verify:** Settings page shows section headings and navigation.
4. `browser_press_key` → `Escape` to return to workspace.
5. `browser_snapshot` — Verify we're back at the onboarding empty state.

---

## Phase 2: Settings

**Goal:** Configure the app — enter API key, verify settings controls work.

### 2.1 Open Settings via keyboard

1. `browser_press_key` → `Meta+,`
2. `browser_snapshot` — Verify Settings page opened with "General" heading visible.
3. `browser_take_screenshot` → `playwright/02-settings-general.png`

### 2.2 Verify navigation sections

1. **Verify in snapshot:** Four nav buttons visible: "General", "Appearance", "Workspace Directory", "API Key".

### 2.3 Navigate between sections

1. Click "Appearance" nav button.
2. `browser_snapshot` — Verify "Appearance" heading visible, "Theme" label visible.
3. Click "General" nav button.
4. `browser_snapshot` — Verify "Notifications" label visible.

### 2.4 Theme switcher

1. Click "Appearance" nav button.
2. `browser_snapshot` — Find Light/Dark/System buttons.
3. Click "Light" button.
4. `browser_evaluate` → `document.documentElement.classList.contains('dark')` — should be `false`.
5. Click "Dark" button.
6. `browser_evaluate` → `document.documentElement.classList.contains('dark')` — should be `true`.
7. `browser_take_screenshot` → `playwright/02-settings-dark-theme.png`
8. Click "System" to restore default.

### 2.5 Notifications toggle

1. Click "General" nav button.
2. `browser_snapshot` — Find the switch/toggle element.
3. Click the toggle.
4. `browser_snapshot` — Verify toggle state changed.

### 2.6 Enter and save API key

1. Click "API Key" nav button.
2. `browser_snapshot` — Find the API key input field (type="password" or placeholder containing "boltzpk").
3. Click the input field, then clear it and type the API key (from CLAUDE.md).
4. **Wait 5 seconds** for debounced validation to complete.
5. `browser_snapshot` — Verify "Save" button is now enabled (validation passed, green indicator visible).
6. Click "Save" button.
7. `browser_snapshot` — Verify "Saved" confirmation text appears.
8. `browser_take_screenshot` → `playwright/02-settings-api-key-saved.png`

### 2.7 Return to workspace

1. `browser_press_key` → `Escape`
2. `browser_snapshot` — Verify we're back at the workspace view. The onboarding card may still show if no campaigns exist yet.

---

## Phase 3: Campaign Creation

**Goal:** Create a protein+ligand campaign.

### 3.1 Open campaign form

1. `browser_snapshot` — Find "New Campaign" button in sidebar.
2. Click "New Campaign" button.
3. `browser_snapshot` — Verify "New Campaign" heading is visible.
4. `browser_take_screenshot` → `playwright/03-campaign-form-empty.png`

### 3.2 Verify form fields

1. **Verify in snapshot:** Form has:
   - Name input field
   - Target type selector (showing "Protein" by default)
   - Sequence textarea
   - Description textarea (optional)
   - Create button (should be disabled when empty)

### 3.3 Validate protein sequence

1. Find the sequence textarea and click it.
2. Type: `INVALID123!!!`
3. Click elsewhere to blur.
4. `browser_snapshot` — Verify an "invalid" error message appears.
5. Clear the textarea.

### 3.4 FASTA header stripping

1. Click the sequence textarea.
2. Type: `>sp|P01308|INS_HUMAN\nGIVEQCCTSICSLYQLENYCN`
   (Use `browser_fill_form` or `browser_type` — note the literal newline in the FASTA format.)
3. Click elsewhere to blur.
4. `browser_evaluate` → check the textarea value. It should contain `GIVEQCCTSICSLYQLENYCN` but NOT contain `>`.

### 3.5 Create button validation

1. Clear the name input field (if it has content).
2. `browser_snapshot` — Verify "Create" button is disabled.

### 3.6 Fill form and create campaign

1. Fill name input with: `E2E Test Campaign`
2. Fill sequence textarea with: `GIVEQCCTSICSLYQLENYCN`
3. `browser_snapshot` — Verify "Create" button is now enabled.
4. Click "Create" button.
5. **Wait 3 seconds** for campaign creation.
6. `browser_snapshot` — Verify redirected to workspace. "E2E Test Campaign" should appear in the sidebar.
7. `browser_take_screenshot` → `playwright/03-campaign-created.png`

---

## Phase 4: Campaign Detail

**Goal:** Verify campaign detail page shows correct information and is editable.

### 4.1 Open campaign detail

1. `browser_snapshot` — Find the campaign button row for "E2E Test Campaign" in the sidebar.
2. Find the gear/settings SVG icon within that campaign row (it has `cursor-pointer` class). Click it.
3. `browser_snapshot` — Verify campaign detail page opened.
4. `browser_take_screenshot` → `playwright/04-campaign-detail.png`

### 4.2 Verify displayed information

1. **Verify in snapshot:**
   - Campaign name "E2E Test Campaign" is displayed
   - Target sequence `GIVEQCCTSICSLYQLENYCN` is shown (monospace)
   - Target type "Protein" is shown (exact text)
   - Created date contains a year (e.g., "2026")

### 4.3 Edit description

1. Find the description textarea.
2. Click it and type: `Test description for e2e verification`
3. Click elsewhere to blur (saves on blur).
4. `browser_snapshot` — Verify the description text persisted.

### 4.4 Return to workspace

1. `browser_press_key` → `Escape`
2. `browser_snapshot` — Verify we're back at workspace. "New Campaign" button visible.

---

## Phase 5: Run Creation

**Goal:** Create a run with compound SMILES, test validation, and submit to the API.

### 5.1 Navigate to New Run form

1. `browser_snapshot` — Check if campaign is expanded in sidebar (look for "New Run" button).
2. If "New Run" is not visible, click the "E2E Test Campaign" button to expand it.
3. Click "New Run" button.
4. `browser_snapshot` — Verify the run creation form appeared.
5. `browser_take_screenshot` → `playwright/05-run-form-empty.png`

### 5.2 Verify form structure

1. **Verify in snapshot:**
   - Run name input (may have default like "Run 1")
   - Protein sequence displayed read-only (contains `GIVEQCC`)
   - Compounds section with Paste/CSV toggle
   - SMILES textarea
   - Advanced parameters section (collapsed)
   - Submit button (should be disabled — no compounds yet)

### 5.3 Verify submit disabled with no compounds

1. Find the "Submit" button. **Verify:** It is disabled.

### 5.4 Enter SMILES compounds

1. Find the SMILES textarea (the paste-mode input).
2. Click it and type:
   ```
   Aspirin,CC(=O)Oc1ccccc1C(=O)O
   Ethanol,CCO
   ```
3. **Wait 3 seconds** for the parser to process.
4. `browser_snapshot` — Verify a parsed compounds table appeared showing both "Aspirin" and "Ethanol" rows with their SMILES.
5. `browser_take_screenshot` → `playwright/05-run-compounds-parsed.png`

### 5.5 SMILES validation (invalid entry)

1. Find the SMILES textarea again.
2. Append a new line: `BadCompound,NOT_A_REAL_SMILES`
3. **Wait up to 60 seconds** for RDKit WASM to load and validate. Poll with `browser_snapshot` every 10 seconds.
4. **Verify:** A button or indicator showing "Invalid SMILES" (or similar) appears. The invalid compound should be highlighted.
5. `browser_take_screenshot` → `playwright/05-run-invalid-smiles.png`
6. Clear the textarea and re-enter only valid compounds:
   ```
   Aspirin,CC(=O)Oc1ccccc1C(=O)O
   Ethanol,CCO
   ```
7. **Wait 3 seconds** for validation to clear.

### 5.6 Advanced parameters

1. Find the "Advanced" toggle/section.
2. Click it to expand.
3. `browser_snapshot` — Verify parameter sliders/inputs are visible (recycling steps, diffusion samples, sampling steps, step scale).
4. `browser_take_screenshot` → `playwright/05-run-advanced-params.png`
5. Click the "Advanced" toggle again to collapse.

### 5.7 Submit run

1. Fill the run name input with: `E2E Test Run`
2. `browser_snapshot` — Verify "Submit" button is enabled.
3. Click "Submit" button.
4. **Wait up to 30 seconds** for submission to complete and redirect.
5. `browser_snapshot` — Verify redirected to workspace with results table visible. "E2E Test Run" should appear.
6. `browser_take_screenshot` → `playwright/05-run-submitted.png`

---

## Phase 6: Results Viewing

**Goal:** Verify the results table renders correctly, supports sorting and navigation, and polls for completion.

### 6.1 Results table structure

1. `browser_snapshot` — Verify the results table is visible.
2. **Verify in snapshot:**
   - Column headers: "Status", "Compound", "SMILES" (and metric columns)
   - Both compounds listed: "Aspirin" and "Ethanol"
   - Status badges visible (PENDING, CREATED, RUNNING, or COMPLETED)
3. `browser_take_screenshot` → `playwright/06-results-table.png`

### 6.2 Auto-selection and detail panel

1. **Verify in snapshot:** The first compound (Aspirin) should be auto-selected, and a detail panel should be open on the right side showing the compound name.

### 6.3 Column sorting

1. Find the "Compound" column header.
2. Click it once (sort ascending).
3. `browser_snapshot` — Verify no errors, table re-rendered.
4. Click it again (sort descending).
5. `browser_snapshot` — Verify no errors.

### 6.4 Arrow key navigation

1. `browser_press_key` → `ArrowDown`
2. `browser_snapshot` — Verify the second compound is now selected (detail panel header changed).
3. `browser_press_key` → `ArrowUp`
4. `browser_snapshot` — Verify back to first compound.

### 6.5 Run name in header

1. **Verify in snapshot:** "E2E Test Run" text is visible in the results area header.

### 6.6 Protein campaign columns

1. **Verify in snapshot:** Columns include "Binding" (or "Binding Confidence") and "Optimization" (or "Optimization Score") — these are protein+ligand specific metrics.

### 6.7 Poll for completion (up to 5 minutes)

1. **This is the longest step.** Poll every 30 seconds:
   - `browser_snapshot` — Look for "COMPLETED" status text.
   - If found, proceed to next step.
   - If not found after 5 minutes (10 polls), take a screenshot and note the current status.
2. `browser_take_screenshot` → `playwright/06-results-completed.png`

### 6.8 Metrics for completed compounds

1. `browser_snapshot` — After at least one compound reaches COMPLETED:
   - **Verify:** Metric columns show numeric values (e.g., `0.XX` format) instead of dashes.
   - **Verify:** "Binding" and "Optimization" columns have values for completed compounds.
2. `browser_take_screenshot` → `playwright/06-results-metrics.png`

---

## Phase 7: Compound Detail

**Goal:** Verify the compound detail panel — 3D viewer, metrics cards, 2D structure.

### 7.1 Detail panel header

1. Click the first compound row (Aspirin) if not already selected.
2. `browser_snapshot` — Verify the detail panel shows "Aspirin" in the header.

### 7.2 3D Mol* viewer

1. `browser_snapshot` — Look for a `<canvas>` element (Mol* renders into canvas).
2. `browser_evaluate` → Check canvas dimensions:
   ```js
   const canvas = document.querySelector('canvas');
   canvas ? { width: canvas.offsetWidth, height: canvas.offsetHeight } : null
   ```
3. **Verify:** Canvas exists and has dimensions > 50x50 (not a zero-size placeholder).
4. `browser_take_screenshot` → `playwright/07-compound-3d-viewer.png`
5. **VISUAL CHECK:** Inspect the screenshot. The Mol* 3D viewer should show a rendered molecular structure (not blank, not broken, not just a loading spinner).

### 7.3 Metric cards

1. `browser_snapshot` — Look for metric card elements.
2. **Verify all 6 metrics for protein target:**
   - Structure Confidence (or similar)
   - Complex pLDDT
   - ipTM
   - pTM
   - Binding (Confidence)
   - Optimization (Score)
3. **Verify:** Cards show numeric values for completed compounds.
4. `browser_take_screenshot` → `playwright/07-compound-metrics.png`

### 7.4 2D RDKit molecule image

1. `browser_snapshot` — Look for an SVG element or image element rendering the 2D molecular structure.
2. **Verify:** At least one molecule visualization element (SVG with paths, or an `<img>` tag) is present.
3. `browser_take_screenshot` → `playwright/07-compound-2d-structure.png`

### 7.5 Fullscreen toggle

1. Find buttons near the 3D viewer canvas (in the viewer's parent container).
2. If a maximize/fullscreen button exists, click it.
3. **Wait 500ms.**
4. `browser_take_screenshot` → `playwright/07-compound-fullscreen.png`
5. `browser_press_key` → `Escape` to exit fullscreen.
6. **Wait 500ms.**

### 7.6 Close detail panel

1. Look for a close button (X icon) in the detail panel header — try `getByRole('button', { name: /close/i })`.
2. If visible, click it. Otherwise, press `Escape`.
3. `browser_snapshot` — Verify the detail panel closed (compound is deselected).

---

## Phase 8: Sidebar

**Goal:** Verify sidebar structure, expand/collapse, and navigation elements.

### 8.1 Campaign in sidebar

1. `browser_snapshot` — Verify "E2E Test Campaign" is listed in the sidebar.

### 8.2 Expand/collapse

1. Find the campaign button. If the run is not visible, click to expand.
2. `browser_snapshot` — Verify "E2E Test Run" is visible under the campaign.
3. Click the campaign button to collapse.
4. **Wait 300ms.**
5. `browser_snapshot` — Verify the run text is no longer visible.
6. Click the campaign button to expand again.
7. **Wait 300ms.**
8. `browser_snapshot` — Verify "E2E Test Run" is visible again.

### 8.3 Navigation elements

1. **Verify in snapshot:**
   - "New Run" button visible under expanded campaign
   - "New Campaign" button visible at top of sidebar

---

## Phase 9: Keyboard Shortcuts

**Goal:** Verify all keyboard shortcuts work correctly.

### 9.1 Cmd+B — Toggle sidebar

1. `browser_snapshot` — Verify sidebar is visible ("New Campaign" button present).
2. `browser_press_key` → `Meta+b`
3. **Wait 500ms.**
4. `browser_snapshot` — Verify sidebar is hidden ("New Campaign" button NOT visible).
5. `browser_press_key` → `Meta+b`
6. **Wait 500ms.**
7. `browser_snapshot` — Verify sidebar is visible again.

### 9.2 Cmd+, — Open Settings

1. `browser_press_key` → `Meta+,`
2. `browser_snapshot` — Verify Settings page opened ("General" heading visible).

### 9.3 Escape — Close Settings

1. `browser_press_key` → `Escape`
2. `browser_snapshot` — Verify returned to workspace.

### 9.4 Cmd+Shift+N — New Run

1. `browser_press_key` → `Meta+Shift+n`
2. **Wait 1 second.**
3. `browser_snapshot` — Verify the New Run form opened (look for Submit button or sequence display).
4. `browser_press_key` → `Escape` to return.

### 9.5 Escape — Deselect compound

1. Click first compound in results table to select it.
2. `browser_snapshot` — Verify detail panel is open.
3. `browser_press_key` → `Escape`
4. `browser_snapshot` — Verify detail panel closed / compound deselected.

---

## Phase 10: Layout

**Goal:** Verify the three-panel layout structure.

### 10.1 Default layout

1. `browser_take_screenshot` → `playwright/10-layout-default.png`
2. **Verify in snapshot:** Sidebar on left, main content in center, detail panel on right (when compound selected).

### 10.2 Sidebar toggle preserves layout

1. `browser_press_key` → `Meta+b` (hide sidebar)
2. **Wait 500ms.**
3. `browser_take_screenshot` → `playwright/10-layout-no-sidebar.png`
4. **Verify:** Main content expanded to fill the sidebar's space.
5. `browser_press_key` → `Meta+b` (show sidebar)
6. **Wait 500ms.**

---

## Phase 11: Workspace Directory

**Goal:** Verify workspace directory display and controls in Settings.

### 11.1 View workspace directory

1. `browser_press_key` → `Meta+,` to open Settings.
2. Click "Workspace Directory" nav button.
3. `browser_snapshot` — Verify current directory path is displayed (in a `<code>` or `<pre>` element).
4. `browser_take_screenshot` → `playwright/11-workspace-dir.png`

### 11.2 Choose Folder button exists

1. **Verify in snapshot:** A "Choose Folder" button is visible and clickable.
2. **Note:** Clicking "Choose Folder" opens a native OS file dialog which Playwright MCP cannot automate. This is a manual checkpoint — inform the user if they want to test directory switching interactively.

### 11.3 Return to workspace

1. `browser_press_key` → `Escape`

---

## Phase 12: CSV Export

**Goal:** Verify the export button exists and is functional.

### 12.1 Navigate to results

1. `browser_snapshot` — Find the run in sidebar and click it to show results table.
2. **Verify:** Results table is visible.

### 12.2 Export button

1. `browser_snapshot` — Look for an export/download button (SVG icon button) in the results table header area.
2. **Verify:** The button exists and is clickable.
3. `browser_take_screenshot` → `playwright/12-csv-export.png`
4. **Note:** Clicking the export button opens a native OS save dialog which Playwright MCP cannot automate. Inform the user if they want to manually test the CSV export.

---

## Phase 13: Visual Regression Screenshots

**Goal:** Capture a comprehensive set of screenshots for visual review.

Take all of the following in sequence. These serve as the visual baseline:

1. `playwright/final-01-workspace-overview.png` — Main workspace with sidebar, results table, detail panel
2. `playwright/final-02-sidebar-expanded.png` — Sidebar with campaign expanded, run visible
3. `playwright/final-03-compound-detail.png` — Detail panel for a completed compound (3D viewer + metrics)
4. `playwright/final-04-settings-general.png` — Settings > General
5. `playwright/final-05-settings-appearance.png` — Settings > Appearance
6. `playwright/final-06-settings-workspace.png` — Settings > Workspace Directory
7. `playwright/final-07-settings-apikey.png` — Settings > API Key
8. `playwright/final-08-dark-theme.png` — Full workspace in dark theme
9. `playwright/final-09-light-theme.png` — Full workspace in light theme

---

## Teardown

Always stop the production binary when done:

```bash
bash scripts/prod-test-stop.sh
```

---

## Quick Reference: Common Patterns

### Ensuring workspace view
Press `Escape` up to 3 times to dismiss any overlays, settings pages, or detail panels.

### Waiting for async operations
- **API key validation:** 5 seconds after typing
- **RDKit WASM loading:** up to 60 seconds on first use
- **Run submission:** up to 30 seconds
- **Run completion polling:** up to 5 minutes, check every 30 seconds
- **Campaign creation:** 3 seconds

### Handling unknown expand/collapse state
Before asserting a run is visible under a campaign, first check if it's visible. If not, click the campaign button to expand it, wait 300ms, then check again.

### Strict mode gotchas
Many text labels appear in multiple places (e.g., compound name in both table cell and detail header). When looking for specific elements, use the accessibility tree from `browser_snapshot` to identify the exact `ref` rather than searching by text alone.
