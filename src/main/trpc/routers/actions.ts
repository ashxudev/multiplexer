import { z } from 'zod';
import { shell } from 'electron';
import path from 'node:path';
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
});
