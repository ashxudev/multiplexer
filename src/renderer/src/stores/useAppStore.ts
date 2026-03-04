import { create } from 'zustand';

export type AppView = 'workspace' | 'settings' | 'new-campaign' | 'new-run';

interface AppState {
  // Navigation
  currentView: AppView;
  setView: (view: AppView) => void;

  // Selections
  selectedCampaignId: string | null;
  selectedRunId: string | null;
  selectedCompoundId: string | null;
  selectedSampleIndex: number;

  selectCampaign: (id: string | null) => void;
  selectRun: (id: string | null) => void;
  selectCompound: (id: string | null) => void;
  setSampleIndex: (index: number) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  expandedCampaignIds: Set<string>;
  toggleCampaignExpanded: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentView: 'workspace',
  setView: (view) => set({ currentView: view }),

  selectedCampaignId: null,
  selectedRunId: null,
  selectedCompoundId: null,
  selectedSampleIndex: 0,

  selectCampaign: (id) =>
    set({
      selectedCampaignId: id,
      selectedRunId: null,
      selectedCompoundId: null,
      selectedSampleIndex: 0,
    }),

  selectRun: (id) =>
    set({
      selectedRunId: id,
      selectedCompoundId: null,
      selectedSampleIndex: 0,
    }),

  selectCompound: (id) =>
    set({ selectedCompoundId: id, selectedSampleIndex: 0 }),

  setSampleIndex: (index) => set({ selectedSampleIndex: index }),

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

  expandedCampaignIds: new Set(),
  toggleCampaignExpanded: (id) =>
    set((s) => {
      const next = new Set(s.expandedCampaignIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expandedCampaignIds: next };
    }),
}));
