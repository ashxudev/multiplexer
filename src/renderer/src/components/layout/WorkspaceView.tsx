import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels';
import { useAppStore, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT } from '@/stores/useAppStore';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { ResultsTable } from '@/components/results/ResultsTable';
import { CompoundDetail } from '@/components/detail/CompoundDetail';
import { OnboardingCard } from '@/components/shared/OnboardingCard';
import { PixelText } from '@/components/shared/PixelText';
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
  const sidebarWidth = useAppStore((s) => s.sidebarWidth);
  const setSidebarWidth = useAppStore((s) => s.setSidebarWidth);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const campaigns = trpc.campaigns.list.useQuery();
  const sidebarRef = useRef<ImperativePanelHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasCollapsedOnDragStartRef = useRef(false);

  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);
  const hasCampaigns = (campaigns.data?.length ?? 0) > 0;

  // Track container width so we can convert pixel constraints to percentages.
  // This avoids CSS min/max-width which conflicts with the library's layout engine.
  const [containerWidth, setContainerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined && w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dynamic percentage equivalents of pixel constraints.
  // Fallbacks approximate 220/400/280 at a 1440px window for initial render.
  const MAIN_MIN_PCT = 20;
  const DETAIL_MAX_TARGET = 85;
  const sidebarMinPct = containerWidth > 0 ? (SIDEBAR_MIN / containerWidth) * 100 : 15;
  const sidebarMaxPct = containerWidth > 0 ? (SIDEBAR_MAX / containerWidth) * 100 : 30;
  const defaultSidebarPct = containerWidth > 0 ? (SIDEBAR_DEFAULT / containerWidth) * 100 : 20;

  // Cap detail max so it can never cascade into the sidebar.
  // Uses the sidebar's current width (not its minimum) so the sidebar stays exactly where it is.
  // When sidebar is collapsed, allow the full target.
  const sidebarCurrentPct = containerWidth > 0 ? (sidebarWidth / containerWidth) * 100 : defaultSidebarPct;
  const DETAIL_MIN_PCT = 20;
  const detailMaxPct = sidebarOpen
    ? Math.max(DETAIL_MIN_PCT, Math.min(DETAIL_MAX_TARGET, 100 - sidebarCurrentPct - MAIN_MIN_PCT))
    : DETAIL_MAX_TARGET;

  // Resolve target type for the selected campaign (needed by ResultsTable)
  const selectedTargetType = useMemo(() => {
    if (!selectedCampaignId || !campaigns.data) return 'protein' as const;
    const campaign = campaigns.data.find((c) => c.id === selectedCampaignId);
    return campaign?.target_type ?? 'protein';
  }, [selectedCampaignId, campaigns.data]);

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
        {/* Sidebar — constraints expressed as dynamic percentages so the library's
            layout engine handles them natively (no CSS min/max-width conflicts).
            Pixel targets: MIN = 220px, DEFAULT = 280px, MAX = 400px. */}
        <Panel
          ref={sidebarRef}
          id="sidebar"
          order={1}
          defaultSize={defaultSidebarPct}
          minSize={sidebarMinPct}
          maxSize={sidebarMaxPct}
          collapsible={true}
          collapsedSize={0}
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
        <Panel id="main" order={2} minSize={MAIN_MIN_PCT}>
          <div className="h-full overflow-auto">
            {!hasCampaigns ? (
              <OnboardingCard />
            ) : selectedRunId ? (
              <ResultsTable runId={selectedRunId} targetType={selectedTargetType} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-8">
                <PixelText text="MULTIPLEXER" className="h-14 w-auto text-foreground" />
                <PixelText text="FOR BOLTZ" className="h-5 w-auto text-muted-foreground" />
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
              maxSize={detailMaxPct}
            >
              <CompoundDetail compoundId={selectedCompoundId} />
            </Panel>
          </>
        )}
      </PanelGroup>
    </div>
  );
}
