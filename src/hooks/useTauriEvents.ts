import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useAppStore, type Compound, type CompoundMetrics } from "@/stores/useAppStore";

interface CompoundStatusPayload {
  compound_id: string;
  run_id: string;
  campaign_id: string;
  status: Compound["status"];
  metrics: CompoundMetrics | null;
  completed_at: string | null;
}

interface CompoundFilesReadyPayload {
  compound_id: string;
  run_id: string;
}

interface RunCompletedPayload {
  run_id: string;
  campaign_id: string;
  run_name: string;
  total_compounds: number;
  completed_count: number;
  failed_count: number;
  timed_out_count: number;
  cancelled_count: number;
}

export function useTauriEvents() {
  useEffect(() => {
    // B2: Cancelled flag pattern to handle StrictMode double-mount
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    async function setup() {
      const unlisten1 = await listen<CompoundStatusPayload>(
        "compound-status-changed",
        (event) => {
          const { compound_id, status, metrics, completed_at } = event.payload;
          useAppStore.setState((state) => ({
            campaigns: state.campaigns.map((campaign) => ({
              ...campaign,
              runs: campaign.runs.map((run) => ({
                ...run,
                compounds: run.compounds.map((compound) =>
                  compound.id === compound_id
                    ? {
                        ...compound,
                        status,
                        metrics: metrics ?? compound.metrics,
                        completed_at: completed_at ?? compound.completed_at,
                      }
                    : compound
                ),
              })),
            })),
          }));
        }
      );
      if (cancelled) { unlisten1(); return; }
      unlisteners.push(unlisten1);

      const unlisten2 = await listen<CompoundFilesReadyPayload>(
        "compound-files-ready",
        (event) => {
          const { compound_id } = event.payload;
          useAppStore.setState((state) => ({
            campaigns: state.campaigns.map((campaign) => ({
              ...campaign,
              runs: campaign.runs.map((run) => ({
                ...run,
                compounds: run.compounds.map((compound) =>
                  compound.id === compound_id
                    ? { ...compound, filesReady: true }
                    : compound
                ),
              })),
            })),
          }));
        }
      );
      if (cancelled) { unlisten2(); return; }
      unlisteners.push(unlisten2);

      const unlisten3 = await listen<RunCompletedPayload>(
        "run-completed",
        async (event) => {
          const {
            run_name,
            total_compounds,
            completed_count,
            failed_count,
            timed_out_count,
            cancelled_count,
          } = event.payload;

          useAppStore.setState((state) => ({
            campaigns: state.campaigns.map((campaign) => ({
              ...campaign,
              runs: campaign.runs.map((run) =>
                run.id === event.payload.run_id
                  ? { ...run, completed_at: new Date().toISOString() }
                  : run
              ),
            })),
          }));

          try {
            let permissionGranted = await isPermissionGranted();
            if (!permissionGranted) {
              const permission = await requestPermission();
              permissionGranted = permission === "granted";
            }
            if (permissionGranted) {
              const parts: string[] = [];
              if (failed_count > 0) parts.push(`${failed_count} failed`);
              if (timed_out_count > 0) parts.push(`${timed_out_count} timed out`);
              if (cancelled_count > 0) parts.push(`${cancelled_count} cancelled`);
              const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
              sendNotification({
                title: `Run "${run_name}" complete`,
                body: `${completed_count}/${total_compounds} compounds finished${suffix}`,
              });
            }
          } catch {
            // Notification permission denied or unavailable
          }
        }
      );
      if (cancelled) { unlisten3(); return; }
      unlisteners.push(unlisten3);
    }

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);
}
