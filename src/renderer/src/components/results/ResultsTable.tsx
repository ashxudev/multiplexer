import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Download, Pencil } from 'lucide-react';
import Papa from 'papaparse';
import { trpc } from '@/api/trpc';
import { useAppStore } from '@/stores/useAppStore';
import { cn } from '@/lib/utils';

type SortColumn = 'status' | 'compound' | 'confidence' | 'complex_plddt' | 'iptm' | 'ptm' | 'binding_confidence' | 'optimization_score';

export function ResultsTable({
  runId,
  targetType = 'protein',
  campaignName = '',
}: {
  runId: string;
  targetType?: string;
  campaignName?: string;
}) {
  const run = trpc.runs.get.useQuery({ runId });
  const selectCompound = useAppStore((s) => s.selectCompound);
  const selectedCompoundId = useAppStore((s) => s.selectedCompoundId);
  const exportCsv = trpc.actions.exportCsv.useMutation();
  const renameMutation = trpc.runs.rename.useMutation();
  const utils = trpc.useUtils();

  const showAffinity = targetType === 'protein';

  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Inline run-name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameCancelledRef = useRef(false);

  const startEditingName = () => {
    if (!run.data) return;
    nameCancelledRef.current = false;
    setEditName(run.data.display_name);
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };

  const saveName = async () => {
    if (nameCancelledRef.current) return;
    if (!run.data || !editName.trim() || editName.trim() === run.data.display_name) {
      setIsEditingName(false);
      return;
    }
    try {
      await renameMutation.mutateAsync({ runId, newName: editName.trim() });
      await utils.runs.get.invalidate({ runId });
      await utils.campaigns.list.invalidate();
    } catch {
      // mutation error surfaced by renameMutation.error if needed
    }
    setIsEditingName(false);
  };

  const cancelEditName = () => {
    nameCancelledRef.current = true;
    setIsEditingName(false);
  };

  // Auto-select the first compound when the run first loads.
  // Uses a ref to avoid re-selecting after the user closes the detail panel.
  const hasAutoSelected = useRef(false);
  useEffect(() => { hasAutoSelected.current = false; }, [runId]);
  useEffect(() => {
    const compounds = run.data?.compounds;
    if (compounds?.length && !hasAutoSelected.current) {
      hasAutoSelected.current = true;
      selectCompound(compounds[0].id);
    }
  }, [run.data?.compounds, selectCompound]);

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

  const handleExportCsv = useCallback(() => {
    if (!run.data) return;

    const runName = run.data.display_name;

    // Column headers
    const headers = [
      'Name', 'SMILES', 'Status',
      'Structure Confidence', 'Complex pLDDT', 'ipTM', 'pTM',
    ];
    if (showAffinity) headers.push('Binding Confidence', 'Optimization Score');

    // Build rows using current sort order
    const fmt = (v: number | null | undefined): string | null => v != null ? v.toFixed(2) : null;
    const rows = sortedCompounds.map((compound) => {
      const sample = compound.metrics?.samples[0] ?? null;
      const affinity = compound.metrics?.affinity ?? null;

      const row: (string | number | null)[] = [
        compound.display_name,
        compound.smiles,
        compound.status,
        fmt(sample?.structure_confidence),
        fmt(sample?.complex_plddt),
        fmt(sample?.iptm),
        fmt(sample?.ptm),
      ];
      if (showAffinity) {
        row.push(fmt(affinity?.binding_confidence), fmt(affinity?.optimization_score));
      }
      return row;
    });

    const fullCsv = Papa.unparse({ fields: headers, data: rows });

    // Sanitized default filename
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 50);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '_');
    const defaultFilename = `${sanitize(campaignName)}_${sanitize(runName)}_${dateStr}.csv`;

    exportCsv.mutate({ csvContent: fullCsv, defaultFilename });
  }, [run.data, sortedCompounds, showAffinity, campaignName, exportCsv]);

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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          {isEditingName ? (
            <input
              ref={nameInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') cancelEditName();
              }}
              onBlur={saveName}
              className="text-sm font-medium bg-transparent outline-none rounded-md border border-ring ring-ring/50 ring-[3px] px-1.5 py-0.5 -ml-1.5 w-full"
              autoFocus
            />
          ) : (
            <button
              onClick={startEditingName}
              className="group flex items-center gap-1.5 max-w-full text-sm font-medium text-muted-foreground hover:text-foreground rounded-md px-1.5 py-0.5 -ml-1.5 transition-colors hover:bg-accent/50"
            >
              <span className="truncate">{run.data.display_name}</span>
              <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exportCsv.isPending || !run.data?.compounds.length}
          className="flex shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          <Download className="size-3" />
          Export CSV
        </button>
      </div>
      <div className="flex-1 overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background border-b border-border">
          <tr>
            <SortHeader column="status" label="Status" align="left" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <SortHeader column="compound" label="Compound" align="left" activeColumn={sortColumn} sortDir={sortDir} onSort={handleSort} />
            <th className="px-4 py-2 text-left font-medium text-foreground">SMILES</th>
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
                className={cn(
                  "border-b border-border/50 cursor-pointer hover:bg-muted/50 transition-colors",
                  selectedCompoundId === compound.id && "bg-muted/50"
                )}
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
    <th className={cn("px-4 py-2 font-medium text-foreground", { 'text-right': align === 'right', 'text-left': align === 'left', 'text-center': align === 'center' })}>
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
