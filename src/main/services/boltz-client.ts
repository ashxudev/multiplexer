import { v4 as uuidv4 } from 'uuid';
import yaml from 'js-yaml';
import type {
  CompoundMetrics,
  AffinityMetrics,
  SampleMetrics,
  SubmitResponse,
  PredictionStatus,
  PredictionListResponse,
  RunParams,
} from '../models/types';
import {
  BOLTZ_BASE_URL,
  HTTP_TIMEOUT_MS,
  RETRY_ATTEMPTS,
  RETRY_BACKOFF_MS,
  RETRY_JITTER_MS,
} from '../models/types';

// ── Error helpers ────────────────────────────────────────────────────

class BoltzApiError extends Error {
  readonly statusCode: number | null;

  constructor(message: string, statusCode: number | null = null) {
    super(message);
    this.name = 'BoltzApiError';
    this.statusCode = statusCode;
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

// ── BoltzClient ──────────────────────────────────────────────────────

export class BoltzClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = BOLTZ_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  // ── Retry wrapper ────────────────────────────────────────────────

  /**
   * Retry transient errors (429, 5xx, network) up to RETRY_ATTEMPTS times.
   * Permanent errors (400, 401, 422) fail immediately.
   */
  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown = new Error('No attempts made');

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        const base = RETRY_BACKOFF_MS[attempt - 1];
        const jitter = Math.floor(Math.random() * RETRY_JITTER_MS);
        await sleep(base + jitter);
      }

      try {
        return await fn();
      } catch (err) {
        if (isPermanentError(err)) {
          throw err;
        }
        console.warn(`Transient error (attempt ${attempt + 1}/${RETRY_ATTEMPTS}):`, err);
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
  ): Promise<SubmitResponse> {
    const url = `${this.baseUrl}/api/v1/connect/predictions/boltz2`;

    return this.withRetry(async () => {
      const body = {
        prediction_name: uuidv4(),
        inference_input: inferenceInput,
        inference_options: inferenceOptions,
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
        throw new BoltzApiError(`Submit failed (${resp.status}): ${text}`, resp.status);
      }

      return (await resp.json()) as SubmitResponse;
    });
  }

  /**
   * GET /api/v1/connect/predictions?predictionId={predictionId}
   */
  async getPredictionStatus(
    apiKey: string,
    predictionId: string,
  ): Promise<PredictionStatus> {
    const url = `${this.baseUrl}/api/v1/connect/predictions?predictionId=${encodeURIComponent(predictionId)}`;

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
          `Status check failed (${resp.status}): ${text}`,
          resp.status,
        );
      }

      const list = (await resp.json()) as PredictionListResponse;
      const prediction = list.predictions.find((p) => p.prediction_id === predictionId);
      if (!prediction) {
        throw new BoltzApiError(`Prediction ${predictionId} not found`);
      }
      return prediction;
    });
  }

  /**
   * GET {downloadUrl} (presigned, no auth) -- returns Buffer
   */
  async downloadTarGz(downloadUrl: string): Promise<Buffer> {
    return this.withRetry(async () => {
      const resp = await fetch(downloadUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      if (!resp.ok) {
        throw new BoltzApiError(`Download failed (${resp.status})`, resp.status);
      }

      const arrayBuffer = await resp.arrayBuffer();
      return Buffer.from(arrayBuffer);
    });
  }

  /**
   * GET /api/v1/connect/predictions?limit=1 -- returns true if 2xx
   */
  async testConnection(apiKey: string): Promise<boolean> {
    const url = `${this.baseUrl}/api/v1/connect/predictions?limit=1`;

    return this.withRetry(async () => {
      const resp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });

      return resp.ok;
    });
  }
}

// ── Inference input builder ──────────────────────────────────────────

/**
 * Build YAML inference input for the Boltz API.
 * Uses js-yaml to safely serialize SMILES strings that may contain
 * YAML-special characters like :, [, ], @, #.
 */
export function buildInferenceInput(
  proteinSequence: string,
  smiles: string,
  ligandChainId: string = 'B',
): unknown {
  const yamlObj = {
    version: 2,
    sequences: [
      {
        protein: {
          id: 'A',
          sequence: proteinSequence,
        },
      },
      {
        smiles: {
          id: ligandChainId,
          value: smiles,
        },
      },
    ],
  };

  const yamlContent = yaml.dump(yamlObj, { lineWidth: -1 });

  return {
    type: 'yaml_string',
    value: yamlContent,
  };
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

  // Parse affinity metrics
  const affinityJson = metricsJson['affinity'] as Record<string, unknown> | undefined;
  if (!affinityJson) {
    throw new Error('No affinity metrics');
  }

  const affinity: AffinityMetrics = {
    binding_confidence:
      typeof affinityJson['binding_confidence'] === 'number'
        ? affinityJson['binding_confidence']
        : 0,
    optimization_score:
      typeof affinityJson['optimization_score'] === 'number'
        ? affinityJson['optimization_score']
        : 0,
  };

  // Parse sample results
  const sampleResults = metricsJson['sample_results'];
  if (!Array.isArray(sampleResults)) {
    throw new Error('No sample_results array');
  }

  const samples: SampleMetrics[] = sampleResults.map((s: Record<string, unknown>) => ({
    structure_confidence: getNumber(s, 'structure_confidence'),
    iptm: getNumber(s, 'iptm'),
    ligand_iptm: getNumber(s, 'ligand_iptm'),
    complex_plddt: getNumber(s, 'complex_plddt'),
    ptm: getNumber(s, 'ptm'),
    protein_iptm: getNumber(s, 'protein_iptm'),
    complex_iplddt: getNumber(s, 'complex_iplddt'),
    complex_pde: getNumber(s, 'complex_pde'),
    complex_ipde: getNumber(s, 'complex_ipde'),
  }));

  return { affinity, samples };
}
