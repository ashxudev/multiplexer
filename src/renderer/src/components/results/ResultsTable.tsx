import { useEffect, useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

type SortColumn = 'status' | 'compound' | 'confidence' | 'complex_plddt' | 'iptm' | 'ptm' | 'binding_confidence' | 'optimization_score';

export function ResultsTable({ runId, targetType = 'protein' }: { runId: string; targetType?: string }) {
  const run = trpc.runs.get.useQuery({ runId });
  const selectCompound = useAppStore((s) => s.selectCompound);

  const showAffinity = targetType === 'protein';

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (!showAffinity && (sortColumn === 'binding_confidence' || sortColumn === 'optimization_score')) {
      setSortColumn(null);
    }
  }, [showAffinity, sortColumn]);

  const sortedCompounds = useMemo(() => {
    const compounds = run.data?.compounds ?? [];
    if (!sortColumn) return compounds;

    return [...compounds].sort((a, b) => {
      let aVal: string | number | null;
      let bVal: string | number | null;

      switch (sortColumn) {
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'compound':
          aVal = a.display_name;
          bVal = b.display_name;
          break;
        case 'confidence':
          aVal = a.metrics?.samples[0]?.structure_confidence ?? null;
          bVal = b.metrics?.samples[0]?.structure_confidence ?? null;
          break;
        case 'complex_plddt':
          aVal = a.metrics?.samples[0]?.complex_plddt ?? null;
          bVal = b.metrics?.samples[0]?.complex_plddt ?? null;
          break;
        case 'iptm':
          aVal = a.metrics?.samples[0]?.iptm ?? null;
          bVal = b.metrics?.samples[0]?.iptm ?? null;
          break;
        case 'ptm':
          aVal = a.metrics?.samples[0]?.ptm ?? null;
          bVal = b.metrics?.samples[0]?.ptm ?? null;
          break;
        case 'binding_confidence':
          aVal = a.metrics?.affinity?.binding_confidence ?? null;
          bVal = b.metrics?.affinity?.binding_confidence ?? null;
          break;
        case 'optimization_score':
          aVal = a.metrics?.affinity?.optimization_score ?? null;
          bVal = b.metrics?.affinity?.optimization_score ?? null;
          break;
      }

      // Nulls always sort to bottom
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [run.data?.compounds, sortColumn, sortDir]);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('desc');
    }
  };

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
            <SortHeader column="status" label="Status" align="left" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="compound" label="Compound" align="left" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">SMILES</th>
            {showAffinity && (
              <>
                <SortHeader column="binding_confidence" label={<span className="text-left">Binding<br/>Confidence</span>} align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
                <SortHeader column="optimization_score" label={<span className="text-left">Optimization<br/>Score</span>} align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
              </>
            )}
            <SortHeader column="confidence" label={<span className="text-left">Structure<br/>Confidence</span>} align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="complex_plddt" label="pLDDT" align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="iptm" label="ipTM" align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="ptm" label="pTM" align="center" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedCompounds.map((compound) => {
            const confidence = compound.metrics?.samples[0]?.structure_confidence ?? null;
            const complexPlddt = compound.metrics?.samples[0]?.complex_plddt ?? null;
            const iptm = compound.metrics?.samples[0]?.iptm ?? null;
            const ptm = compound.metrics?.samples[0]?.ptm ?? null;
            const bindingConf = compound.metrics?.affinity?.binding_confidence ?? null;
            const optScore = compound.metrics?.affinity?.optimization_score ?? null;

            return (
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
                {showAffinity && (
                  <>
                    <td className="px-4 py-2 text-center tabular-nums text-foreground">
                      {bindingConf != null ? bindingConf.toFixed(2) : '—'}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-foreground">
                      {optScore != null ? optScore.toFixed(2) : '—'}
                    </td>
                  </>
                )}
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {confidence != null ? confidence.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {complexPlddt != null ? complexPlddt.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {iptm != null ? iptm.toFixed(2) : '—'}
                </td>
                <td className="px-4 py-2 text-center tabular-nums text-foreground">
                  {ptm != null ? ptm.toFixed(2) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SortHeader({
  column,
  label,
  align,
  activeColumn,
  sortDir,
  onSort,
}: {
  column: SortColumn;
  label: React.ReactNode;
  align: 'left' | 'right' | 'center';
  activeColumn: SortColumn | null;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortColumn) => void;
}) {
  const isActive = activeColumn === column;
  const Icon = isActive ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <th className={cn("px-4 py-2 font-medium text-muted-foreground", { 'text-right': align === 'right', 'text-left': align === 'left', 'text-center': align === 'center' })}>
      <button
        onClick={() => onSort(column)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", align === 'center' && "mx-auto")}
      >
        {label}
        <Icon className={cn("h-3 w-3", !isActive && "opacity-40")} />
      </button>
    </th>
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
