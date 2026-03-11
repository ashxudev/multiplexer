import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';

interface Prefs {
  root_dir: string;
}

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'prefs.json');
}

export function defaultRootDir(): string {
  return path.join(os.homedir(), 'multiplexer');
}

export function readRootDir(): string {
  if (process.env.MULTIPLEXER_ROOT_DIR) return process.env.MULTIPLEXER_ROOT_DIR;
  const p = prefsPath();
  if (!fs.existsSync(p)) {
    return defaultRootDir();
  }
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const prefs: Prefs = JSON.parse(raw);
    return prefs.root_dir || defaultRootDir();
  } catch {
    return defaultRootDir();
  }
}

export function writeRootDir(rootDir: string): void {
  const p = prefsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const prefs: Prefs = { root_dir: rootDir };
  fs.writeFileSync(p, JSON.stringify(prefs, null, 2), 'utf-8');
}
