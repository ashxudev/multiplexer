import { useEffect } from 'react';
import { trpc } from '@/api/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/useAppStore';

/**
 * Subscribe to backend events via tRPC subscriptions.
 * Invalidates relevant queries when data changes.
 */
export function useBackendEvents() {
  const queryClient = useQueryClient();
  const notificationsEnabled = useAppStore((s) => s.notificationsEnabled);

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
      if (notificationsEnabled && Notification.permission === 'granted') {
        new Notification(`${event.run_name} — Completed`);
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
