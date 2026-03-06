import {
  ChevronRight,
  FlaskConical,
  Plus,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  XCircle,
} from 'lucide-react';
import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { trpc } from '@/api/trpc';
import { SidebarFooter } from './SidebarFooter';

interface Run {
  id: string;
  display_name: string;
  archived: boolean;
  compounds: { status: string }[];
}

interface Campaign {
  id: string;
  display_name: string;
  archived: boolean;
  archived_at: string | null;
  runs: Run[];
}

function relativeTimeGroup(dateStr: string | null): string {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return 'This week';
  if (diffDays < 30) return 'Last month';
  return 'Older';
}

function RunProgressSummary({ run }: { run: Run }) {
  const completed = run.compounds.filter((c) => c.status === 'COMPLETED').length;
  const running = run.compounds.filter(
    (c) => c.status === 'RUNNING' || c.status === 'CREATED',
  ).length;
  const failed = run.compounds.filter(
    (c) => c.status === 'FAILED' || c.status === 'TIMED_OUT' || c.status === 'CANCELLED',
  ).length;
  const total = run.compounds.length;

  return (
    <div className="flex items-center gap-1.5 text-xs text-subtle">
      {completed > 0 && (
        <span className="flex items-center gap-0.5 text-emerald-500">
          <CheckCircle2 className="h-3 w-3" />
          {completed}
        </span>
      )}
      {running > 0 && (
        <span className="flex items-center gap-0.5 text-blue-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          {running}
        </span>
      )}
      {failed > 0 && (
        <span className="flex items-center gap-0.5 text-red-400">
          <XCircle className="h-3 w-3" />
          {failed}
        </span>
      )}
      <span className="text-faint">/{total}</span>
    </div>
  );
}

function CampaignItem({ campaign }: { campaign: Campaign }) {
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const expandedCampaignIds = useAppStore((s) => s.expandedCampaignIds);
  const toggleCampaignExpanded = useAppStore((s) => s.toggleCampaignExpanded);
  const selectRun = useAppStore((s) => s.selectRun);
  const selectCampaign = useAppStore((s) => s.selectCampaign);
  const setView = useAppStore((s) => s.setView);

  const isExpanded = expandedCampaignIds.has(campaign.id);
  const isSelected = selectedCampaignId === campaign.id;
  const activeRuns = campaign.runs.filter((r) => !r.archived);

  return (
    <div>
      <button
        onClick={() => {
          selectCampaign(campaign.id);
          if (!expandedCampaignIds.has(campaign.id)) {
            toggleCampaignExpanded(campaign.id);
          }
        }}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/50',
          isSelected && 'bg-accent text-foreground',
        )}
      >
        <ChevronRight
          onClick={(e) => {
            e.stopPropagation();
            toggleCampaignExpanded(campaign.id);
          }}
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-subtle transition-transform cursor-pointer hover:text-dim',
            isExpanded && 'rotate-90',
          )}
        />
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-subtle" />
        <span className="truncate font-medium">{campaign.display_name}</span>
      </button>

      {isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
          {activeRuns.map((run) => (
            <button
              key={run.id}
              onClick={() => {
                selectCampaign(campaign.id);
                selectRun(run.id);
                setView('workspace');
              }}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-accent/50',
                selectedRunId === run.id && 'bg-accent text-foreground',
              )}
            >
              <span className="truncate text-dim">{run.display_name}</span>
              <RunProgressSummary run={run} />
            </button>
          ))}
          <button
            onClick={() => {
              selectCampaign(campaign.id);
              setView('new-run');
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-subtle transition-colors hover:bg-accent/50 hover:text-dim"
          >
            <Plus className="h-3 w-3" />
            New Run
          </button>
        </div>
      )}
    </div>
  );
}

function ArchivedSection({ campaigns }: { campaigns: Campaign[] }) {
  const unarchive = trpc.campaigns.unarchive.useMutation();
  const utils = trpc.useUtils();

  const grouped = useMemo(() => {
    const groups: Record<string, Campaign[]> = {};
    for (const c of campaigns) {
      const group = relativeTimeGroup(c.archived_at);
      (groups[group] ??= []).push(c);
    }
    const order = ['Today', 'Yesterday', 'This week', 'Last month', 'Older', 'Unknown'];
    return order
      .filter((g) => groups[g])
      .map((g) => ({ label: g, items: groups[g] }));
  }, [campaigns]);

  const handleUnarchive = (campaignId: string) => {
    unarchive.mutate(
      { campaignId },
      { onSuccess: () => utils.campaigns.list.invalidate() },
    );
  };

  return (
    <>
      <Separator className="my-3 bg-border" />
      <div className="px-2 pb-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-subtle">
          <Archive className="h-3 w-3" />
          History
        </span>
      </div>
      {grouped.map(({ label, items }) => (
        <div key={label} className="mb-2">
          <p className="px-4 py-0.5 text-[10px] font-medium uppercase tracking-wider text-faint">
            {label}
          </p>
          <div className="space-y-0.5">
            {items.map((campaign) => (
              <div key={campaign.id} className="group relative">
                <CampaignItem campaign={campaign} />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnarchive(campaign.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Unarchive"
                >
                  <ArchiveRestore className="h-3.5 w-3.5 text-subtle hover:text-dim" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function Sidebar() {
  const setView = useAppStore((s) => s.setView);
  const campaigns = trpc.campaigns.list.useQuery();

  const allCampaigns = campaigns.data ?? [];
  const activeCampaigns = allCampaigns.filter((c) => !c.archived);
  const archivedCampaigns = allCampaigns.filter((c) => c.archived);

  return (
    <aside className="flex h-full flex-col bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-base font-semibold tracking-tight">Multiplexer</h1>
      </div>

      <div className="px-3 pb-2">
        <button
          onClick={() => setView('new-campaign')}
          className="flex items-center gap-2 px-2 py-1.5 w-full text-sm font-medium text-muted-foreground hover:text-foreground bg-accent/40 hover:bg-accent/60 rounded-md transition-colors"
        >
          <Plus className="size-3" />
          New Campaign
        </button>
      </div>

      <Separator className="bg-border" />

      {/* Campaign list */}
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-0.5">
          {activeCampaigns.map((campaign) => (
            <CampaignItem key={campaign.id} campaign={campaign} />
          ))}
        </div>

        {archivedCampaigns.length > 0 && (
          <ArchivedSection campaigns={archivedCampaigns} />
        )}
      </ScrollArea>

      {/* Footer — Superset-inspired */}
      <SidebarFooter />
    </aside>
  );
}
