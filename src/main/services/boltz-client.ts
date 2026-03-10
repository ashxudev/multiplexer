import { v4 as uuidv4 } from 'uuid';
import type {
  CompoundMetrics,
  AffinityMetrics,
  SampleMetrics,
  SubmitResponse,
  PredictionStatus,
  RunParams,
  TargetType,
} from '../models/types';
import {
  BOLTZ_BASE_URL,
  HTTP_TIMEOUT_MS,
  RETRY_ATTEMPTS,
  RETRY_ATTEMPTS_RATE_LIMIT,
  RETRY_BACKOFF_MS,
  RETRY_JITTER_MS,
  RATE_LIMIT_FALLBACK_MS,
} from '../models/types';

// ── Error helpers ────────────────────────────────────────────────────

export class BoltzApiError extends Error {
  readonly statusCode: number | null;
  readonly retryAfterMs: number | null;

  constructor(message: string, statusCode: number | null = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'BoltzApiError';
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}

function isPermanentError(err: unknown): boolean {
  if (err instanceof BoltzApiError && err.statusCode !== null) {
    const code = err.statusCode;
    // 4xx except 429 are permanent
    return code >= 400 && code < 500 && code !== 429;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return Math.ceil(seconds) * 1000;
  }
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return null;
}

export interface RetryOptions {
  onRateLimited?: (delayMs: number) => void;
}

// ── BoltzClient ──────────────────────────────────────────────────────

export class BoltzClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = BOLTZ_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // ── Retry wrapper ────────────────────────────────────────────────

  /**
   * Retry transient errors (429, 5xx, network) with adaptive backoff.
   * 429 responses use Retry-After header delay and up to 6 attempts.
   * Other transient errors use fixed backoff and up to 3 attempts.
   * Permanent errors (400, 401, 422) fail immediately.
   */
  private async withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T> {
    let lastErr: unknown = new Error('No attempts made');
    let maxAttempts = RETRY_ATTEMPTS;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        if (lastErr instanceof BoltzApiError && lastErr.statusCode === 429) {
          const delay = lastErr.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS;
          const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
          await sleep(delay + jitter);
        } else {
          const base = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)];
          const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
          await sleep(base + jitter);
        }
      }

      try {
        return await fn();
      } catch (err) {
        if (isPermanentError(err)) {
          throw err;
        }
        if (err instanceof BoltzApiError && err.statusCode === 429) {
          maxAttempts = RETRY_ATTEMPTS_RATE_LIMIT;
          const delay = err.retryAfterMs ?? RATE_LIMIT_FALLBACK_MS;
          opts?.onRateLimited?.(delay);
        }
        console.warn(`Transient error (attempt ${attempt + 1}/${maxAttempts}):`, err);
        lastErr = err;
      }
    }

    throw lastErr;
  }

  // ── API methods ──────────────────────────────────────────────────

  /**
   * POST /api/v1/connect/predictions/boltz2
   */
  async submitPrediction(
    apiKey: string,
    inferenceInput: unknown,
    inferenceOptions: unknown,
    retryOpts?: RetryOptions,
  ): Promise<SubmitResponse> {
    const url = `${this.baseUrl}/api/v1/connect/predictions/boltz2`;

    return this.withRetry(async () => {
      const body = {
        prediction_name: uuidv4(),
        prediction_inputs: {
          inference_input: inferenceInput,
          inference_options: inferenceOptions,
        },
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const retryAfterMs = resp.status === 429
          ? parseRetryAfter(resp.headers.get('retry-after'))
          : null;
        throw new BoltzApiError(`Submit failed (${resp.status}): ${text}`, resp.status, retryAfterMs);
      }

      return (await resp.json()) as SubmitResponse;
    }, retryOpts);
  }

  /**
   * GET /api/v1/connect/predictions/{predictionId}
   */
  async getPredictionStatus(
    apiKey: string,
    predictionId: string,
    retryOpts?: RetryOptions,
  ): Promise<PredictionStatus> {
    const url = `${this.baseUrl}/api/v1/connect/predictions/${encodeURIComponent(predictionId)}`;

    return this.withRetry(async () => {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (!resp.ok) {
        if (resp.status === 404) {
          throw new BoltzApiError(
            `Prediction ${predictionId} not found`,
            404,
          );
        }
        const text = await resp.text().catch(() => '');
        const retryAfterMs = resp.status === 429
          ? parseRetryAfter(resp.headers.get('retry-after'))
          : null;
        throw new BoltzApiError(
          `Status check failed (${resp.status}): ${text}`,
          resp.status,
          retryAfterMs,
        );
      }

      return (await resp.json()) as PredictionStatus;
    }, retryOpts);
  }

  /**
   * GET {downloadUrl} (presigned, no auth) -- returns Buffer
   */
  async downloadTarGz(downloadUrl: string, retryOpts?: RetryOptions): Promise<Buffer> {
    return this.withRetry(async () => {
      const resp = await fetch(downloadUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const retryAfterMs = resp.status === 429
          ? parseRetryAfter(resp.headers.get('retry-after'))
          : null;
        throw new BoltzApiError(`Download failed (${resp.status})`, resp.status, retryAfterMs);
      }

      const arrayBuffer = await resp.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }, retryOpts);
  }

  /**
   * GET /api/v1/connect/predictions?limit=1 -- throws on non-2xx
   */
  async testConnection(apiKey: string): Promise<true> {
    const url = `${this.baseUrl}/api/v1/connect/predictions?limit=1`;

    return this.withRetry(async () => {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new BoltzApiError(
          `Connection test failed (${resp.status}): ${text}`,
          resp.status,
        );
      }

      return true;
    });
  }
}

