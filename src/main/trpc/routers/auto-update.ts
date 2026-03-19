import { observable } from '@trpc/server/observable';
import { router, publicProcedure } from '../trpc';
import {
  autoUpdateEmitter,
  checkForUpdates,
  installUpdate,
  dismissUpdate,
  getUpdateStatus,
} from '../../lib/auto-updater';
import type { AutoUpdateStatusEvent } from '../../lib/auto-updater';

export const autoUpdateRouter = router({
  subscribe: publicProcedure.subscription(() => {
    return observable<AutoUpdateStatusEvent>((emit) => {
      const handler = (event: AutoUpdateStatusEvent) => emit.next(event);
      autoUpdateEmitter.on('status-changed', handler);
      return () => {
        autoUpdateEmitter.off('status-changed', handler);
      };
    });
  }),

  getStatus: publicProcedure.query(() => {
    return getUpdateStatus();
  }),

  check: publicProcedure.mutation(() => {
    checkForUpdates();
  }),

  install: publicProcedure.mutation(() => {
    installUpdate();
  }),

  dismiss: publicProcedure.mutation(() => {
    dismissUpdate();
  }),
});
