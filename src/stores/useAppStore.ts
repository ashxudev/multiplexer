import { create } from "zustand";
import * as tauriApi from "@/lib/tauri-api";

// ── Types mirroring Rust models ──────────────────────────────────────

export interface SampleMetrics {
  structure_confidence: number | null;
  iptm: number | null;
  ligand_iptm: number | null;
  complex_plddt: number | null;
  ptm: number | null;
  protein_iptm: number | null;
  complex_iplddt: number | null;
  complex_pde: number | null;
  complex_ipde: number | null;
}

export interface CompoundMetrics {
  affinity: { binding_confidence: number; optimization_score: number };
  samples: SampleMetrics[];
}

export type CompoundStatus =
  | "PENDING"
  | "CREATED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "TIMED_OUT"
  | "CANCELLED";

export interface Compound {
  id: string;
  display_name: string;
  folder_name: string;
  smiles: string;
  boltz_job_id: string | null;
  status: CompoundStatus;
  submitted_at: string | null;
  completed_at: string | null;
  metrics: CompoundMetrics | null;
  error_message: string | null;
  download_error: string | null;
  filesReady?: boolean;
}

export interface RunParams {
  recycling_steps: number;
  diffusion_samples: number;
  sampling_steps: number;
  step_scale: number;
}

export interface Run {
  id: string;
  display_name: string;
  folder_name: string;
  archived: boolean;
  archived_at: string | null;
  params: RunParams;
  created_at: string;
  completed_at: string | null;
  compounds: Compound[];
}

export interface Campaign {
  id: string;
  display_name: string;
  folder_name: string;
  protein_sequence: string;
  description: string | null;
  archived: boolean;
  archived_at: string | null;
  created_at: string;
  runs: Run[];
}

// ── UI state ─────────────────────────────────────────────────────────

export type MainView = "onboarding" | "results" | "new-run";

export interface AppState {
  campaigns: Campaign[];
  loading: boolean;
  loadError: string | null;
  selectedCampaignId: string | null;
  selectedRunId: string | null;
  selectedCompoundId: string | null;
  settingsOpen: boolean;
  mainView: MainView;
  expandedCampaignIds: Set<string>;
  selectedSampleIndex: number;

  // Actions
  selectCampaign: (id: string) => void;
  selectRun: (campaignId: string, runId: string) => void;
  selectCompound: (id: string | null) => void;
  closeSidebar: () => void;
  setSettingsOpen: (open: boolean) => void;
  setMainView: (view: MainView) => void;
  toggleCampaignExpanded: (id: string) => void;
  setSelectedSampleIndex: (index: number) => void;

  // API-backed actions (used when running inside Tauri)
  loadCampaigns: () => Promise<void>;
  addCampaign: (campaign: Campaign) => void;
  addRunToCampaign: (campaignId: string, run: Run) => void;
  setCampaigns: (campaigns: Campaign[]) => void;
  archiveCampaignLocal: (campaignId: string) => void;
  unarchiveCampaignLocal: (campaignId: string) => void;
  archiveRunLocal: (runId: string) => void;
  unarchiveRunLocal: (runId: string) => void;
}

// ── Store ────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()((set) => ({
  campaigns: [],
  loading: true,
  loadError: null,
  selectedCampaignId: null,
  selectedRunId: null,
  selectedCompoundId: null,
  settingsOpen: false,
  mainView: "onboarding",
  expandedCampaignIds: new Set<string>(),
  selectedSampleIndex: 0,

  selectCampaign: (id) =>
    set({ selectedCampaignId: id }),

  selectRun: (campaignId, runId) =>
    set({
      selectedCampaignId: campaignId,
      selectedRunId: runId,
      selectedCompoundId: null,
      mainView: "results",
      selectedSampleIndex: 0,
    }),

  selectCompound: (id) =>
    set({ selectedCompoundId: id, selectedSampleIndex: 0 }),

  closeSidebar: () => set({ selectedCompoundId: null }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setMainView: (view) =>
    set({ mainView: view, selectedCompoundId: null }),

  toggleCampaignExpanded: (id) =>
    set((state) => {
      const expanded = new Set(state.expandedCampaignIds);
      if (expanded.has(id)) {
        expanded.delete(id);
      } else {
        expanded.add(id);
      }
      return { expandedCampaignIds: expanded };
    }),

  setSelectedSampleIndex: (index) => set({ selectedSampleIndex: index }),

  // API-backed actions
  loadCampaigns: async () => {
    set({ loading: true });
    try {
      const campaigns = await tauriApi.getCampaigns();
      // Mark completed compounds as filesReady so PAE/Mol* viewers render on startup.
      // Note: compounds that completed while the app was closed may not have files yet.
      // The startup recovery path (recover_incomplete_downloads) will download them
      // and emit compound-files-ready. The brief flash of broken viewers is acceptable
      // since the error boundary catches it and recovery finishes within seconds.
      for (const campaign of campaigns) {
        for (const run of campaign.runs) {
          for (const compound of run.compounds) {
            if (compound.status === "COMPLETED") {
              compound.filesReady = true;
            }
          }
        }
      }
      set({ campaigns, loadError: null, loading: false });
    } catch (e) {
      console.error("Failed to load campaigns:", e);
      set({ loadError: String(e), loading: false });
    }
  },

  addCampaign: (campaign) =>
    set((state) => ({
      campaigns: [...state.campaigns, campaign],
      selectedCampaignId: campaign.id,
      expandedCampaignIds: new Set([
        ...state.expandedCampaignIds,
        campaign.id,
      ]),
    })),

  addRunToCampaign: (campaignId, run) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId ? { ...c, runs: [...c.runs, run] } : c
      ),
      selectedCampaignId: campaignId,
      selectedRunId: run.id,
      mainView: "results" as MainView,
    })),

  setCampaigns: (campaigns) => set({ campaigns }),

  archiveCampaignLocal: (campaignId) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, archived: true, archived_at: new Date().toISOString() }
          : c
      ),
      // Clear selection if the archived campaign was selected
      ...(state.selectedCampaignId === campaignId
        ? { selectedCampaignId: null, selectedRunId: null, selectedCompoundId: null }
        : {}),
    })),

  unarchiveCampaignLocal: (campaignId) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) =>
        c.id === campaignId
          ? { ...c, archived: false, archived_at: null }
          : c
      ),
    })),

  archiveRunLocal: (runId) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) => ({
        ...c,
        runs: c.runs.map((r) =>
          r.id === runId
            ? { ...r, archived: true, archived_at: new Date().toISOString() }
            : r
        ),
      })),
      // Clear selection if the archived run was selected
      ...(state.selectedRunId === runId
        ? { selectedRunId: null, selectedCompoundId: null }
        : {}),
    })),

  unarchiveRunLocal: (runId) =>
    set((state) => ({
      campaigns: state.campaigns.map((c) => ({
        ...c,
        runs: c.runs.map((r) =>
          r.id === runId
            ? { ...r, archived: false, archived_at: null }
            : r
        ),
      })),
    })),
}));
