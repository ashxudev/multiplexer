import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import * as tar from 'tar';
import type { CompoundRef, CompoundFilesReadyEvent } from '../models/types';
import type { AppServices } from './index';
import type { BoltzClient } from './boltz-client';
import { resolveCompoundPath } from './storage';

// ── Extraction ───────────────────────────────────────────────────────

/**
 * Extract tar.gz buffer to tempDir.
 * - Strips top-level directory from entries
 * - Zip-slip protection (reject ".." components)
 * - Renames: _predicted_structure. -> _structure., _pae_visualization. -> _pae.
 */
export async function extractTarGz(bytes: Buffer, tempDir: string): Promise<void> {
  fs.mkdirSync(tempDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const extractor = new tar.Parser({
      onReadEntry(entry: tar.ReadEntry) {
        const entryPath = entry.path;
        const components = entryPath.split('/').filter((c: string) => c !== '');

        // Strip top-level directory (e.g., "prediction_abc123/")
        if (components.length <= 1) {
          entry.resume();
          return;
        }

        const relativeComponents = components.slice(1);

        // Zip-slip protection: reject entries with ".." components
        if (relativeComponents.some((c: string) => c === '..')) {
          entry.resume();
          reject(
            new Error(`Path traversal detected in archive entry: ${relativeComponents.join('/')}`),
          );
          return;
        }

        // Rename per convention
        let filename = relativeComponents.join('/');
        filename = filename.replace(/_predicted_structure\./g, '_structure.');
        filename = filename.replace(/_pae_visualization\./g, '_pae.');

        const dest = path.join(tempDir, filename);
        const parentDir = path.dirname(dest);
        fs.mkdirSync(parentDir, { recursive: true });

        // If this is a directory entry, just create it
        if (entry.type === 'Directory') {
          fs.mkdirSync(dest, { recursive: true });
          entry.resume();
          return;
        }

        // Collect file content and write
        const chunks: Buffer[] = [];
        entry.on('data', (chunk: Buffer) => chunks.push(chunk));
        entry.on('end', () => {
          const content = Buffer.concat(chunks);
          fs.writeFileSync(dest, content);
        });
      },
    });

    extractor.on('end', resolve);
    extractor.on('error', reject);

    // Pipe the gzipped buffer through the tar parser
    const readable = Readable.from(bytes);
    const gunzip = zlib.createGunzip();

    readable.pipe(gunzip).pipe(extractor);
    gunzip.on('error', reject);
  });
}

// ── Validation ───────────────────────────────────────────────────────

/**
 * Check that metrics.json and sample_0_structure.cif exist after extraction.
 */
export function validateExtraction(tempDir: string): void {
  const required = ['metrics.json', 'sample_0_structure.cif'];
  for (const file of required) {
    const filePath = path.join(tempDir, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Expected file missing after extraction: ${file}`);
    }
  }
}

// ── Download + Extract + Store ───────────────────────────────────────

/**
 * Set download_error on a compound without changing its status.
 * The compound stays Completed so scanIncompleteDownloads can recover it.
 */
function setDownloadError(services: AppServices, compoundId: string, errorMsg: string): void {
  const compound = services.state.findCompound(compoundId);
  if (compound) {
    compound.download_error = errorMsg;
    services.state.markDirty();
  }
}

/**
 * Full download + extract + move flow:
 * 1. Download tar.gz
 * 2. Extract to .boltz-temp/{compoundId}/
 * 3. Validate
 * 4. Resolve compound path
 * 5. Move from temp to final (atomic rename)
 * 6. Emit 'compound-files-ready' event
 */
export async function downloadAndStore(
  services: AppServices,
  client: BoltzClient,
  downloadUrl: string,
  compoundRef: CompoundRef,
): Promise<void> {
  const rootDir = services.state.rootDir;

  // 1. Download tar.gz
  let bytes: Buffer;
  try {
    bytes = await client.downloadTarGz(downloadUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to download compound ${compoundRef.compound_id}: ${msg}`);
    setDownloadError(services, compoundRef.compound_id, `Download failed: ${msg}`);
    return;
  }

  // 2. Extract to .boltz-temp/{compoundId}/
  const tempDir = path.join(rootDir, '.boltz-temp', compoundRef.compound_id);

  try {
    await extractTarGz(bytes, tempDir);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to extract compound ${compoundRef.compound_id}: ${msg}`);
    setDownloadError(services, compoundRef.compound_id, `Extraction failed: ${msg}`);
    return;
  }

  // 3. Validate extraction
  try {
    validateExtraction(tempDir);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Extraction validation failed for ${compoundRef.compound_id}: ${msg}`);
    fs.rmSync(tempDir, { recursive: true, force: true });
    setDownloadError(services, compoundRef.compound_id, `Extraction validation failed: ${msg}`);
    return;
  }

  // 4. Resolve compound path
  let dest: string;
  try {
    dest = resolveCompoundPath(services.state, compoundRef.compound_id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to resolve path for ${compoundRef.compound_id}: ${msg}`);
    setDownloadError(
      services,
      compoundRef.compound_id,
      `Failed to resolve output path: ${msg}`,
    );
    return;
  }

  // Create parent directories
  const parentDir = path.dirname(dest);
  fs.mkdirSync(parentDir, { recursive: true });

  // 5. Move from temp to final (atomic rename on same volume)
  try {
    // Remove existing destination if present (allows re-download)
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.renameSync(tempDir, dest);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `Failed to move compound files from ${tempDir} to ${dest}: ${msg}`,
    );
    setDownloadError(services, compoundRef.compound_id, 'Failed to store compound files on disk');
    return;
  }

  // Success -- clear any previous download error
  const compound = services.state.findCompound(compoundRef.compound_id);
  if (compound) {
    compound.download_error = null;
    services.state.markDirty();
  }

  console.log(`Compound ${compoundRef.compound_id} files stored at ${dest}`);

  // 6. Emit 'compound-files-ready' event
  const event: CompoundFilesReadyEvent = {
    compound_id: compoundRef.compound_id,
    run_id: compoundRef.run_id,
  };
  services.eventBus.emit('compound-files-ready', event);
}
