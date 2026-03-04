import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';

export function ResultsTable({ runId }: { runId: string }) {
  const run = trpc.runs.get.useQuery({ runId });
  const selectCompound = useAppStore((s) => s.selectCompound);

  if (run.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!run.data) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Run not found
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b border-border">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Status</th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">Compound</th>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">SMILES</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Binding</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">Optimization</th>
          </tr>
        </thead>
        <tbody>
          {run.data.compounds.map((compound) => (
            <tr
              key={compound.id}
              onClick={() => selectCompound(compound.id)}
              className="border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors"
            >
              <td className="px-4 py-2">
                <StatusBadge status={compound.status} />
              </td>
              <td className="px-4 py-2">{compound.display_name}</td>
              <td className="px-4 py-2 max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                {compound.smiles}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {compound.metrics?.affinity.binding_confidence.toFixed(3) ?? '—'}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {compound.metrics?.affinity.optimization_score.toFixed(3) ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'text-emerald-500',
    RUNNING: 'text-blue-400',
    CREATED: 'text-blue-400',
    PENDING: 'text-muted-foreground',
    FAILED: 'text-red-400',
    TIMED_OUT: 'text-amber-400',
    CANCELLED: 'text-muted-foreground',
  };

  return (
    <span className={`text-xs font-medium ${styles[status] ?? 'text-muted-foreground'}`}>
      {status}
    </span>
  );
}
