import { EventEmitter } from 'node:events';
import { app } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;

// ── Types (shared via `import type` by renderer) ───────────────────────

export const AUTO_UPDATE_STATUS = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  READY: 'ready',
  ERROR: 'error',
} as const;

export type AutoUpdateStatus = (typeof AUTO_UPDATE_STATUS)[keyof typeof AUTO_UPDATE_STATUS];

export interface AutoUpdateStatusEvent {
  status: AutoUpdateStatus;
  version?: string;
  error?: string;
}

// ── Module state ────────────────────────────────────────────────────────

const UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 * 4; // 4 hours

// Direct import: auto-updater is decoupled from AppServices lifecycle
export const autoUpdateEmitter = new EventEmitter();

// Network errors that don't need to be shown to the user —
// transient/expected and will resolve on the next check cycle.
const SILENT_ERROR_PATTERNS = [
  'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_CONNECTION_RESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'ECONNRESET',
];

function isNetworkError(error: Error | string): boolean {
  const message = typeof error === 'string' ? error : error.message;
  return SILENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

let currentStatus: AutoUpdateStatus = AUTO_UPDATE_STATUS.IDLE;
let currentVersion: string | undefined;
let isDismissed = false;

function emitStatus(status: AutoUpdateStatus, version?: string, error?: string): void {
  currentStatus = status;
  currentVersion = version;

  if (isDismissed && status === AUTO_UPDATE_STATUS.READY) {
    return;
  }

  autoUpdateEmitter.emit('status-changed', { status, version, error } satisfies AutoUpdateStatusEvent);
}

// ── Public API (used by tRPC router) ────────────────────────────────────

export function getUpdateStatus(): AutoUpdateStatusEvent {
  if (isDismissed && currentStatus === AUTO_UPDATE_STATUS.READY) {
    return { status: AUTO_UPDATE_STATUS.IDLE };
  }
  return { status: currentStatus, version: currentVersion };
}

export function checkForUpdates(): void {
  if (!app.isPackaged) return;

  isDismissed = false;
  emitStatus(AUTO_UPDATE_STATUS.CHECKING);
  autoUpdater.checkForUpdates().catch((error) => {
    if (isNetworkError(error)) {
      console.info('[auto-updater] Network unavailable, will retry later');
      emitStatus(AUTO_UPDATE_STATUS.IDLE);
      return;
    }
    console.error('[auto-updater] Failed to check for updates:', error);
    emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
  });
}

export function installUpdate(): void {
  if (!app.isPackaged) {
    console.info('[auto-updater] Install skipped in dev mode');
    emitStatus(AUTO_UPDATE_STATUS.IDLE);
    return;
  }
  if (currentStatus !== AUTO_UPDATE_STATUS.READY) {
    console.warn('[auto-updater] Install ignored — no downloaded update (status=%s)', currentStatus);
    return;
  }
  autoUpdater.quitAndInstall(false, true);
}

export function dismissUpdate(): void {
  isDismissed = true;
  autoUpdateEmitter.emit('status-changed', {
    status: AUTO_UPDATE_STATUS.IDLE,
  } satisfies AutoUpdateStatusEvent);
}

// ── Setup (called once from index.ts) ───────────────────────────────────

export function setupAutoUpdater(): (() => void) | null {
  if (!app.isPackaged) {
    return null;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = true;

  // No setFeedURL() — provider: github in electron-builder.yml bakes the
  // correct feed URL into app-update.yml at build time. This also enables
  // automatic code signature verification on macOS.

  console.info(
    `[auto-updater] Initialized: version=${app.getVersion()}`,
  );

  autoUpdater.on('error', (error) => {
    if (isNetworkError(error)) {
      console.info('[auto-updater] Network unavailable, will retry later');
      emitStatus(AUTO_UPDATE_STATUS.IDLE);
      return;
    }
    console.error(
      `[auto-updater] Error (currentVersion=${app.getVersion()}):`,
      error?.message || error,
    );
    emitStatus(AUTO_UPDATE_STATUS.ERROR, undefined, error.message);
  });

  autoUpdater.on('checking-for-update', () => {
    console.info(`[auto-updater] Checking for updates... (currentVersion=${app.getVersion()})`);
    emitStatus(AUTO_UPDATE_STATUS.CHECKING);
  });

  autoUpdater.on('update-available', (info) => {
    console.info(`[auto-updater] Update available: ${app.getVersion()} → ${info.version}`);
    emitStatus(AUTO_UPDATE_STATUS.DOWNLOADING, info.version);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.info(`[auto-updater] No updates (currentVersion=${app.getVersion()}, latest=${info.version})`);
    emitStatus(AUTO_UPDATE_STATUS.IDLE);
  });

  autoUpdater.on('download-progress', (progress) => {
    console.info(`[auto-updater] Download: ${progress.percent.toFixed(1)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.info(`[auto-updater] Downloaded: ${app.getVersion()} → ${info.version}. Ready to install.`);
    emitStatus(AUTO_UPDATE_STATUS.READY, info.version);
  });

  // Check on launch + every 4 hours
  const interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
  interval.unref();
  void checkForUpdates();

  return () => {
    clearInterval(interval);
  };
}