// ── Inference input builder ──────────────────────────────────────────

/**
 * Build inference input for the Boltz API.
 * Returns a JSON object with version and sequences array.
 * Target type determines the entity key (protein/dna/rna) and whether
 * affinity properties are requested (protein-only).
 */
export function buildInferenceInput(
  sequence: string,
  smiles: string,
  targetType: TargetType = 'protein',
  ligandChainId: string = 'B',
): unknown {
  const payload: Record<string, unknown> = {
    // version field is ignored by API as of Mar 2026, kept for forward-compat
    version: 2,
    sequences: [
      { [targetType]: { id: 'A', sequence } },
      { ligand: { id: ligandChainId, smiles } },
    ],
  };

  // Affinity metrics are only supported for protein targets
  if (targetType === 'protein') {
    payload.properties = [{ affinity: { binder: ligandChainId } }];
  }

  return payload;
}

// ── Inference options builder ────────────────────────────────────────

export function buildInferenceOptions(params: RunParams): unknown {
  return {
    recycling_steps: params.recycling_steps,
    diffusion_samples: params.diffusion_samples,
    sampling_steps: params.sampling_steps,
    step_scale: params.step_scale,
  };
}

// ── Metrics parser ───────────────────────────────────────────────────

function getNumber(obj: Record<string, unknown>, key: string): number | null {
  const val = obj[key];
  return typeof val === 'number' ? val : null;
}

/**
 * Parse compound metrics from the prediction status response.
 */
export function parseMetrics(prediction: PredictionStatus): CompoundMetrics {
  const results = prediction.prediction_results;
  if (!results) {
    throw new Error('No prediction results');
  }

  const output = results.output;
  if (!output) {
    throw new Error('No prediction output');
  }

  const metricsJson = output.metrics;
  if (!metricsJson) {
    throw new Error('No metrics in output');
  }

  // Parse affinity metrics (only present when submission includes properties.affinity)
  const affinityJson = metricsJson['affinity'] as Record<string, unknown> | undefined;
  let affinity: AffinityMetrics | null = null;
  if (
    affinityJson &&
    typeof affinityJson['binding_confidence'] === 'number' &&
    typeof affinityJson['optimization_score'] === 'number'
  ) {
    affinity = {
      binding_confidence: affinityJson['binding_confidence'],
      optimization_score: affinityJson['optimization_score'],
    };
  } else {
    console.warn('Prediction completed without affinity metrics — was properties.affinity included in the submission?');
  }

  // Parse sample results — API returns an object keyed by sample name (e.g. "sample_0")
  const sampleResults = metricsJson['sample_results'];
  if (!sampleResults || typeof sampleResults !== 'object') {
    throw new Error('No sample_results in metrics');
  }

  const sampleEntries = Array.isArray(sampleResults)
    ? (sampleResults as Record<string, unknown>[])
    : Object.keys(sampleResults)
        .sort()
        .map((key) => (sampleResults as Record<string, Record<string, unknown>>)[key]);

  const samples: SampleMetrics[] = sampleEntries.map((s: Record<string, unknown>) => ({
    structure_confidence: getNumber(s, 'structure_confidence'),
    iptm: getNumber(s, 'iptm'),
    ligand_iptm: getNumber(s, 'ligand_iptm'),
    complex_plddt: getNumber(s, 'complex_plddt'),
    ptm: getNumber(s, 'ptm'),
    protein_iptm: getNumber(s, 'protein_iptm'),
    complex_iplddt: getNumber(s, 'complex_iplddt'),
    complex_pde: getNumber(s, 'complex_pde'),
    complex_ipde: getNumber(s, 'complex_ipde'),
    chains_ptm: (s['chains_ptm'] as Record<string, number>) ?? null,
    pair_chains_iptm: (s['pair_chains_iptm'] as Record<string, Record<string, number>>) ?? null,
  }));

  return { affinity, samples };
}
