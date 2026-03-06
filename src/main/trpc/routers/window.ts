import { publicProcedure, router } from '../trpc';

export const windowRouter = router({
  getPlatform: publicProcedure.query(() => process.platform),
});
