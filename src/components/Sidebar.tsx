import {
  ChevronRight,
  FlaskConical,
  Plus,
  Settings,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAppStore, type Run, type Campaign } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import * as api from "@/lib/tauri-api";

function relativeTimeGroup(dateStr: string | null): string {
  if (!dateStr) return "Unknown";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This week";
  if (diffDays < 30) return "Last month";
  return "Older";
}

function RunProgressSummary({ run }: { run: Run }) {
  const completed = run.compounds.filter((c) => c.status === "COMPLETED").length;
  const running = run.compounds.filter(
    (c) => c.status === "RUNNING" || c.status === "CREATED"
  ).length;
  const failed = run.compounds.filter(
    (c) => c.status === "FAILED" || c.status === "TIMED_OUT" || c.status === "CANCELLED"
  ).length;
  const total = run.compounds.length;

  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
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
      <span className="text-zinc-600">/{total}</span>
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
  const setMainView = useAppStore((s) => s.setMainView);

  const isExpanded = expandedCampaignIds.has(campaign.id);
  const isSelected = selectedCampaignId === campaign.id;
  const activeRuns = campaign.runs.filter((r) => !r.archived);

  return (
    <div>
      <button
        onClick={() => {
          selectCampaign(campaign.id);
          // Auto-expand on select, but never collapse
          if (!expandedCampaignIds.has(campaign.id)) {
            toggleCampaignExpanded(campaign.id);
          }
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-800",
          isSelected && "bg-zinc-800/50"
        )}
      >
        <ChevronRight
          onClick={(e) => {
            e.stopPropagation();
            toggleCampaignExpanded(campaign.id);
          }}
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-zinc-500 transition-transform cursor-pointer hover:text-zinc-300",
            isExpanded && "rotate-90"
          )}
        />
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        <span className="truncate font-medium">{campaign.display_name}</span>
      </button>

      {isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-zinc-800 pl-3">
          {activeRuns.map((run) => (
            <button
              key={run.id}
              onClick={() => selectRun(campaign.id, run.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-zinc-800",
                selectedRunId === run.id && "bg-zinc-800 text-zinc-100"
              )}
            >
              <span className="truncate text-zinc-300">{run.display_name}</span>
              <RunProgressSummary run={run} />
            </button>
          ))}
          <button
            onClick={() => {
              selectCampaign(campaign.id);
              setMainView("new-run");
            }}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
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
  const unarchiveCampaignLocal = useAppStore((s) => s.unarchiveCampaignLocal);

  const grouped = useMemo(() => {
    const groups: Record<string, Campaign[]> = {};
    for (const c of campaigns) {
      const group = relativeTimeGroup(c.archived_at);
      (groups[group] ??= []).push(c);
    }
    // Return in chronological order
    const order = ["Today", "Yesterday", "This week", "Last month", "Older", "Unknown"];
    return order
      .filter((g) => groups[g])
      .map((g) => ({ label: g, items: groups[g] }));
  }, [campaigns]);

  const handleUnarchive = async (campaignId: string) => {
    try {
      await api.unarchiveCampaign(campaignId);
      unarchiveCampaignLocal(campaignId);
    } catch {
      // fallback: just update local state
      unarchiveCampaignLocal(campaignId);
    }
  };

  return (
    <>
      <Separator className="my-3 bg-zinc-800" />
      <div className="px-2 pb-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <Archive className="h-3 w-3" />
          History
        </span>
      </div>
      {grouped.map(({ label, items }) => (
        <div key={label} className="mb-2">
          <p className="px-4 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
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
                  <ArchiveRestore className="h-3.5 w-3.5 text-zinc-500 hover:text-zinc-300" />
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
  const campaigns = useAppStore((s) => s.campaigns);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const addCampaign = useAppStore((s) => s.addCampaign);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignSeq, setNewCampaignSeq] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const seqInputRef = useRef<HTMLInputElement>(null);

  const activeCampaigns = campaigns.filter((c) => !c.archived);
  const archivedCampaigns = campaigns.filter((c) => c.archived);

  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim() || !newCampaignSeq.trim() || submitting) return;
    setSubmitting(true);
    try {
      const campaign = await api.createCampaign(
        newCampaignName.trim(),
        newCampaignSeq.trim()
      );
      addCampaign(campaign);
    } catch {
      // Not in Tauri — add mock campaign
      addCampaign({
        id: crypto.randomUUID(),
        display_name: newCampaignName.trim(),
        folder_name: newCampaignName.trim().toLowerCase().replace(/\s+/g, "-"),
        protein_sequence: newCampaignSeq.trim(),
        description: null,
        archived: false,
        archived_at: null,
        created_at: new Date().toISOString(),
        runs: [],
      });
    }
    setNewCampaignName("");
    setNewCampaignSeq("");
    setCreatingCampaign(false);
    setSubmitting(false);
  };

  return (
    <aside className="flex h-full w-66 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <h1 className="text-base font-semibold tracking-tight">Multiplexer</h1>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setSettingsOpen(true)}
          className="text-zinc-500 hover:text-zinc-300"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-3 pb-2">
        {creatingCampaign ? (
          <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900 p-2">
            <Input
              placeholder="Campaign name"
              value={newCampaignName}
              onChange={(e) => setNewCampaignName(e.target.value)}
              className="h-7 border-zinc-700 bg-zinc-800 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") seqInputRef.current?.focus();
                if (e.key === "Escape") setCreatingCampaign(false);
              }}
            />
            <Input
              ref={seqInputRef}
              placeholder="Protein sequence"
              value={newCampaignSeq}
              onChange={(e) => setNewCampaignSeq(e.target.value)}
              className="h-7 border-zinc-700 bg-zinc-800 font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateCampaign();
                if (e.key === "Escape") setCreatingCampaign(false);
              }}
            />
            <div className="flex gap-1">
              <Button size="sm" className="h-6 flex-1 text-xs" onClick={handleCreateCampaign} disabled={submitting}>
                Create
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-zinc-500"
                onClick={() => setCreatingCampaign(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 border-zinc-800 text-zinc-400 hover:text-zinc-200"
            onClick={() => setCreatingCampaign(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Campaign
          </Button>
        )}
      </div>

      <Separator className="bg-zinc-800" />

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

      {/* Footer */}
      <div className="border-t border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          <Clock className="h-3 w-3" />
          <span>v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
