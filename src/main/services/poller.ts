import pLimit from 'p-limit';
import type {
  CompoundRef,
  CompoundStatusEvent,
  CompoundMetrics,
  RunCompletedEvent,
  JobStatus,
  PredictionStatus,
} from '../models/types';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, POLL_CONCURRENCY } from '../models/types';
import type { AppServices } from './index';
import type { BoltzClient } from './boltz-client';
import { parseMetrics } from './boltz-client';
import { downloadAndStore } from './file-manager';

export class Poller {
  private services: AppServices;
  private client: BoltzClient;
  private timer: ReturnType<typeof setInterval> | null = null;
  private limit = pLimit(POLL_CONCURRENCY);

  constructor(services: AppServices, client: BoltzClient) {
    this.services = services;
    this.client = client;
  }

  /** Start 10-second polling loop */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.pollTick().catch((err) => {
        console.error('Poller tick error:', err);
      });
    }, POLL_INTERVAL_MS);
  }

  /** Stop the polling loop */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Single poll tick */
  private async pollTick(): Promise<void> {
    const state = this.services.state;
    const apiKey = state.data.api_key;
    if (!apiKey) return;

    // Collect in-progress compounds
    let refs = state.allCompoundsInProgress();
    if (refs.length === 0) return;

    // Check for timed-out compounds
    const now = Date.now();
    const timedOut: CompoundRef[] = [];

    refs = refs.filter((r) => {
      const submittedMs = new Date(r.submitted_at).getTime();
      const elapsed = now - submittedMs;
      if (elapsed > POLL_TIMEOUT_MS) {
        timedOut.push(r);
        return false;
      }
      return true;
    });

    // Mark timed-out compounds
    if (timedOut.length > 0) {
      const nowIso = new Date().toISOString();
      const checkedRunIds = new Set<string>();

      for (const r of timedOut) {
        const compound = state.findCompound(r.compound_id);
        if (compound) {
          compound.status = 'TIMED_OUT';
          compound.completed_at = nowIso;
          compound.error_message = 'Prediction timed out after 2 hours';
          state.markDirty();
        }

        // Emit status event
        const statusEvent: CompoundStatusEvent = {
          compound_id: r.compound_id,
          run_id: r.run_id,
          campaign_id: r.campaign_id,
          status: 'TIMED_OUT',
          metrics: null,
          completed_at: nowIso,
        };
        this.services.eventBus.emit('compound-status-changed', statusEvent);

        // Check run completion (deduplicate by run_id)
        if (!checkedRunIds.has(r.run_id)) {
          checkedRunIds.add(r.run_id);
          const runEvent = state.checkRunCompletion(r.run_id);
          if (runEvent) {
            this.services.eventBus.emit('run-completed', runEvent);
          }
        }
      }
    }

    if (refs.length === 0) return;

    console.log(`Polling ${refs.length} in-progress compounds`);

    // Poll each compound with bounded concurrency
    const tasks = refs.map((ref) =>
      this.limit(() => this.pollCompound(ref, apiKey)),
    );
    await Promise.allSettled(tasks);
  }

  /** Poll a single compound */
  private async pollCompound(ref: CompoundRef, apiKey: string): Promise<void> {
    let prediction: PredictionStatus;
    try {
      prediction = await this.client.getPredictionStatus(apiKey, ref.boltz_job_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to poll compound ${ref.compound_id}: ${msg}`);
      return;
    }

    const apiStatus = prediction.prediction_status.toUpperCase();

    switch (apiStatus) {
      case 'COMPLETED': {
        const campaign = this.services.state.findCampaign(ref.campaign_id);
        const targetType = campaign?.target_type ?? 'protein';
        let metrics: CompoundMetrics;
        try {
          metrics = parseMetrics(prediction, targetType);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(`Failed to parse metrics for ${ref.compound_id}: ${msg}`);
          await this.onCompoundFailed(ref, 'FAILED', `Failed to parse metrics: ${msg}`);
          return;
        }
        await this.onCompoundCompleted(ref, metrics, prediction);
        break;
      }
      case 'FAILED': {
        const desc = prediction.prediction_stage_description ?? 'Unknown error';
        await this.onCompoundFailed(ref, 'FAILED', desc);
        break;
      }
      case 'RUNNING':
      case 'CREATED':
      case 'PENDING': {
        const newStatus: JobStatus = apiStatus as JobStatus;
        const state = this.services.state;
        const compound = state.findCompound(ref.compound_id);
        if (compound && compound.status !== newStatus) {
          compound.status = newStatus;
          state.markDirty();

          const statusEvent: CompoundStatusEvent = {
            compound_id: ref.compound_id,
            run_id: ref.run_id,
            campaign_id: ref.campaign_id,
            status: newStatus,
            metrics: null,
            completed_at: null,
          };
          this.services.eventBus.emit('compound-status-changed', statusEvent);
        }
        break;
      }
      default:
        console.warn(`Unknown prediction status '${apiStatus}' for ${ref.compound_id}`);
    }
  }

  /** Handle completed compound */
  private async onCompoundCompleted(
    ref: CompoundRef,
    metrics: CompoundMetrics,
    prediction: PredictionStatus,
  ): Promise<void> {
    const state = this.services.state;
    const nowIso = new Date().toISOString();

    // Update compound state
    const compound = state.findCompound(ref.compound_id);
    if (compound) {
      compound.status = 'COMPLETED';
      compound.completed_at = nowIso;
      compound.metrics = structuredClone(metrics);
      state.markDirty();
    }

    // Check if run is now complete
    const runEvent = state.checkRunCompletion(ref.run_id);

    // Emit status event
    const statusEvent: CompoundStatusEvent = {
      compound_id: ref.compound_id,
      run_id: ref.run_id,
      campaign_id: ref.campaign_id,
      status: 'COMPLETED',
      metrics,
      completed_at: nowIso,
    };
    this.services.eventBus.emit('compound-status-changed', statusEvent);

    if (runEvent) {
      this.services.eventBus.emit('run-completed', runEvent);
    }

    // Spawn download task
    const downloadUrl = prediction.prediction_results?.output?.download_url;
    if (downloadUrl) {
      // Fire and forget -- errors are handled inside downloadAndStore
      downloadAndStore(this.services, this.client, downloadUrl, ref).catch((err) => {
        console.error(`Download failed for ${ref.compound_id}:`, err);
      });
    } else {
      console.warn(
        `No download URL for completed compound ${ref.compound_id}, scheduling retry`,
      );
      // Retry after 30s via recovery path
      setTimeout(() => {
        recoverIncompleteDownloads(this.services, this.client, [ref]).catch((err) => {
          console.error(`Recovery failed for ${ref.compound_id}:`, err);
        });
      }, 30_000);
    }
  }

  /** Handle failed compound */
  private async onCompoundFailed(
    ref: CompoundRef,
    status: JobStatus,
    errorMsg: string,
  ): Promise<void> {
    const state = this.services.state;
    const nowIso = new Date().toISOString();

    const compound = state.findCompound(ref.compound_id);
    if (compound) {
      compound.status = status;
      compound.completed_at = nowIso;
      compound.error_message = errorMsg;
      state.markDirty();
    }

    // Check if run is now complete
    const runEvent = state.checkRunCompletion(ref.run_id);

    const statusEvent: CompoundStatusEvent = {
      compound_id: ref.compound_id,
      run_id: ref.run_id,
      campaign_id: ref.campaign_id,
      status,
      metrics: null,
      completed_at: nowIso,
    };
    this.services.eventBus.emit('compound-status-changed', statusEvent);

    if (runEvent) {
      this.services.eventBus.emit('run-completed', runEvent);
    }
  }
}

// ── Startup Recovery ─────────────────────────────────────────────────

/**
 * Recover incomplete downloads on startup.
 * Re-polls for fresh download URLs and retries the download+store flow.
 */
export async function recoverIncompleteDownloads(
  services: AppServices,
  client: BoltzClient,
  compounds: CompoundRef[],
): Promise<void> {
  if (compounds.length === 0) return;

  console.log(`Recovering ${compounds.length} incomplete downloads`);

  const apiKey = services.state.data.api_key;
  if (!apiKey) {
    console.warn('No API key configured, skipping download recovery');
    return;
  }

  for (const compoundRef of compounds) {
    try {
      const prediction = await client.getPredictionStatus(apiKey, compoundRef.boltz_job_id);
      const downloadUrl = prediction.prediction_results?.output?.download_url;
      if (downloadUrl) {
        await downloadAndStore(services, client, downloadUrl, compoundRef);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`Failed to re-poll for download recovery ${compoundRef.compound_id}: ${msg}`);
    }
  }
}
