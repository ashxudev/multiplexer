import { useMemo } from "react";
import { RefreshCw, X, ExternalLink, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";
import { MoleculeImage } from "@/components/MoleculeImage";
import { PaeImage } from "@/components/PaeImage";
import { MolStarViewer } from "@/components/MolStarViewer";
import { MolStarErrorBoundary } from "@/components/MolStarErrorBoundary";
import * as api from "@/lib/tauri-api";

function MetricCard({
  label,
  value,
  className,
}: {
  label: string;
  value: number | undefined | null;
  className?: string;
}) {
  return (
    <Card className={cn("border-zinc-800 bg-zinc-900 py-3", className)}>
      <CardContent className="px-3 py-0">
        <p className="text-xs text-zinc-500">{label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums">
          {value != null ? value.toFixed(3) : "--"}
        </p>
      </CardContent>
    </Card>
  );
}

export function CompoundDetail() {
  const campaigns = useAppStore((s) => s.campaigns);
  const selectedCampaignId = useAppStore((s) => s.selectedCampaignId);
  const selectedRunId = useAppStore((s) => s.selectedRunId);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const selectedSampleIndex = useAppStore((s) => s.selectedSampleIndex);
  const setSelectedSampleIndex = useAppStore((s) => s.setSelectedSampleIndex);

  const compound = useMemo(() => {
    const campaign = campaigns.find((c) => c.id === selectedCampaignId);
    const run = campaign?.runs.find((r) => r.id === selectedRunId);
    return run?.compounds.find((c) => c.id === selectedCompoundId);
  }, [campaigns, selectedCampaignId, selectedRunId, selectedCompoundId]);

  if (!compound) return null;

  const metrics = compound.metrics;
  const samples = metrics?.samples ?? [];
  const currentSample = samples[selectedSampleIndex];

  return (
    <div className="flex h-full w-96 shrink-0 flex-col border-l border-zinc-800 bg-zinc-950">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{compound.display_name}</h3>
          <p
            className="mt-0.5 truncate font-mono text-xs text-zinc-500"
            title={compound.smiles}
          >
            {compound.smiles}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={closeSidebar}
          className="ml-2 shrink-0 text-zinc-500 hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* Molecule image placeholder */}
          <MoleculeImage smiles={compound.smiles} className="h-32" />

          {/* Affinity metrics */}
          <div>
            <h4 className="mb-2 text-xs font-medium text-zinc-400">Affinity</h4>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard
                label="Binding Confidence"
                value={metrics?.affinity.binding_confidence}
              />
              <MetricCard
                label="Opt. Score"
                value={metrics?.affinity.optimization_score}
              />
            </div>
          </div>

          <Separator className="bg-zinc-800" />

          {/* Sample selector */}
          {samples.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                Samples ({samples.length})
              </h4>
              <div className="flex gap-1">
                {samples.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedSampleIndex(i)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      i === selectedSampleIndex
                        ? "bg-zinc-700 text-zinc-100"
                        : "bg-zinc-800/50 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Per-sample metrics */}
          {currentSample && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                Sample {selectedSampleIndex + 1} Metrics
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <MetricCard
                  label="Structure Confidence"
                  value={currentSample.structure_confidence}
                />
                <MetricCard label="ipTM" value={currentSample.iptm} />
                <MetricCard
                  label="Ligand ipTM"
                  value={currentSample.ligand_iptm}
                />
                <MetricCard label="pLDDT" value={currentSample.complex_plddt} />
              </div>
            </div>
          )}

          <Separator className="bg-zinc-800" />

          {/* PAE heatmap */}
          {compound.status === "COMPLETED" && compound.filesReady === true && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                PAE Heatmap
              </h4>
              <PaeImage
                compoundId={compound.id}
                sampleIndex={selectedSampleIndex}
              />
            </div>
          )}

          {/* 3D Structure viewer */}
          {compound.status === "COMPLETED" && compound.filesReady === true && (
            <div>
              <h4 className="mb-2 text-xs font-medium text-zinc-400">
                3D Structure
              </h4>
              <MolStarErrorBoundary>
                <MolStarViewer
                  key={`${compound.id}-${selectedSampleIndex}`}
                  compoundId={compound.id}
                  sampleIndex={selectedSampleIndex}
                />
              </MolStarErrorBoundary>
            </div>
          )}

          <Separator className="bg-zinc-800" />

          {/* Download error (compound completed but files unavailable) */}
          {compound.download_error && (
            <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3">
              <p className="text-xs font-medium text-amber-400">Download issue</p>
              <p className="mt-1 text-xs text-amber-300/80">
                {compound.download_error}
              </p>
            </div>
          )}

          {/* Error message */}
          {compound.error_message && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
              <p className="text-xs font-medium text-red-400">Error</p>
              <p className="mt-1 text-xs text-red-300/80">
                {compound.error_message}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {(compound.status === "FAILED" ||
              compound.status === "TIMED_OUT" ||
              compound.status === "CANCELLED") && (
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-800 text-zinc-400"
                onClick={() => api.retryCompound(compound.id).catch(console.error)}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-zinc-800 text-zinc-400"
                onClick={() => api.openInFinder(compound.id).catch(console.error)}
                disabled={!(compound.status === "COMPLETED" && compound.filesReady === true)}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
                Show in Finder
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-zinc-800 text-zinc-400"
                onClick={() =>
                  api
                    .openStructureExternal(compound.id, selectedSampleIndex)
                    .catch(console.error)
                }
                disabled={!(compound.status === "COMPLETED" && compound.filesReady === true)}
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open Externally
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
