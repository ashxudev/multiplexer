import { z } from 'zod';
import { dialog, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { router, publicProcedure } from '../trpc';
import { resolveCompoundPath } from '../../services/storage';

export const actionsRouter = router({
  openCsvFile: publicProcedure.mutation(async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'Load CSV File',
      filters: [{ name: 'CSV/TSV Files', extensions: ['csv', 'tsv', 'txt'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    return { content, fileName };
  }),

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
});
