import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/api/trpc';
import type { AutoUpdateStatusEvent } from '../../../main/lib/auto-updater';

export function useUpdateListener() {
  const [updateEvent, setUpdateEvent] = useState<AutoUpdateStatusEvent | null>(null);
  const dismissedRef = useRef(false);

  // Poll current status on mount — catches READY events that fired
  // before the renderer connected its subscription.
  const statusQuery = trpc.autoUpdate.getStatus.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (statusQuery.data?.status === 'ready' && !dismissedRef.current) {
      setUpdateEvent(statusQuery.data);
    }
  }, [statusQuery.data]);

  trpc.autoUpdate.subscribe.useSubscription(undefined, {
    onData: (event: AutoUpdateStatusEvent) => {
      if (event.status === 'ready') {
        dismissedRef.current = false;
        setUpdateEvent(event);
      } else {
        setUpdateEvent(null);
      }
    },
  });

  const dismissMutation = trpc.autoUpdate.dismiss.useMutation();
  const dismiss = () => {
    dismissedRef.current = true;
    setUpdateEvent(null);
    dismissMutation.mutate();
  };

  return { updateEvent, dismiss };
}
