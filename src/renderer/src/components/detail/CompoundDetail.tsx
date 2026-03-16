import { useState, useEffect, useCallback } from 'react';
import { Info, X, RotateCcw, Maximize, Minimize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';
import { MoleculeImage } from './MoleculeImage';
import { MolStarViewer } from './MolStarViewer';
import { MolStarErrorBoundary } from './MolStarErrorBoundary';
import { useStructureTheme } from '@/hooks/useStructureTheme';

export function CompoundDetail({ compoundId }: { compoundId: string }) {
  const selectCompound = useAppStore((s) => s.selectCompound);
  const selectedSampleIndex = useAppStore((s) => s.selectedSampleIndex);
  const setSampleIndex = useAppStore((s) => s.setSampleIndex);
  const compound = trpc.compounds.get.useQuery({ compoundId });
  const retryMutation = trpc.compounds.retry.useMutation();
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const { resolved: structureMode } = useStructureTheme();
  const viewerIconClass = structureMode === 'dark'
    ? 'text-white/50 hover:text-white'
    : 'text-black/30 hover:text-black';

  const closeFullscreen = useCallback(() => setViewerExpanded(false), []);
  useEffect(() => {
    if (!viewerExpanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeFullscreen();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [viewerExpanded, closeFullscreen]);

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
    <div className="flex h-full flex-col bg-background">
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

      {/* Fullscreen 3D viewer overlay */}
      {viewerExpanded && c.status === 'COMPLETED' && (
        <div className="fixed top-12 inset-x-0 bottom-0 z-50 bg-background p-4">
          <MolStarErrorBoundary>
            <MolStarViewer
              compoundId={c.id}
              sampleIndex={sampleIndex}
              className="h-full"
            />
          </MolStarErrorBoundary>
          <button
            onClick={() => setViewerExpanded(false)}
            className={`absolute right-6 top-6 z-10 transition-colors outline-none ${viewerIconClass}`}
            title="Exit fullscreen"
          >
            <Minimize className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {/* Sample/Pose selector */}
        {hasMultipleSamples && (
          <div className="px-4 pt-4">
            <Tabs value={String(sampleIndex)} onValueChange={(v) => setSampleIndex(Number(v))}>
              <TabsList variant="line">
                {samples.map((_, i) => (
                  <TabsTrigger key={i} value={String(i)}>Pose {i + 1}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        <div className="space-y-4 px-4 py-4">
            {/* 3D Structure */}
            {!viewerExpanded && c.status === 'COMPLETED' && (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium">3D Structure</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                        <p>Colored by per-residue pLDDT (predicted Local Distance Difference Test).</p>
                        <ul className="mt-1 list-none space-y-0.5 pl-0">
                          <li><span className="font-semibold" style={{ color: '#0053D6' }}>Dark blue</span> ({'>'}90): Very high confidence</li>
                          <li><span className="font-semibold" style={{ color: '#65CBF3' }}>Light blue</span> (70–90): Confident</li>
                          <li><span className="font-semibold" style={{ color: '#CCAD00' }}>Yellow</span> (50–70): Low confidence</li>
                          <li><span className="font-semibold" style={{ color: '#FF7D45' }}>Orange</span> ({'<'}50): Very low confidence</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="relative">
                  <MolStarErrorBoundary>
                    <MolStarViewer
                      compoundId={c.id}
                      sampleIndex={sampleIndex}
                      className="h-80"
                    />
                  </MolStarErrorBoundary>
                  <button
                    onClick={() => setViewerExpanded(true)}
                    className={`absolute right-2 top-2 transition-colors outline-none ${viewerIconClass}`}
                    title="Fullscreen viewer"
                  >
                    <Maximize className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Boltz Prediction Properties */}
            {(c.metrics?.affinity || currentSample) && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Boltz Prediction Properties</p>
                <div className="rounded-md border border-border bg-surface p-4 space-y-2">
                  {c.metrics?.affinity && (
                    <>
                      <MetricRow
                        label="Binding confidence"
                        value={c.metrics.affinity.binding_confidence}
                        tooltip="Used to detect binders from decoys, for example in a hit-discovery stage. Values range from 0 (unlikely to bind) to 1 (likely binder)"
                      />
                      <MetricRow
                        label="Optimization score"
                        value={c.metrics.affinity.optimization_score}
                        tooltip="Measures the strength of binding in the context of hit optimization. Higher values indicate stronger binding"
                      />
                    </>
                  )}
                  {currentSample && (
                    <>
                      <MetricRow
                        label="Structure confidence"
                        value={currentSample.structure_confidence}
                        tooltip="Measures the confidence of the predicted structure. Values range from 0 (low confidence) to 1 (high confidence)"
                      />
                      <MetricRow
                        label="Complex pLDDT"
                        value={currentSample.complex_plddt}
                        tooltip="Average predicted local distance difference test score for the complex"
                      />
                      <MetricRow
                        label="ipTM"
                        value={currentSample.iptm}
                        tooltip="Interface predicted TM-score. Measures the confidence of interface contacts between chains"
                      />
                      <MetricRow
                        label="pTM"
                        value={currentSample.ptm}
                        tooltip="Predicted TM-score. Measures overall confidence in the predicted structure"
                      />
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 2D Molecule image */}
            <div className="space-y-1">
              <p className="text-sm font-medium">2D Structure</p>
              <div className="flex justify-center">
                <div className="inline-flex rounded-md border border-border overflow-hidden">
                  <MoleculeImage smiles={c.smiles} className="max-h-32" />
                </div>
              </div>
            </div>

            {/* Error */}
            {c.error_message && (
              <div className="rounded-md border bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900/50 p-3">
                <p className="text-xs text-red-600 dark:text-red-400">{c.error_message}</p>
              </div>
            )}
          </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value, tooltip }: { label: string; value: number | null; tooltip: string }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="font-semibold tabular-nums">
        {value != null ? value.toFixed(2) : '—'}
      </span>
    </div>
  );
}
