// ── Core Data Types ─────────────────────────────────────────────────

export type TargetType = 'protein' | 'dna' | 'rna';

export interface AppData {
  schema_version: number; // Currently 3
  api_key: string | null;
  campaigns: Campaign[];
}

export interface Campaign {
  id: string; // UUID
  display_name: string;
  folder_name: string;
  target_sequence: string;
  target_type: TargetType;
  description: string | null;
  archived: boolean;
  archived_at: string | null; // ISO 8601
  created_at: string; // ISO 8601
  runs: Run[];
}

export interface Run {
  id: string;
  display_name: string;
  folder_name: string;
  archived: boolean;
  archived_at: string | null;
  params: RunParams;
  created_at: string;
  completed_at: string | null;
  compounds: Compound[];
}

export interface RunParams {
  recycling_steps: number;
  diffusion_samples: number;
  sampling_steps: number;
  step_scale: number;
}

export const DEFAULT_RUN_PARAMS: RunParams = {
  recycling_steps: 3,
  diffusion_samples: 1,
  sampling_steps: 200,
  step_scale: 1.5,
};

export interface Compound {
  id: string;
  display_name: string;
  folder_name: string;
  smiles: string;
  boltz_job_id: string | null;
  status: JobStatus;
  submitted_at: string | null;
  completed_at: string | null;
  metrics: CompoundMetrics | null;
  error_message: string | null;
  download_error: string | null;
}

export type JobStatus =
  | 'PENDING'
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'CANCELLED';

export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
]);

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ── Metrics ─────────────────────────────────────────────────────────

export interface CompoundMetrics {
  affinity: AffinityMetrics | null;
  samples: SampleMetrics[];
}

export interface AffinityMetrics {
  binding_confidence: number;
  optimization_score: number;
}

export interface SampleMetrics {
  structure_confidence: number | null;
  iptm: number | null;
  ligand_iptm: number | null;
  complex_plddt: number | null;
  ptm: number | null;
  protein_iptm: number | null;
  complex_iplddt: number | null;
  complex_pde: number | null;
  complex_ipde: number | null;
  chains_ptm: Record<string, number> | null;
  pair_chains_iptm: Record<string, Record<string, number>> | null;
}

// ── Boltz API Response Types ────────────────────────────────────────

export interface SubmitResponse {
  prediction_id: string;
  message?: string;
}

export interface PredictionListResponse {
  predictions: PredictionStatus[];
  total?: number;
}

export interface PredictionStatus {
  prediction_id: string;
  prediction_name?: string;
  prediction_status: string;
  prediction_stage_description?: string;
  created_at?: string;
  started_at?: string;
  completed_at?: string | null;
  prediction_results?: PredictionResults;
}

export interface PredictionResults {
  status?: string;
  processing_time_ms?: number;
  output?: PredictionOutput;
}

export interface PredictionOutput {
  download_url?: string;
  metrics?: Record<string, unknown>;
}

// ── Event Payloads ──────────────────────────────────────────────────

export interface CompoundStatusEvent {
  compound_id: string;
  run_id: string;
  campaign_id: string;
  status: JobStatus;
  metrics: CompoundMetrics | null;
  completed_at: string | null;
}

export interface CompoundFilesReadyEvent {
  compound_id: string;
  run_id: string;
}

export interface RunCompletedEvent {
  run_id: string;
  campaign_id: string;
  run_name: string;
  total_compounds: number;
  completed_count: number;
  failed_count: number;
  timed_out_count: number;
  cancelled_count: number;
}

// ── Input Types ─────────────────────────────────────────────────────

export interface CompoundInput {
  name: string;
  smiles: string;
}

export interface SettingsResponse {
  api_key: string | null;
  root_dir: string;
}

// ── Lightweight Reference (for poller) ──────────────────────────────

export interface CompoundRef {
  compound_id: string;
  boltz_job_id: string;
  campaign_id: string;
  run_id: string;
  submitted_at: string;
}

// ── Constants ───────────────────────────────────────────────────────

export const POLL_TIMEOUT_MS = 7200_000; // 2 hours
export const POLL_CONCURRENCY = 10;
export const SUBMIT_CONCURRENCY = 5;
export const POLL_INTERVAL_MS = 10_000; // 10 seconds
export const FLUSH_INTERVAL_MS = 2_000; // 2 seconds
export const HTTP_TIMEOUT_MS = 30_000; // 30 seconds
export const RETRY_ATTEMPTS = 3;
export const RETRY_BACKOFF_MS = [1000, 2000];
export const RETRY_JITTER_MS = 500;
export const RETRY_ATTEMPTS_RATE_LIMIT = 6;
export const RATE_LIMIT_FALLBACK_MS = 30_000; // when no Retry-After header
export const BOLTZ_BASE_URL = 'https://lab.boltz.bio';
