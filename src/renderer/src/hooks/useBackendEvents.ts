import { useEffect } from 'react';
import { trpc } from '@/api/trpc';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Subscribe to backend events via tRPC subscriptions.
 * Invalidates relevant queries when data changes.
 */
export function useBackendEvents() {
  const queryClient = useQueryClient();

  // Compound status changes → invalidate campaigns + run queries
  trpc.compounds.onStatusChanged.useSubscription(undefined, {
    onData: (event) => {
      queryClient.invalidateQueries({ queryKey: [['campaigns', 'list']] });
      queryClient.invalidateQueries({
        queryKey: [['runs', 'get'], { input: { runId: event.run_id } }],
      });
      queryClient.invalidateQueries({
        queryKey: [['compounds', 'get'], { input: { compoundId: event.compound_id } }],
      });
    },
  });

  // Files ready → invalidate compound query (for CIF/PAE availability)
  trpc.compounds.onFilesReady.useSubscription(undefined, {
    onData: (event) => {
      queryClient.invalidateQueries({
        queryKey: [['compounds', 'get'], { input: { compoundId: event.compound_id } }],
      });
    },
  });

  // Run completed → show notification + invalidate
  trpc.compounds.onRunCompleted.useSubscription(undefined, {
    onData: (event) => {
      queryClient.invalidateQueries({ queryKey: [['campaigns', 'list']] });

      // Desktop notification
      if (Notification.permission === 'granted') {
        new Notification('Run Complete', {
          body: `${event.run_name}: ${event.completed_count} completed, ${event.failed_count} failed`,
        });
      }
    },
  });

  // Request notification permission on mount
  useEffect(() => {
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
}
