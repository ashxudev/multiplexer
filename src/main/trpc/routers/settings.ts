import { z } from 'zod';
import { dialog } from 'electron';
import { router, publicProcedure } from '../trpc';
import { writeRootDir } from '../../services/prefs';
import { loadState, persistState } from '../../services/storage';
import fs from 'node:fs';
import path from 'node:path';

export const settingsRouter = router({
  get: publicProcedure.query(({ ctx }) => {
    const { state } = ctx.services;
    return {
      api_key: state.data.api_key,
      root_dir: state.rootDir,
    };
  }),

  save: publicProcedure
    .input(
      z.object({
        apiKey: z.string().nullable().optional(),
        rootDir: z.string().nullable().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { state } = ctx.services;

      // Validate root dir if provided
      if (input.rootDir) {
        if (!path.isAbsolute(input.rootDir)) {
          throw new Error('Workspace directory must be an absolute path');
        }
        if (fs.existsSync(input.rootDir) && !fs.statSync(input.rootDir).isDirectory()) {
          throw new Error('Workspace path exists but is not a directory');
        }
      }

      // Create directory and persist prefs before updating state
      if (input.rootDir) {
        fs.mkdirSync(input.rootDir, { recursive: true });
        writeRootDir(input.rootDir);
      }

      // Update state
      if (input.apiKey !== undefined) {
        state.data.api_key = input.apiKey ?? null;
      }
      if (input.rootDir) {
        // Reload state from new root dir, preserving the API key
        const apiKey = state.data.api_key;
        const newState = loadState(input.rootDir);
        state.data = newState.data;
        state.data.api_key = apiKey;
        state.rootDir = input.rootDir;
      }
      state.markDirty();
      persistState(state.rootDir, state.data);
    }),

  testConnection: publicProcedure
    .input(z.object({ apiKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { client } = ctx.services;
      return client.testConnection(input.apiKey);
    }),

  selectRootDir: publicProcedure.mutation(async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose Workspace Folder',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  }),
});
