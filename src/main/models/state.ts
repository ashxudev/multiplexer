import type {
  AppData,
  Campaign,
  Run,
  Compound,
  CompoundRef,
  RunCompletedEvent,
} from './types';
import { isTerminal } from './types';

export class AppState {
  data: AppData;
  dirty: boolean;
  rootDir: string;

  constructor(data: AppData, rootDir: string) {
    this.data = data;
    this.dirty = false;
    this.rootDir = rootDir;
  }

  static defaultData(): AppData {
    return {
      schema_version: 1,
      api_key: null,
      campaigns: [],
    };
  }

  markDirty(): void {
    this.dirty = true;
  }

  // ── Finders ───────────────────────────────────────────────────────

  findCampaign(campaignId: string): Campaign | undefined {
    return this.data.campaigns.find((c) => c.id === campaignId);
  }

  findRun(runId: string): Run | undefined {
    for (const campaign of this.data.campaigns) {
      const run = campaign.runs.find((r) => r.id === runId);
      if (run) return run;
    }
    return undefined;
  }

  findCompound(compoundId: string): Compound | undefined {
    for (const campaign of this.data.campaigns) {
      for (const run of campaign.runs) {
        const compound = run.compounds.find((c) => c.id === compoundId);
        if (compound) return compound;
      }
    }
    return undefined;
  }

  /** Returns [campaign, run, compound] or undefined */
  findCompoundContext(
    compoundId: string,
  ): [Campaign, Run, Compound] | undefined {
    for (const campaign of this.data.campaigns) {
      for (const run of campaign.runs) {
        const compound = run.compounds.find((c) => c.id === compoundId);
        if (compound) return [campaign, run, compound];
      }
    }
    return undefined;
  }

  /** Find the campaign that contains a given run */
  findCampaignForRun(runId: string): Campaign | undefined {
    return this.data.campaigns.find((c) => c.runs.some((r) => r.id === runId));
  }

  // ── Poller Helpers ────────────────────────────────────────────────

  /** Collect all in-progress compounds for the poller */
  allCompoundsInProgress(): CompoundRef[] {
    const refs: CompoundRef[] = [];
    for (const campaign of this.data.campaigns) {
      for (const run of campaign.runs) {
        for (const compound of run.compounds) {
          if (
            !isTerminal(compound.status) &&
            compound.boltz_job_id != null &&
            compound.submitted_at != null
          ) {
            refs.push({
              compound_id: compound.id,
              boltz_job_id: compound.boltz_job_id,
              campaign_id: campaign.id,
              run_id: run.id,
              submitted_at: compound.submitted_at,
            });
          }
        }
      }
    }
    return refs;
  }

  /**
   * Check if all compounds in a run are terminal.
   * Returns a RunCompletedEvent if the run just completed (completed_at not yet set).
   * Guards against duplicate events by checking completed_at.
   */
  checkRunCompletion(runId: string): RunCompletedEvent | null {
    const campaign = this.findCampaignForRun(runId);
    if (!campaign) return null;

    const run = campaign.runs.find((r) => r.id === runId);
    if (!run) return null;

    // Already marked as completed — don't emit again
    if (run.completed_at) return null;

    const allTerminal = run.compounds.every((c) => isTerminal(c.status));
    if (!allTerminal) return null;

    // Mark the run as completed
    run.completed_at = new Date().toISOString();
    this.dirty = true;

    return {
      run_id: run.id,
      campaign_id: campaign.id,
      run_name: run.display_name,
      total_compounds: run.compounds.length,
      completed_count: run.compounds.filter((c) => c.status === 'COMPLETED')
        .length,
      failed_count: run.compounds.filter((c) => c.status === 'FAILED').length,
      timed_out_count: run.compounds.filter((c) => c.status === 'TIMED_OUT')
        .length,
      cancelled_count: run.compounds.filter((c) => c.status === 'CANCELLED')
        .length,
    };
  }
}
