import { useState } from 'react';
import { trpc } from '@/api/trpc';
import type { AutoUpdateStatusEvent } from '../../../main/lib/auto-updater';

export function useUpdateListener() {
  const [updateEvent, setUpdateEvent] = useState<AutoUpdateStatusEvent | null>(null);

  // Poll current status on mount — catches READY events that fired
  // before the renderer connected its subscription.
  const statusQuery = trpc.autoUpdate.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const queriedStatus = statusQuery.data;
  if (queriedStatus?.status === 'ready' && !updateEvent) {
    setUpdateEvent(queriedStatus);
  }

  trpc.autoUpdate.subscribe.useSubscription(undefined, {
    onData: (event: AutoUpdateStatusEvent) => {
      if (event.status === 'ready') {
        setUpdateEvent(event);
      } else {
        setUpdateEvent(null);
      }
    },
  });

  const dismiss = () => setUpdateEvent(null);

  return { updateEvent, dismiss };
}
