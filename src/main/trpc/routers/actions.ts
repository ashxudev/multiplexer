import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import { router, publicProcedure } from '../trpc';
import { resolveCompoundPath } from '../../services/storage';

export const actionsRouter = router({
  openInFinder: publicProcedure
    .input(z.object({ compoundId: z.string().uuid() }))
    .mutation(({ ctx, input }) => {
      const compoundDir = resolveCompoundPath(ctx.services.state, input.compoundId);
      shell.showItemInFolder(compoundDir);
    }),

  openExternal: publicProcedure
    .input(
      z.object({
        compoundId: z.string().uuid(),
        sampleIndex: z.number().int().min(0),
      }),
    )
    .mutation(({ ctx, input }) => {
      const compoundDir = resolveCompoundPath(ctx.services.state, input.compoundId);
      const cifPath = path.join(
        compoundDir,
        `sample_${input.sampleIndex}_structure.cif`,
      );
      shell.openPath(cifPath);
    }),

  exportCsv: publicProcedure
    .input(
      z.object({
        csvContent: z.string(),
        defaultFilename: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await dialog.showSaveDialog({
        title: 'Export CSV',
        defaultPath: path.join(app.getPath('downloads'), input.defaultFilename),
        filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await fs.promises.writeFile(result.filePath, input.csvContent, 'utf-8');
      return result.filePath;
    }),
});
