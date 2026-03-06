import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { useAppStore, SIDEBAR_MIN, SIDEBAR_MAX } from '@/stores/useAppStore';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ResultsTable } from '@/components/results/ResultsTable';
import { CompoundDetail } from '@/components/detail/CompoundDetail';
import { OnboardingCard } from '@/components/shared/OnboardingCard';
import { trpc } from '@/api/trpc';

/* Matches Superset's ResizableHandle from packages/ui/src/components/ui/resizable.tsx.
   Cursor is forced to col-resize via CSS !important in index.css. */
const HANDLE_CLASS =
  'bg-border relative flex w-px items-center justify-center ' +
  'after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 ' +
  'focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden';

/* When sidebar is collapsed, widen the grab target so the user can easily find
   the handle at the left edge and drag right to re-expand. A subtle hover
   highlight signals interactivity. */
const HANDLE_CLASS_COLLAPSED =
  'relative flex w-1 items-center justify-center transition-colors ' +
  'hover:bg-accent ' +
  'after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 ' +
  'focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden';

export function WorkspaceView() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const campaigns = trpc.campaigns.list.useQuery();
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasCollapsedOnDragStartRef = useRef(false);

  const hasCampaigns = (campaigns.data?.length ?? 0) > 0;

  // Sync store → panel for programmatic toggle (Cmd+B)
  useEffect(() => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (sidebarOpen && panel.isCollapsed()) {
      panel.expand();
    } else if (!sidebarOpen && panel.isExpanded()) {
      panel.collapse();
    }
  }, [sidebarOpen]);

  // On mount, correct the panel size to match the persisted pixel width.
  // useLayoutEffect fires synchronously after DOM mutation, when refs are set.
  useLayoutEffect(() => {
    const panel = sidebarRef.current;
    const container = containerRef.current;
    if (!panel || !container) return;
    const { sidebarWidth: storedPx, sidebarOpen: open } = useAppStore.getState();
    if (!open) {
      panel.collapse();
    } else if (storedPx > 0) {
      const pct = (storedPx / container.offsetWidth) * 100;
      panel.resize(pct);
    }
  }, []);

  // Report pixel width to store on layout change
  const handleLayout = useCallback(
    (sizes: number[]) => {
      const container = containerRef.current;
      if (!container || sizes[0] === undefined) return;
      const pxWidth = Math.round((sizes[0] / 100) * container.offsetWidth);
      if (pxWidth > 0) {
        setSidebarWidth(pxWidth);
      }
    },
    [setSidebarWidth],
  );

  // When user drags from collapsed state, always expand — even tiny drags.
  // The library snaps back to collapsed if the drag doesn't cross its threshold,
  // so we catch that on drag-end and programmatically expand.
  const handleSidebarDragging = useCallback((isDragging: boolean) => {
    const panel = sidebarRef.current;
    if (!panel) return;
    if (isDragging) {
      wasCollapsedOnDragStartRef.current = panel.isCollapsed();
    } else if (wasCollapsedOnDragStartRef.current && panel.isCollapsed()) {
      panel.expand();
      wasCollapsedOnDragStartRef.current = false;
    }
  }, []);

  return (
    <div ref={containerRef} className="h-full">
      <PanelGroup direction="horizontal" onLayout={handleLayout}>
        {/* Sidebar — pixel constraints via CSS, matching Superset's workspace sidebar
            (MIN = 220px, DEFAULT = 280px, MAX = 400px).
            Loose percentage bounds let the library handle drag;
            CSS min/max-width enforces exact pixels. */}
        <Panel
          ref={sidebarRef}
          id="sidebar"
          order={1}
          defaultSize={20}
          minSize={1}
          maxSize={60}
          collapsible={true}
          collapsedSize={0}
          style={{
            minWidth: sidebarOpen ? `${SIDEBAR_MIN}px` : undefined,
            maxWidth: `${SIDEBAR_MAX}px`,
          }}
          onCollapse={() => {
            if (sidebarOpen) setSidebarWidth(0);
          }}
          onExpand={() => {
            if (!sidebarOpen) {
              const { lastOpenSidebarWidth } = useAppStore.getState();
              setSidebarWidth(lastOpenSidebarWidth);
            }
          }}
        >
          {sidebarOpen && <Sidebar />}
        </Panel>
        <PanelResizeHandle
          className={sidebarOpen ? HANDLE_CLASS : HANDLE_CLASS_COLLAPSED}
          onDragging={handleSidebarDragging}
        />

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
            <PanelResizeHandle className={HANDLE_CLASS} />
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
    </div>
  );
}
