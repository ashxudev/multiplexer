import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { app } from 'electron';

interface Prefs {
  root_dir: string;
  analytics_enabled?: boolean;
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
  const existing = readPrefs();
  const prefs: Prefs = { ...existing, root_dir: rootDir };
  writePrefs(prefs);
}

export function readAnalyticsEnabled(): boolean {
  return readPrefs().analytics_enabled ?? true;
}

export function writeAnalyticsEnabled(enabled: boolean): void {
  const existing = readPrefs();
  writePrefs({ ...existing, analytics_enabled: enabled });
}

function readPrefs(): Prefs {
  const p = prefsPath();
  if (!fs.existsSync(p)) return { root_dir: defaultRootDir() };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return { root_dir: defaultRootDir() };
  }
}

function writePrefs(prefs: Prefs): void {
  const p = prefsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(prefs, null, 2), 'utf-8');
}
