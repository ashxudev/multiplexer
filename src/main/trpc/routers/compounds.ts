import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from '../trpc';
import { resolveCompoundPath, persistState } from '../../services/storage';
import {
  buildInferenceInput,
  buildInferenceOptions,
  buildPredictionName,
} from '../../services/boltz-client';
import { humanizeError } from '../../services/humanize-error';
import type {
  CompoundStatusEvent,
  CompoundFilesReadyEvent,
  RunCompletedEvent,
} from '../../models/types';
import { isTerminal } from '../../models/types';

export const compoundsRouter = router({
  get: publicProcedure
    .input(z.object({ compoundId: z.string().uuid() }))
    .query(({ ctx, input }) => {
      const compound = ctx.services.state.findCompound(input.compoundId);
      if (!compound) throw new Error('Compound not found');
      return compound;
    }),

  getPoseCif: publicProcedure
    .input(
      z.object({
        compoundId: z.string().uuid(),
        sampleIndex: z.number().int().min(0),
      }),
    )
    .query(({ ctx, input }) => {
      const compoundDir = resolveCompoundPath(ctx.services.state, input.compoundId);
      const cifPath = path.join(compoundDir, `sample_${input.sampleIndex}_structure.cif`);
      return fs.readFileSync(cifPath, 'utf-8');
    }),

  getPaeImageData: publicProcedure
    .input(
      z.object({
        compoundId: z.string().uuid(),
        sampleIndex: z.number().int().min(0),
      }),
    )
    .query(({ ctx, input }) => {
      const compoundDir = resolveCompoundPath(ctx.services.state, input.compoundId);
      const pngPath = path.join(compoundDir, `sample_${input.sampleIndex}_pae.png`);
      const data = fs.readFileSync(pngPath);
      return `data:image/png;base64,${data.toString('base64')}`;
    }),

  retry: publicProcedure
    .input(z.object({ compoundId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { state, client, eventBus } = ctx.services;

      const context = state.findCompoundContext(input.compoundId);
      if (!context) throw new Error('Compound not found');
      const [campaign, run, compound] = context;

      if (!isTerminal(compound.status)) {
        throw new Error('Compound is not in a terminal state');
      }

      const apiKey = state.data.api_key;
      if (!apiKey) throw new Error('No API key configured');

      // Reset compound state
      compound.status = 'PENDING';
      compound.boltz_job_id = null;
      compound.submitted_at = null;
      compound.completed_at = null;
      compound.metrics = null;
      compound.error_message = null;
      compound.download_error = null;
      state.markDirty();

      // Submit
      const inferenceInput = buildInferenceInput(campaign.target_sequence, compound.smiles, campaign.target_type);
      const inferenceOptions = buildInferenceOptions(run.params);
      const now = new Date().toISOString();

      try {
        const predictionName = buildPredictionName(
          campaign.display_name,
          run.display_name,
          compound.display_name,
        );
        const resp = await client.submitPrediction(apiKey, inferenceInput, inferenceOptions, predictionName);

        compound.boltz_job_id = resp.prediction_id;
        compound.status = 'CREATED';
        compound.submitted_at = now;
        state.markDirty();

        eventBus.emit('compound-status-changed', {
          compound_id: compound.id,
          run_id: run.id,
          campaign_id: campaign.id,
          status: 'CREATED',
          metrics: null,
          completed_at: null,
        } satisfies CompoundStatusEvent);
      } catch (e) {
        const msg = humanizeError(e);
        compound.status = 'FAILED';
        compound.completed_at = now;
        compound.error_message = msg;
        state.markDirty();

        eventBus.emit('compound-status-changed', {
          compound_id: compound.id,
          run_id: run.id,
          campaign_id: campaign.id,
          status: 'FAILED',
          metrics: null,
          completed_at: now,
        } satisfies CompoundStatusEvent);
      }

      persistState(state.rootDir, state.data);
    }),

  // ── Subscriptions ──────────────────────────────────────────────────

  onStatusChanged: publicProcedure.subscription(({ ctx }) => {
    return observable<CompoundStatusEvent>((emit) => {
      const handler = (event: CompoundStatusEvent) => emit.next(event);
      ctx.services.eventBus.on('compound-status-changed', handler);
      return () => {
        ctx.services.eventBus.off('compound-status-changed', handler);
      };
    });
  }),

  onFilesReady: publicProcedure.subscription(({ ctx }) => {
    return observable<CompoundFilesReadyEvent>((emit) => {
      const handler = (event: CompoundFilesReadyEvent) => emit.next(event);
      ctx.services.eventBus.on('compound-files-ready', handler);
      return () => {
        ctx.services.eventBus.off('compound-files-ready', handler);
      };
    });
  }),

  onRunCompleted: publicProcedure.subscription(({ ctx }) => {
    return observable<RunCompletedEvent>((emit) => {
      const handler = (event: RunCompletedEvent) => emit.next(event);
      ctx.services.eventBus.on('run-completed', handler);
      return () => {
        ctx.services.eventBus.off('run-completed', handler);
      };
    });
  }),
});
