import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';
import { MoleculeImage } from './MoleculeImage';

export function CompoundDetail({ compoundId }: { compoundId: string }) {
  const selectCompound = useAppStore((s) => s.selectCompound);
  const compound = trpc.compounds.get.useQuery({ compoundId });

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

  return (
    <div className="flex h-full flex-col overflow-auto border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold truncate">{c.display_name}</h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => selectCompound(null)}
          className="text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Molecule image */}
        <MoleculeImage smiles={c.smiles} className="h-40" />

        {/* Status */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <p className="text-sm">{c.status}</p>
        </div>

        {/* Metrics */}
        {c.metrics && (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Binding Confidence"
              value={c.metrics.affinity.binding_confidence}
            />
            <MetricCard
              label="Optimization Score"
              value={c.metrics.affinity.optimization_score}
            />
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

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value.toFixed(3)}</p>
    </div>
  );
}
