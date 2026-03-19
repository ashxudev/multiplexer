import { router } from './trpc';
import { settingsRouter } from './routers/settings';
import { campaignsRouter } from './routers/campaigns';
import { runsRouter } from './routers/runs';
import { compoundsRouter } from './routers/compounds';
import { actionsRouter } from './routers/actions';
import { windowRouter } from './routers/window';
import { autoUpdateRouter } from './routers/auto-update';

export const appRouter = router({
  settings: settingsRouter,
  campaigns: campaignsRouter,
  runs: runsRouter,
  compounds: compoundsRouter,
  actions: actionsRouter,
  window: windowRouter,
  autoUpdate: autoUpdateRouter,
});

export type AppRouter = typeof appRouter;
