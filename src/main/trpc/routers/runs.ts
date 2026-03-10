import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';
import { router, publicProcedure } from '../trpc';
import {
  createRunFolder,
  createCompoundFolder,
  sanitiseFolderName,
  uniqueFolderName,
  renameFolder,
  persistState,
} from '../../services/storage';
import {
  BoltzApiError,
  buildInferenceInput,
  buildInferenceOptions,
} from '../../services/boltz-client';
import type {
  Compound,
  Run,
  CompoundStatusEvent,
  JobStatus,
} from '../../models/types';
import { isTerminal, SUBMIT_CONCURRENCY } from '../../models/types';
import path from 'node:path';

const runParamsSchema = z.object({
  recycling_steps: z.number().int().min(1),
  diffusion_samples: z.number().int().min(1),
  sampling_steps: z.number().int().min(1),
  step_scale: z.number().positive(),
});

const compoundInputSchema = z.object({
  name: z.string().min(1),
  smiles: z.string().min(1),
});

export const runsRouter = router({
  get: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const run = ctx.services.state.findRun(input.runId);
      if (!run) throw new Error('Run not found');
      return run;
    }),

  create: publicProcedure
    .input(
      z.object({
        campaignId: z.string().uuid(),
        displayName: z.string().min(1),
        compounds: z.array(compoundInputSchema).min(1),
        params: runParamsSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { state, client, eventBus } = ctx.services;
      const campaign = state.findCampaign(input.campaignId);
      if (!campaign) throw new Error('Campaign not found');

      const apiKey = state.data.api_key;
      if (!apiKey) throw new Error('No API key configured');

      // Pre-flight: verify API key before creating the run
      try {
        await client.testConnection(apiKey);
      } catch (e) {
        if (e instanceof BoltzApiError) {
          if (e.statusCode === 401 || e.statusCode === 403) {
            throw new Error('API key is invalid or expired. Check Settings.', { cause: e });
          }
          if (e.statusCode === 429) {
            throw new Error('Boltz API rate limit reached. Try again in a few minutes.', { cause: e });
          }
        }
        throw new Error('Cannot reach the Boltz API. Try again in a few minutes.', { cause: e });
      }

      const proteinSequence = campaign.protein_sequence;

      // Generate unique run folder name
      const runBase = sanitiseFolderName(input.displayName);
      const existingRunFolders = campaign.runs.map((r) => r.folder_name);
      const runFolder = uniqueFolderName(runBase, existingRunFolders);

      // Build compound structs with unique folder names
      const compoundFolders: string[] = [];
      const compounds: Compound[] = input.compounds.map((c) => {
        const base = sanitiseFolderName(c.name);
        const folder = uniqueFolderName(base, compoundFolders);
        compoundFolders.push(folder);
        return {
          id: uuidv4(),
          display_name: c.name,
          folder_name: folder,
          smiles: c.smiles,
          boltz_job_id: null,
          status: 'PENDING' as JobStatus,
          submitted_at: null,
          completed_at: null,
          metrics: null,
          error_message: null,
          download_error: null,
        };
      });

      const run: Run = {
        id: uuidv4(),
        display_name: input.displayName,
        folder_name: runFolder,
        archived: false,
        archived_at: null,
        params: input.params,
        created_at: new Date().toISOString(),
        completed_at: null,
        compounds,
      };

      // Save to state and create folder
      campaign.runs.push(run);
      state.markDirty();
      createRunFolder(state.rootDir, campaign.folder_name, runFolder);
      persistState(state.rootDir, state.data);

      // Return run snapshot immediately, then submit compounds in background
      const runSnapshot = structuredClone(run);

      // Background: submit all compounds with bounded concurrency
      const limit = pLimit(SUBMIT_CONCURRENCY);
      const runId = run.id;
      const campaignId = input.campaignId;

      // Shared rate-limit gate: when any submission gets a 429,
      // pause all queued submissions for the Retry-After duration.
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      let pauseUntil = 0;

      function triggerPause(delayMs: number): void {
        pauseUntil = Math.max(pauseUntil, Date.now() + delayMs);
      }

      async function waitForGate(): Promise<void> {
        let remaining = pauseUntil - Date.now();
        while (remaining > 0) {
          await sleep(remaining);
          remaining = pauseUntil - Date.now();
        }
      }

      const tasks = compounds.map((compound) =>
        limit(async () => {
          await waitForGate();
          const inferenceInput = buildInferenceInput(proteinSequence, compound.smiles);
          const inferenceOptions = buildInferenceOptions(input.params);
          const now = new Date().toISOString();

          try {
            const resp = await client.submitPrediction(
              apiKey,
              inferenceInput,
              inferenceOptions,
              { onRateLimited: triggerPause },
            );

            // Update compound state
            const liveCompound = state.findCompound(compound.id);
            if (liveCompound) {
              liveCompound.boltz_job_id = resp.prediction_id;
              liveCompound.status = 'CREATED';
              liveCompound.submitted_at = now;
            }
            state.markDirty();

            const evt: CompoundStatusEvent = {
              compound_id: compound.id,
              run_id: runId,
              campaign_id: campaignId,
              status: 'CREATED',
              metrics: null,
              completed_at: null,
            };
            eventBus.emit('compound-status-changed', evt);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error(`Failed to submit compound ${compound.id}: ${msg}`);

            const liveCompound = state.findCompound(compound.id);
            if (liveCompound) {
              liveCompound.status = 'FAILED';
              liveCompound.completed_at = now;
              liveCompound.error_message = msg;
            }
            state.markDirty();

            const evt: CompoundStatusEvent = {
              compound_id: compound.id,
              run_id: runId,
              campaign_id: campaignId,
              status: 'FAILED',
              metrics: null,
              completed_at: now,
            };
            eventBus.emit('compound-status-changed', evt);
          }
        }),
      );

      // Fire and forget — persist after all submissions complete
      Promise.allSettled(tasks).then(() => {
        persistState(state.rootDir, state.data);
      });

      return runSnapshot;
    }),

  rename: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        newName: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { state } = ctx.services;
      const campaign = state.findCampaignForRun(input.runId);
      if (!campaign) throw new Error('Run not found');

      const run = campaign.runs.find((r) => r.id === input.runId);
      if (!run) throw new Error('Run not found');

      const oldFolder = run.folder_name;
      const newBase = sanitiseFolderName(input.newName);
      const siblings = campaign.runs
        .filter((r) => r.id !== input.runId)
        .map((r) => r.folder_name);
      const newFolder = uniqueFolderName(newBase, siblings);

      // Rename on disk first
      if (oldFolder !== newFolder) {
        renameFolder(
          path.join(state.rootDir, campaign.folder_name, oldFolder),
          path.join(state.rootDir, campaign.folder_name, newFolder),
        );
      }

      // Update state after disk success
      run.display_name = input.newName;
      run.folder_name = newFolder;
      state.markDirty();
      persistState(state.rootDir, state.data);
    }),

  archive: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const run = ctx.services.state.findRun(input.runId);
      if (!run) throw new Error('Run not found');

      run.archived = true;
      run.archived_at = new Date().toISOString();
      ctx.services.state.markDirty();
    }),

  unarchive: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const run = ctx.services.state.findRun(input.runId);
      if (!run) throw new Error('Run not found');

      run.archived = false;
      run.archived_at = null;
      ctx.services.state.markDirty();
    }),

  cancel: publicProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const { state, eventBus } = ctx.services;
      const campaign = state.findCampaignForRun(input.runId);
      if (!campaign) throw new Error('Run not found');

      const run = campaign.runs.find((r) => r.id === input.runId);
      if (!run) throw new Error('Run not found');

      const now = new Date().toISOString();
      const events: CompoundStatusEvent[] = [];

      for (const compound of run.compounds) {
        if (!isTerminal(compound.status)) {
          compound.status = 'CANCELLED';
          compound.completed_at = now;

          events.push({
            compound_id: compound.id,
            run_id: input.runId,
            campaign_id: campaign.id,
            status: 'CANCELLED',
            metrics: null,
            completed_at: now,
          });
        }
      }

      if (events.length > 0) {
        state.markDirty();

        // Check run completion
        const runEvent = state.checkRunCompletion(input.runId);

        // Emit events
        for (const evt of events) {
          eventBus.emit('compound-status-changed', evt);
        }
        if (runEvent) {
          eventBus.emit('run-completed', runEvent);
        }

        persistState(state.rootDir, state.data);
      }
    }),
});
