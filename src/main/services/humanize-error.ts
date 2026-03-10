import { BoltzApiError } from './boltz-client';

/**
 * Extract the API's `message` field from a BoltzApiError message string.
 *
 * BoltzApiError messages have format: "Submit failed (400): {"message":"...","code":"..."}"
 * This function finds the JSON body and returns the `message` field if present.
 * Falls back to stripping the "Submit failed (NNN): " prefix.
 */
function extractApiMessage(errMsg: string): string | null {
  // Try to parse JSON body from the error message
  const braceIndex = errMsg.indexOf('{');
  if (braceIndex !== -1) {
    try {
      const json = JSON.parse(errMsg.slice(braceIndex));
      if (typeof json.message === 'string' && json.message.length > 0) {
        return json.message;
      }
    } catch {
      // Not valid JSON — fall through
    }
  }

  // Strip "Submit failed (NNN): " or "Status check failed (NNN): " prefix
  const prefixMatch = errMsg.match(/^.+?\(\d+\):\s*/);
  if (prefixMatch) {
    const body = errMsg.slice(prefixMatch[0].length).trim();
    if (body.length > 0) return body;
  }

  return null;
}

/**
 * Convert a raw caught error into a user-friendly message for display.
 *
 * - For BoltzApiError: uses statusCode + extracts the API's own message
 * - For other errors: passes through unchanged
 */
export function humanizeError(err: unknown): string {
  if (!(err instanceof BoltzApiError)) {
    return err instanceof Error ? err.message : String(err);
  }

  const { statusCode, message } = err;

  // Fixed messages for auth and rate-limit errors
  if (statusCode === 401) return 'API key is invalid or expired. Check Settings.';
  if (statusCode === 403) return 'API key does not have permission. Check Settings.';
  if (statusCode === 429) return 'Rate limited — the request will be retried automatically.';

  // Server errors
  if (statusCode !== null && statusCode >= 500) {
    return 'Boltz server error — try again in a few minutes.';
  }

  // Client errors (400, 404, etc.) — extract the API's message
  if (statusCode !== null) {
    const apiMsg = extractApiMessage(message);
    if (apiMsg) return apiMsg;

    if (statusCode === 404) return 'Prediction not found — it may have expired.';
    if (statusCode === 400) return 'Invalid request — check your inputs.';

    return `Request failed (HTTP ${statusCode}). Try again or contact support.`;
  }

  // Null statusCode = network-level failure
  return 'Could not reach the Boltz API. Check your connection.';
}
