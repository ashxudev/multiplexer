import fs from 'node:fs';
import path from 'node:path';
import type { AppData, CompoundRef } from '../models/types';
import { AppState } from '../models/state';
import { FLUSH_INTERVAL_MS } from '../models/types';

// ── Load / Persist ──────────────────────────────────────────────────

/** Load state from {rootDir}/state.json, creating defaults if missing. */
export function loadState(rootDir: string): AppState {
  fs.mkdirSync(rootDir, { recursive: true });

  const statePath = path.join(rootDir, 'state.json');
  const backupPath = path.join(rootDir, 'state.json.bak');

  if (!fs.existsSync(statePath)) {
    return new AppState(AppState.defaultData(), rootDir);
  }

  const raw = fs.readFileSync(statePath, 'utf-8');
  const data: AppData = JSON.parse(raw);

  if (data.schema_version > 1) {
    throw new Error(
      `Unsupported state schema version: ${data.schema_version}. Please update Multiplexer.`,
    );
  }

  // Create backup for crash recovery
  try {
    fs.copyFileSync(statePath, backupPath);
  } catch {
    // Non-fatal — backup creation is best-effort
  }

  return new AppState(data, rootDir);
}

/**
 * Atomic write: serialize → .state.json.tmp → rename.
 * Crash-safe on APFS (same-volume rename is atomic).
 */
export function persistState(rootDir: string, data: AppData): void {
  const statePath = path.join(rootDir, 'state.json');
  const tmpPath = path.join(rootDir, '.state.json.tmp');

  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpPath, json, 'utf-8');
  fs.renameSync(tmpPath, statePath);
}

// ── Dirty-Flag Flusher ──────────────────────────────────────────────

/**
 * Start a 2-second interval that persists state when dirty.
 * Returns a cleanup function to stop the flusher.
 */
export function startPersistenceFlusher(state: AppState): () => void {
  const timer = setInterval(() => {
    if (!state.dirty) return;

    // Clone data, reset flag, then persist (I/O outside the "lock")
    const dataClone = structuredClone(state.data);
    state.dirty = false;
    persistState(state.rootDir, dataClone);
  }, FLUSH_INTERVAL_MS);

  return () => clearInterval(timer);
}

// ── Folder Operations ───────────────────────────────────────────────

export function createCampaignFolder(
  rootDir: string,
  folderName: string,
): void {
  validateFolderName(folderName);
  const dir = path.join(rootDir, folderName);
  fs.mkdirSync(dir, { recursive: true });
}

export function createRunFolder(
  rootDir: string,
  campaignFolder: string,
  runFolder: string,
): void {
  validateFolderName(campaignFolder);
  validateFolderName(runFolder);
  const dir = path.join(rootDir, campaignFolder, runFolder);
  fs.mkdirSync(dir, { recursive: true });
}

export function createCompoundFolder(
  rootDir: string,
  campaignFolder: string,
  runFolder: string,
  compoundFolder: string,
): void {
  validateFolderName(campaignFolder);
  validateFolderName(runFolder);
  validateFolderName(compoundFolder);
  const dir = path.join(rootDir, campaignFolder, runFolder, compoundFolder);
  fs.mkdirSync(dir, { recursive: true });
}

export function renameFolder(oldPath: string, newPath: string): void {
  fs.renameSync(oldPath, newPath);
}

export function cleanupTempDir(rootDir: string): void {
  const tempDir = path.join(rootDir, '.boltz-temp');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// ── Path Resolution ─────────────────────────────────────────────────

export function resolveCompoundPath(
  state: AppState,
  compoundId: string,
): string {
  const ctx = state.findCompoundContext(compoundId);
  if (!ctx) throw new Error(`Compound not found: ${compoundId}`);
  const [campaign, run, compound] = ctx;
  return path.join(
    state.rootDir,
    campaign.folder_name,
    run.folder_name,
    compound.folder_name,
  );
}

// ── Validation ──────────────────────────────────────────────────────

function validateFolderName(name: string): void {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid folder name: "${name}"`);
  }
}

/**
 * Sanitise user-provided name into filesystem-safe folder name.
 * - Converts to lowercase
 * - Replaces non-alphanumeric chars with '-'
 * - Trims trailing '-'
 * - Truncates to ~200 bytes (UTF-8 safe)
 * - Returns "unnamed" if empty
 */
export function sanitiseFolderName(name: string): string {
  let result = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+$/, '')
    .replace(/^-+/, '');

  // Truncate to ~200 chars
  if (result.length > 200) {
    result = result.slice(0, 200).replace(/-+$/, '');
  }

  return result || 'unnamed';
}

/**
 * Generate a unique folder name by appending -2, -3, etc. on collision.
 */
export function uniqueFolderName(
  baseName: string,
  existingNames: string[],
): string {
  const existing = new Set(existingNames);
  if (!existing.has(baseName)) return baseName;

  let counter = 2;
  while (existing.has(`${baseName}-${counter}`)) {
    counter++;
  }
  return `${baseName}-${counter}`;
}

// ── Download Recovery ───────────────────────────────────────────────

/**
 * Find COMPLETED compounds missing their CIF files on disk.
 * Used on startup before poller begins.
 */
export function scanIncompleteDownloads(
  rootDir: string,
  data: AppData,
): CompoundRef[] {
  const incomplete: CompoundRef[] = [];

  for (const campaign of data.campaigns) {
    for (const run of campaign.runs) {
      for (const compound of run.compounds) {
        if (compound.status !== 'COMPLETED') continue;
        if (!compound.boltz_job_id || !compound.submitted_at) continue;

        const cifPath = path.join(
          rootDir,
          campaign.folder_name,
          run.folder_name,
          compound.folder_name,
          'sample_0_structure.cif',
        );

        if (!fs.existsSync(cifPath)) {
          incomplete.push({
            compound_id: compound.id,
            boltz_job_id: compound.boltz_job_id,
            campaign_id: campaign.id,
            run_id: run.id,
            submitted_at: compound.submitted_at,
          });
        }
      }
    }
  }

  return incomplete;
}
