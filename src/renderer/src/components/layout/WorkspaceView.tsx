import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { useAppStore } from '@/stores/useAppStore';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ResultsTable } from '@/components/results/ResultsTable';
import { CompoundDetail } from '@/components/detail/CompoundDetail';
import { OnboardingCard } from '@/components/shared/OnboardingCard';
import { trpc } from '@/api/trpc';

export function WorkspaceView() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const campaigns = trpc.campaigns.list.useQuery();

  const hasCampaigns = (campaigns.data?.length ?? 0) > 0;

  return (
    <PanelGroup direction="horizontal" autoSaveId="workspace-panels">
      {/* Sidebar */}
      {sidebarOpen && (
        <>
          <Panel
            id="sidebar"
            order={1}
            defaultSize={20}
            minSize={15}
            maxSize={35}
          >
            <Sidebar />
          </Panel>
          <PanelResizeHandle className="w-px bg-border hover:bg-ring transition-colors cursor-col-resize" />
        </>
      )}

      {/* Main panel */}
      <Panel id="main" order={2} minSize={30}>
        <div className="h-full overflow-auto">
          {!hasCampaigns ? (
            <OnboardingCard />
          ) : selectedRunId ? (
            <ResultsTable runId={selectedRunId} />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a run to view results
            </div>
          )}
        </div>
      </Panel>

      {/* Detail panel — conditional */}
      {selectedCompoundId && (
        <>
          <PanelResizeHandle className="w-px bg-border hover:bg-ring transition-colors cursor-col-resize" />
          <Panel
            id="detail"
            order={3}
            defaultSize={25}
            minSize={20}
            maxSize={40}
          >
            <CompoundDetail compoundId={selectedCompoundId} />
          </Panel>
        </>
      )}
    </PanelGroup>
  );
}
