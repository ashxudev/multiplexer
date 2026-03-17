import * as Sentry from '@sentry/electron/main';
import { initialize, trackEvent as aptaTrack } from '@aptabase/electron/main';
import { app } from 'electron';
import { readAnalyticsEnabled } from './prefs';

let enabled = false;

export function initTelemetry(): void {
  enabled = readAnalyticsEnabled();

  // Always init Sentry so it can be toggled on/off at runtime via beforeSend.
  // DSN and app key are public identifiers (not secrets).
  // MAIN_VITE_* vars are replaced at build time by electron-vite.
  Sentry.init({
    dsn: import.meta.env.MAIN_VITE_SENTRY_DSN || '',
    release: app.getVersion(),
    beforeSend(event) {
      if (!enabled) return null;
      return scrubEvent(event);
    },
    maxValueLength: 250,
  });

  if (enabled) {
    const aptabaseKey = import.meta.env.MAIN_VITE_APTABASE_APP_KEY || '';
    if (aptabaseKey) {
      initialize(aptabaseKey);
    }
  }
}

export function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): void {
  if (!enabled) return;
  aptaTrack(name, props);
}

export function setTelemetryEnabled(value: boolean): void {
  enabled = value;
}

function scrubEvent(event: Sentry.Event): Sentry.Event | null {
  // Strip auth-related headers
  if (event.request?.headers) {
    for (const key of Object.keys(event.request.headers)) {
      const lower = key.toLowerCase();
      if (
        lower === 'authorization' ||
        lower.includes('key') ||
        lower.includes('token')
      ) {
        event.request.headers[key] = '[REDACTED]';
      }
    }
    // Never send request/response bodies (may contain molecular data)
    delete event.request.data;
  }

  // Scrub macOS usernames from file paths
  const json = JSON.stringify(event);
  const scrubbed = json.replace(/\/Users\/[^/]+\//g, '~/');
  return JSON.parse(scrubbed);
}
