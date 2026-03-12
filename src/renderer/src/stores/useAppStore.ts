import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppView = 'workspace' | 'settings' | 'new-campaign' | 'new-run' | 'campaign-detail';

// Open sidebar is clamped to [SIDEBAR_MIN, SIDEBAR_MAX]; collapsed = 0.
export const SIDEBAR_DEFAULT = 280;
export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 400;

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
  sidebarWidth: number;
  lastOpenSidebarWidth: number;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  expandedCampaignIds: Set<string>;
  toggleCampaignExpanded: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
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
      sidebarWidth: SIDEBAR_DEFAULT,
      lastOpenSidebarWidth: SIDEBAR_DEFAULT,

      toggleSidebar: () => {
        const { sidebarOpen, sidebarWidth, lastOpenSidebarWidth } = get();
        if (sidebarOpen) {
          set({
            sidebarOpen: false,
            sidebarWidth: 0,
            lastOpenSidebarWidth: sidebarWidth > 0 ? sidebarWidth : lastOpenSidebarWidth,
          });
        } else {
          set({
            sidebarOpen: true,
            sidebarWidth: lastOpenSidebarWidth,
          });
        }
      },

      setSidebarWidth: (width) => {
        if (width <= 0) {
          const { sidebarOpen, sidebarWidth, lastOpenSidebarWidth } = get();
          if (!sidebarOpen && sidebarWidth === 0) return;
          set({
            sidebarWidth: 0,
            sidebarOpen: false,
            lastOpenSidebarWidth: sidebarWidth > 0 ? sidebarWidth : lastOpenSidebarWidth,
          });
        } else {
          const clamped = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, width));
          set({
            sidebarWidth: clamped,
            lastOpenSidebarWidth: clamped,
            sidebarOpen: true,
          });
        }
      },

      expandedCampaignIds: new Set(),
      toggleCampaignExpanded: (id) =>
        set((s) => {
          const next = new Set(s.expandedCampaignIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { expandedCampaignIds: next };
        }),
    }),
    {
      name: 'sidebar-store',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        lastOpenSidebarWidth: state.lastOpenSidebarWidth,
        expandedCampaignIds: state.expandedCampaignIds,
      }),
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          let parsed;
          try {
            parsed = JSON.parse(str);
          } catch {
            return null;
          }
          // Deserialize expandedCampaignIds from array back to Set
          if (parsed?.state?.expandedCampaignIds) {
            parsed.state.expandedCampaignIds = new Set(parsed.state.expandedCampaignIds);
          }
          return parsed;
        },
        setItem: (name, value) => {
          // Serialize Set to array for JSON
          const toStore = {
            ...value,
            state: {
              ...value.state,
              expandedCampaignIds: value.state.expandedCampaignIds
                ? [...value.state.expandedCampaignIds]
                : [],
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    },
  ),
);
