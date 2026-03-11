import { useState } from 'react';
import { X, RotateCcw, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { MoleculeImage } from './MoleculeImage';
import { MolStarViewer } from './MolStarViewer';
import { MolStarErrorBoundary } from './MolStarErrorBoundary';
import { PaeImage } from './PaeImage';

export function CompoundDetail({ compoundId }: { compoundId: string }) {
  const selectCompound = useAppStore((s) => s.selectCompound);
  const selectedSampleIndex = useAppStore((s) => s.selectedSampleIndex);
  const setSampleIndex = useAppStore((s) => s.setSampleIndex);
  const compound = trpc.compounds.get.useQuery({ compoundId });
  const retryMutation = trpc.compounds.retry.useMutation();

  const [showAllMetrics, setShowAllMetrics] = useState(false);

  if (compound.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!compound.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Compound not found
      </div>
    );
  }

  const c = compound.data;
  const isRetryable = c.status === 'FAILED' || c.status === 'TIMED_OUT';
  const samples = c.metrics?.samples ?? [];
  const hasMultipleSamples = samples.length > 1;
  const sampleIndex = samples.length > 0 ? Math.min(selectedSampleIndex, samples.length - 1) : 0;
  const currentSample = samples[sampleIndex] ?? null;

  return (
    <div className="flex h-full flex-col overflow-auto border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold truncate">{c.display_name}</h2>
        <div className="flex items-center gap-1">
          {isRetryable && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => retryMutation.mutate({ compoundId: c.id })}
              disabled={retryMutation.isPending}
              title="Retry prediction"
            >
              <RotateCcw className={cn("h-3.5 w-3.5", retryMutation.isPending && "animate-spin")} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => selectCompound(null)}
            className="text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Molecule image */}
        <MoleculeImage smiles={c.smiles} className="h-40" />

        {/* Sample/Pose selector */}
        {hasMultipleSamples && (
          <Tabs value={String(sampleIndex)} onValueChange={(v) => setSampleIndex(Number(v))}>
            <TabsList variant="line">
              {samples.map((_, i) => (
                <TabsTrigger key={i} value={String(i)}>Pose {i + 1}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {/* 3D Structure */}
        {c.status === 'COMPLETED' && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">3D Structure</p>
            <MolStarErrorBoundary>
              <MolStarViewer compoundId={c.id} sampleIndex={sampleIndex} />
            </MolStarErrorBoundary>
          </div>
        )}

        {/* Status */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <p className="text-sm">{c.status}</p>
        </div>

        {/* Affinity Metrics */}
        {c.metrics?.affinity && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Affinity</p>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Binding Confidence" value={c.metrics.affinity.binding_confidence} />
              <MetricCard label="Optimization Score" value={c.metrics.affinity.optimization_score} />
            </div>
          </div>
        )}

        {/* Prediction Metrics */}
        {currentSample && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Prediction Metrics</p>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Structure Confidence" value={currentSample.structure_confidence} />
              <MetricCard label="Ligand iPTM" value={currentSample.ligand_iptm} />
              <MetricCard label="Complex pLDDT" value={currentSample.complex_plddt} />
              <MetricCard label="iPTM" value={currentSample.iptm} />
            </div>

            {/* Toggle for additional metrics */}
            <button
              onClick={() => setShowAllMetrics((s) => !s)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className={cn("h-3 w-3 transition-transform", showAllMetrics && "rotate-90")} />
              {showAllMetrics ? 'Hide' : 'Show'} additional metrics
            </button>

            {showAllMetrics && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="PTM" value={currentSample.ptm} />
                <MetricCard label="Protein iPTM" value={currentSample.protein_iptm} />
                <MetricCard label="Complex iPLDDT" value={currentSample.complex_iplddt} />
                <MetricCard label="Complex PDE" value={currentSample.complex_pde} />
                <MetricCard label="Complex iPDE" value={currentSample.complex_ipde} />
              </div>
            )}
          </div>
        )}

        {/* PAE Plot */}
        {c.status === 'COMPLETED' && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">PAE Plot</p>
            <PaeImage compoundId={c.id} sampleIndex={sampleIndex} />
          </div>
        )}

        {/* Error */}
        {c.error_message && (
          <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3">
            <p className="text-xs text-red-400">{c.error_message}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-foreground">
        {value != null ? value.toFixed(2) : '—'}
      </p>
    </div>
  );
}
