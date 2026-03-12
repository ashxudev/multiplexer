import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { router, publicProcedure } from '../trpc';
import {
  createCampaignFolder,
  sanitiseFolderName,
  uniqueFolderName,
  renameFolder,
  persistState,
} from '../../services/storage';
import path from 'node:path';

export const campaignsRouter = router({
  list: publicProcedure.query(({ ctx }) => {
    return ctx.services.state.data.campaigns;
  }),

  create: publicProcedure
    .input(
      z.object({
        displayName: z.string().min(1),
        targetSequence: z.string().min(1),
        targetType: z.enum(['protein', 'dna', 'rna']).default('protein'),
        description: z.string().nullable().optional(),
      }).superRefine((val, ctx) => {
        const seq = val.targetSequence.trim().toUpperCase();
        const valid =
          val.targetType === 'dna'
            ? /^[ACGT]+$/.test(seq)
            : val.targetType === 'rna'
              ? /^[ACGU]+$/.test(seq)
              : /^[A-Z]+$/.test(seq);
        if (!valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['targetSequence'],
            message:
              val.targetType === 'dna'
                ? 'DNA sequence must contain only A, C, G, and T.'
                : val.targetType === 'rna'
                  ? 'RNA sequence must contain only A, C, G, and U.'
                  : 'Protein sequence must contain only amino acid letters.',
          });
        }
      }),
    )
    .mutation(({ ctx, input }) => {
      const { state } = ctx.services;
      const targetSequence = input.targetSequence.trim().toUpperCase();
      const baseName = sanitiseFolderName(input.displayName);
      const existing = state.data.campaigns.map((c) => c.folder_name);
      const folderName = uniqueFolderName(baseName, existing);

      const campaign = {
        id: uuidv4(),
        display_name: input.displayName,
        folder_name: folderName,
        target_sequence: targetSequence,
        target_type: input.targetType,
        description: input.description ?? null,
        archived: false,
        archived_at: null,
        created_at: new Date().toISOString(),
        runs: [],
      };

      state.data.campaigns.push(campaign);
      state.markDirty();

      createCampaignFolder(state.rootDir, folderName);
      persistState(state.rootDir, state.data);

      return campaign;
    }),

  rename: publicProcedure
    .input(
      z.object({
        campaignId: z.string().uuid(),
        newName: z.string().min(1),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { state } = ctx.services;
      const campaign = state.findCampaign(input.campaignId);
      if (!campaign) throw new Error('Campaign not found');

      const oldFolder = campaign.folder_name;
      const newBase = sanitiseFolderName(input.newName);
      const siblings = state.data.campaigns
        .filter((c) => c.id !== input.campaignId)
        .map((c) => c.folder_name);
      const newFolder = uniqueFolderName(newBase, siblings);

      // Rename on disk first
      if (oldFolder !== newFolder) {
        renameFolder(
          path.join(state.rootDir, oldFolder),
          path.join(state.rootDir, newFolder),
        );
      }

      // Update state after disk success
      campaign.display_name = input.newName;
      campaign.folder_name = newFolder;
      state.markDirty();
      persistState(state.rootDir, state.data);
    }),

  archive: publicProcedure
    .input(z.object({ campaignId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const campaign = ctx.services.state.findCampaign(input.campaignId);
      if (!campaign) throw new Error('Campaign not found');

      campaign.archived = true;
      campaign.archived_at = new Date().toISOString();
      ctx.services.state.markDirty();
    }),

  unarchive: publicProcedure
    .input(z.object({ campaignId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const campaign = ctx.services.state.findCampaign(input.campaignId);
      if (!campaign) throw new Error('Campaign not found');

      campaign.archived = false;
      campaign.archived_at = null;
      ctx.services.state.markDirty();
    }),

  updateDescription: publicProcedure
    .input(
      z.object({
        campaignId: z.string().uuid(),
        description: z.string().nullable(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { state } = ctx.services;
      const campaign = state.findCampaign(input.campaignId);
      if (!campaign) throw new Error('Campaign not found');

      campaign.description = input.description;
      state.markDirty();
      persistState(state.rootDir, state.data);
    }),
});
