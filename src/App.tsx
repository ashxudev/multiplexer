import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { ResultsTable } from "@/components/ResultsTable";
import { CompoundDetail } from "@/components/CompoundDetail";
import { SettingsSheet } from "@/components/SettingsSheet";
import { RunSubmissionForm } from "@/components/RunSubmissionForm";
import { OnboardingCard } from "@/components/OnboardingCard";
import { useAppStore } from "@/stores/useAppStore";
import { useTauriEvents } from "@/hooks/useTauriEvents";

function MainPanel() {
  const mainView = useAppStore((s) => s.mainView);
  const campaigns = useAppStore((s) => s.campaigns);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const loadError = useAppStore((s) => s.loadError);
  const loading = useAppStore((s) => s.loading);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </main>
    );
  }

  if (loadError && campaigns.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
          <p className="text-sm font-medium text-red-400">Failed to load data</p>
          <p className="mt-2 text-xs text-zinc-400">{loadError}</p>
          <button
            className="mt-4 rounded-md bg-zinc-800 px-4 py-2 text-xs text-zinc-300 hover:bg-zinc-700"
            onClick={() => useAppStore.getState().loadCampaigns()}
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  // Show onboarding if no campaigns
  if (campaigns.length === 0) {
    return (
      <main className="flex-1">
        <OnboardingCard />
      </main>
    );
  }

  if (mainView === "new-run") {
    return (
      <main className="flex-1">
        <RunSubmissionForm />
      </main>
    );
  }

  // Results view
  return (
    <>
      <main className="min-w-0 flex-1">
        <ResultsTable />
      </main>
      {selectedCompoundId && <CompoundDetail />}
    </>
  );
}

function App() {
  useTauriEvents();

  useEffect(() => {
    useAppStore.getState().loadCampaigns();
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore shortcuts when typing in inputs or contentEditable elements
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (target?.isContentEditable) return;

      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.shiftKey && e.key === "n") {
        e.preventDefault();
        const state = useAppStore.getState();
        if (state.campaigns.length > 0 && state.selectedCampaignId) {
          state.setMainView("new-run");
        }
      } else if (meta && e.key === ",") {
        e.preventDefault();
        useAppStore.getState().setSettingsOpen(true);
      } else if (e.key === "Escape") {
        useAppStore.getState().selectCompound(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <Sidebar />
      <MainPanel />
      <SettingsSheet />
    </div>
  );
}

export default App;
